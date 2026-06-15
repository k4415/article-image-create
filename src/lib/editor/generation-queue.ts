import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAssetRows } from "@/lib/assets/normalize";
import { getAssetPublicUrl } from "@/lib/assets/public-url";
import { getServerEnv, type AppEnv } from "@/lib/config/env";
import type {
  AssetWithAnnotation,
  GeneratedImageRecord,
  GeneratedImageStatus,
  ImageGenerationBatchRecord,
} from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { insertMarkdownImagesAfterLines } from "./article-text";
import {
  normalizeTargetLineIndexes,
  runWithConcurrency,
  summarizeGenerationProgress,
  type ImageGenerationStatus,
} from "./batch";
import { validateAdditionalImageType, validateImageGenerationLimits } from "./generation-limits";
import {
  buildFinalImagePrompt,
  chooseImageGenerationEndpoint,
  createImagePromptPlan,
  generateImageBytes,
  resolveImageOutputSize,
  type ImageInputForGeneration,
} from "./image-generation";
import { buildEffectiveAdditionalInstruction, buildRevisionImageInputPaths } from "./revision";
import { DEFAULT_EDITOR_PROJECT_TITLE, normalizeEditorState } from "./sessions";
import type {
  EditorImageBlock,
  GeneratedImage,
  ImageGenerationBatchResponse,
  ImageGenerationHistoryItem,
  ImageGenerationHistoryResponse,
  ImageGenerationReferenceAsset,
  ImagePromptPlan,
} from "./types";

const SUPPORTED_INPUT_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ACTIVE_GENERATION_STATUSES: GeneratedImageStatus[] = ["queued", "planning", "generating", "uploading"];

type EditorSessionRow = {
  id: string;
  title: string;
  article_text: string;
  image_blocks: EditorImageBlock[] | null;
  editor_state?: Record<string, unknown> | null;
  last_saved_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type GenerationQueueForm = {
  sessionId: string;
  articleText: string;
  targetLineIndexes: number[];
  referenceAssetIds: string[];
  additionalInstruction: string;
  size: string;
  quality: string;
  additionalImages: File[];
};

type CreateBatchInput = Omit<GenerationQueueForm, "additionalImages"> & {
  additionalImages: File[];
};

type RevisionQueueForm = {
  articleText: string;
  revisionInstruction: string;
  size: string;
  quality: string;
  additionalImages: File[];
};

type CreateRevisionInput = RevisionQueueForm & {
  generationId: string;
};

function getFormString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

function getFormStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function getFormNumbers(formData: FormData, key: string) {
  return getFormStrings(formData, key).map((value) => Number.parseInt(value, 10));
}

function getUploadedFiles(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

function sanitizeStorageName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "image.png";
}

function assertSupportedInputImage(mimeType: string, label: string) {
  if (!SUPPORTED_INPUT_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`${label}はPNG/JPEG/WebPのみ利用できます`);
  }
}

function inferMimeTypeFromStoragePath(storagePath: string) {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function selectedLineText(articleText: string, lineIndex: number) {
  return articleText.split("\n")[lineIndex] ?? "";
}

function generationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "画像生成に失敗しました";
}

export function imageGenerationErrorStatus(error: unknown) {
  const maybe = error as { status?: number; code?: string } | null;
  if (maybe?.code === "moderation_blocked") return 400;
  if (typeof maybe?.status === "number") return maybe.status >= 500 ? 502 : 400;
  if (error instanceof Error) {
    if (
      error.message.includes("targetLine") ||
      error.message.includes("生成対象行") ||
      error.message.includes("最大") ||
      error.message.includes("PNG/JPEG/WebP") ||
      error.message.includes("参考素材の一部")
    ) {
      return 400;
    }
  }
  return 500;
}

export function parseImageGenerationBatchForm(formData: FormData, batchLimit: number): GenerationQueueForm {
  const targetLineIndexes = getFormNumbers(formData, "targetLineIndexes");
  const legacyTargetLineIndex = getFormString(formData, "targetLineIndex");
  if (targetLineIndexes.length === 0 && legacyTargetLineIndex) {
    targetLineIndexes.push(Number.parseInt(legacyTargetLineIndex, 10));
  }

  const referenceAssetIds = getFormStrings(formData, "referenceAssetIds");
  const additionalImages = getUploadedFiles(formData, "additionalImages");
  validateImageGenerationLimits({
    referenceAssetCount: referenceAssetIds.length,
    additionalImageCount: additionalImages.length,
  });

  return {
    sessionId: getFormString(formData, "sessionId"),
    articleText: getFormString(formData, "articleText"),
    targetLineIndexes: normalizeTargetLineIndexes(targetLineIndexes, batchLimit),
    referenceAssetIds,
    additionalInstruction: getFormString(formData, "additionalInstruction"),
    size: getFormString(formData, "size", "auto"),
    quality: getFormString(formData, "quality", "low"),
    additionalImages,
  };
}

export function parseImageGenerationRevisionForm(formData: FormData): RevisionQueueForm {
  const revisionInstruction = getFormString(formData, "revisionInstruction").trim();
  if (!revisionInstruction) {
    throw new Error("修正指示を入力してください");
  }

  const additionalImages = getUploadedFiles(formData, "additionalImages");
  validateImageGenerationLimits({
    referenceAssetCount: 0,
    additionalImageCount: additionalImages.length,
  });

  return {
    articleText: getFormString(formData, "articleText"),
    revisionInstruction,
    size: getFormString(formData, "size", "auto"),
    quality: getFormString(formData, "quality", "low"),
    additionalImages,
  };
}

async function ensureEditorSession(supabase: SupabaseClient, sessionId: string, articleText: string): Promise<EditorSessionRow> {
  if (sessionId) {
    const { data, error } = await supabase
      .from("editor_sessions")
      .update({ article_text: articleText, updated_at: new Date().toISOString(), last_saved_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select("id, title, article_text, image_blocks, editor_state, last_saved_at, created_at, updated_at")
      .single();

    if (error) {
      throw new Error(`Failed to update editor session: ${error.message}`);
    }
    return data as EditorSessionRow;
  }

  const { data, error } = await supabase
    .from("editor_sessions")
    .insert({ title: DEFAULT_EDITOR_PROJECT_TITLE, article_text: articleText, image_blocks: [], editor_state: {} })
    .select("id, title, article_text, image_blocks, editor_state, last_saved_at, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(`Failed to create editor session: ${error.message}`);
  }
  return data as EditorSessionRow;
}

async function fetchReferenceAssets(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("media_assets")
    .select("*, asset_annotations(*), asset_sources(*)")
    .in("id", ids);

  if (error) {
    throw new Error(`Failed to load reference assets: ${error.message}`);
  }

  const assets = normalizeAssetRows(supabase, (data ?? []) as Array<Record<string, unknown>>);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as AssetWithAnnotation[];

  if (ordered.length !== ids.length) {
    throw new Error("選択した参考素材の一部が見つかりません");
  }

  return ordered;
}

async function fetchReferenceAssetMap(supabase: SupabaseClient, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, AssetWithAnnotation>();

  const { data, error } = await supabase
    .from("media_assets")
    .select("*, asset_annotations(*), asset_sources(*)")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(`Failed to load reference assets: ${error.message}`);
  }

  const assets = normalizeAssetRows(supabase, (data ?? []) as Array<Record<string, unknown>>);
  return new Map(assets.map((asset) => [asset.id, asset]));
}

async function downloadReferenceImage(
  supabase: SupabaseClient,
  asset: AssetWithAnnotation,
): Promise<ImageInputForGeneration> {
  const mimeType = asset.mime_type || "image/png";
  assertSupportedInputImage(mimeType, "参考画像");

  const { data, error } = await supabase.storage.from(asset.storage_bucket).download(asset.storage_path);
  if (error || !data) {
    throw new Error(`Failed to download reference image: ${error?.message ?? asset.id}`);
  }

  return {
    source: "reference",
    name: `${asset.id}.png`,
    mimeType,
    buffer: Buffer.from(await data.arrayBuffer()),
    asset,
  };
}

async function uploadAdditionalImages(params: {
  supabase: SupabaseClient;
  bucket: string;
  sessionId: string;
  files: File[];
}) {
  const storagePaths: string[] = [];

  for (const file of params.files) {
    validateAdditionalImageType(file.type);
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `editor-generations/${params.sessionId}/inputs/${crypto.randomUUID()}-${sanitizeStorageName(file.name)}`;
    const { error } = await params.supabase.storage.from(params.bucket).upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      throw new Error(`Failed to upload additional image: ${error.message}`);
    }
    storagePaths.push(storagePath);
  }

  return storagePaths;
}

async function downloadAdditionalImage(
  supabase: SupabaseClient,
  bucket: string,
  storagePath: string,
): Promise<ImageInputForGeneration> {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to download additional image: ${error?.message ?? storagePath}`);
  }

  const name = storagePath.split("/").at(-1) || "additional.png";
  const mimeType = inferMimeTypeFromStoragePath(storagePath);
  return {
    source: "additional",
    name,
    mimeType,
    buffer: Buffer.from(await data.arrayBuffer()),
  };
}

async function createGenerationBatch(params: {
  supabase: SupabaseClient;
  sessionId: string;
  articleText: string;
  targetLineIndexes: number[];
}) {
  const { data, error } = await params.supabase
    .from("image_generation_batches")
    .insert({
      session_id: params.sessionId,
      article_text_snapshot: params.articleText,
      target_line_indexes: params.targetLineIndexes,
      status: "queued",
      total_count: params.targetLineIndexes.length,
      queued_count: params.targetLineIndexes.length,
      running_count: 0,
      completed_count: 0,
      failed_count: 0,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create image generation batch: ${error?.message ?? "unknown error"}`);
  }

  return (data as { id: string }).id;
}

async function createGenerationRows(params: {
  supabase: SupabaseClient;
  batchId: string;
  sessionId: string;
  articleText: string;
  targetLineIndexes: number[];
  referenceAssetIds: string[];
  additionalImagePaths: string[];
  additionalInstruction: string;
  env: AppEnv;
  size: string;
  quality: string;
}) {
  const promptModel = params.env.OPENAI_PROMPT_MODEL || params.env.OPENAI_VISION_MODEL;
  const rows = params.targetLineIndexes.map((targetLineIndex) => ({
    batch_id: params.batchId,
    session_id: params.sessionId,
    target_line_index: targetLineIndex,
    target_line_text_snapshot: selectedLineText(params.articleText, targetLineIndex),
    reference_asset_ids: params.referenceAssetIds,
    additional_image_paths: params.additionalImagePaths,
    additional_instruction: params.additionalInstruction || null,
    model: params.env.OPENAI_IMAGE_MODEL,
    prompt_model: promptModel,
    size: params.size,
    quality: params.quality,
    storage_bucket: params.env.LP_ASSET_BUCKET,
    generation_kind: "initial",
    status: "queued",
    progress_step: "待機中",
  }));

  const { data, error } = await params.supabase
    .from("generated_images")
    .insert(rows)
    .select("id, target_line_index");

  if (error || !data) {
    throw new Error(`Failed to create generation records: ${error?.message ?? "unknown error"}`);
  }

  return data as Array<{ id: string; target_line_index: number }>;
}

export async function startImageGenerationBatch(input: CreateBatchInput): Promise<ImageGenerationBatchResponse> {
  const env = getServerEnv();
  const supabase = createAdminClient();
  const targetLineIndexes = normalizeTargetLineIndexes(input.targetLineIndexes, env.IMAGE_GENERATION_BATCH_LIMIT);
  validateImageGenerationLimits({
    referenceAssetCount: input.referenceAssetIds.length,
    additionalImageCount: input.additionalImages.length,
  });

  const session = await ensureEditorSession(supabase, input.sessionId, input.articleText);
  const additionalImagePaths = await uploadAdditionalImages({
    supabase,
    bucket: env.LP_ASSET_BUCKET,
    sessionId: session.id,
    files: input.additionalImages,
  });
  const batchId = await createGenerationBatch({
    supabase,
    sessionId: session.id,
    articleText: input.articleText,
    targetLineIndexes,
  });
  const generationRows = await createGenerationRows({
    supabase,
    batchId,
    sessionId: session.id,
    articleText: input.articleText,
    targetLineIndexes,
    referenceAssetIds: input.referenceAssetIds,
    additionalImagePaths,
    additionalInstruction: input.additionalInstruction,
    env,
    size: input.size,
    quality: input.quality,
  });

  void runImageGenerationBatch(batchId).catch((error) => {
    console.error(error);
  });

  return {
    batchId,
    sessionId: session.id,
    generationIds: generationRows.map((row) => row.id),
    status: "queued",
    totalCount: generationRows.length,
    queuedCount: generationRows.length,
  };
}

export async function startImageGenerationRevision(input: CreateRevisionInput): Promise<ImageGenerationBatchResponse> {
  const env = getServerEnv();
  const supabase = createAdminClient();
  validateImageGenerationLimits({
    referenceAssetCount: 0,
    additionalImageCount: input.additionalImages.length,
  });

  const { data: parentData, error: parentError } = await supabase
    .from("generated_images")
    .select("*")
    .eq("id", input.generationId)
    .single();

  if (parentError || !parentData) {
    throw new Error(`Failed to load source generation: ${parentError?.message ?? "unknown error"}`);
  }

  const parent = parentData as GeneratedImageRecord;
  if (parent.status !== "completed" || !parent.storage_path) {
    throw new Error("完了済みの生成画像だけ修正できます");
  }

  const articleText = input.articleText || "";
  const { error: sessionError } = await supabase
    .from("editor_sessions")
    .update({ article_text: articleText, updated_at: new Date().toISOString(), last_saved_at: new Date().toISOString() })
    .eq("id", parent.session_id);
  if (sessionError) {
    throw new Error(`Failed to update editor session: ${sessionError.message}`);
  }

  const additionalImagePaths = await uploadAdditionalImages({
    supabase,
    bucket: env.LP_ASSET_BUCKET,
    sessionId: parent.session_id,
    files: input.additionalImages,
  });
  const targetLineIndexes = [parent.target_line_index];
  const batchId = await createGenerationBatch({
    supabase,
    sessionId: parent.session_id,
    articleText,
    targetLineIndexes,
  });
  const promptModel = env.OPENAI_PROMPT_MODEL || env.OPENAI_VISION_MODEL;
  const revisionInputPaths = buildRevisionImageInputPaths(parent.storage_path, additionalImagePaths);
  const { data, error } = await supabase
    .from("generated_images")
    .insert({
      batch_id: batchId,
      session_id: parent.session_id,
      parent_generation_id: parent.id,
      generation_kind: "revision",
      target_line_index: parent.target_line_index,
      target_line_text_snapshot: selectedLineText(articleText, parent.target_line_index),
      reference_asset_ids: parent.reference_asset_ids ?? [],
      additional_image_paths: revisionInputPaths,
      additional_instruction: parent.additional_instruction,
      revision_instruction: input.revisionInstruction,
      model: env.OPENAI_IMAGE_MODEL,
      prompt_model: promptModel,
      size: input.size,
      quality: input.quality,
      storage_bucket: env.LP_ASSET_BUCKET,
      status: "queued",
      progress_step: "修正生成を待機中",
    })
    .select("id, target_line_index")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create revision generation record: ${error?.message ?? "unknown error"}`);
  }

  void runImageGenerationBatch(batchId).catch((runError) => {
    console.error(runError);
  });

  return {
    batchId,
    sessionId: parent.session_id,
    generationIds: [(data as { id: string }).id],
    status: "queued",
    totalCount: 1,
    queuedCount: 1,
  };
}

async function updateBatchProgress(supabase: SupabaseClient, batchId: string) {
  const { data, error } = await supabase.from("generated_images").select("status").eq("batch_id", batchId);
  if (error) {
    throw new Error(`Failed to load batch progress: ${error.message}`);
  }

  const summary = summarizeGenerationProgress(
    ((data ?? []) as Array<{ status: ImageGenerationStatus }>).map((row) => row.status),
  );
  const terminal = summary.queuedCount + summary.runningCount === 0;
  const now = new Date().toISOString();
  await supabase
    .from("image_generation_batches")
    .update({
      status: summary.status,
      queued_count: summary.queuedCount,
      running_count: summary.runningCount,
      completed_count: summary.completedCount,
      failed_count: summary.failedCount,
      completed_at: terminal ? now : null,
      updated_at: now,
    })
    .eq("id", batchId);

  return summary;
}

async function updateGenerationStatus(params: {
  supabase: SupabaseClient;
  generationId: string;
  status: GeneratedImageStatus;
  progressStep: string;
  values?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const values = {
    status: params.status,
    progress_step: params.progressStep,
    updated_at: now,
    ...(params.status === "planning" ? { started_at: now } : {}),
    ...params.values,
  };
  const { error } = await params.supabase.from("generated_images").update(values).eq("id", params.generationId);
  if (error) {
    throw new Error(`Failed to update generation status: ${error.message}`);
  }
}

async function processGenerationJob(params: {
  supabase: SupabaseClient;
  env: AppEnv;
  batch: ImageGenerationBatchRecord;
  generation: GeneratedImageRecord;
}) {
  const generation = params.generation;
  try {
    await updateGenerationStatus({
      supabase: params.supabase,
      generationId: generation.id,
      status: "planning",
      progressStep: "生成計画を作成中",
    });
    await updateBatchProgress(params.supabase, params.batch.id);

    const referenceAssets = await fetchReferenceAssets(params.supabase, generation.reference_asset_ids ?? []);
    const referenceInputs = await Promise.all(referenceAssets.map((asset) => downloadReferenceImage(params.supabase, asset)));
    const additionalInputs = await Promise.all(
      (generation.additional_image_paths ?? []).map((storagePath) =>
        downloadAdditionalImage(params.supabase, params.env.LP_ASSET_BUCKET, storagePath),
      ),
    );
    const imageInputs = [...referenceInputs, ...additionalInputs];
    const outputSize = resolveImageOutputSize(generation.size, referenceAssets);
    const additionalInstruction = buildEffectiveAdditionalInstruction({
      baseInstruction: generation.additional_instruction,
      revisionInstruction: generation.revision_instruction,
    });
    const promptPlan = await createImagePromptPlan({
      apiKey: params.env.OPENAI_API_KEY,
      model: generation.prompt_model,
      articleText: params.batch.article_text_snapshot,
      targetLineIndex: generation.target_line_index,
      additionalInstruction,
      referenceAssets,
      imageInputs,
    });
    const finalPrompt = buildFinalImagePrompt(promptPlan, { size: outputSize, quality: generation.quality });

    await updateGenerationStatus({
      supabase: params.supabase,
      generationId: generation.id,
      status: "generating",
      progressStep: "gpt-image-2で生成中",
      values: {
        prompt_plan: promptPlan,
        final_prompt: finalPrompt,
        size: outputSize,
      },
    });
    await updateBatchProgress(params.supabase, params.batch.id);

    const endpoint = chooseImageGenerationEndpoint({
      referenceImageCount: referenceInputs.length,
      additionalImageCount: additionalInputs.length,
    });
    const generated = await generateImageBytes({
      apiKey: params.env.OPENAI_API_KEY,
      model: generation.model,
      endpoint,
      prompt: finalPrompt,
      size: outputSize,
      quality: generation.quality,
      imageInputs,
    });

    await updateGenerationStatus({
      supabase: params.supabase,
      generationId: generation.id,
      status: "uploading",
      progressStep: "生成画像を保存中",
    });
    await updateBatchProgress(params.supabase, params.batch.id);

    const storagePath = `editor-generations/${generation.session_id}/${generation.id}.png`;
    const { error: uploadError } = await params.supabase.storage
      .from(params.env.LP_ASSET_BUCKET)
      .upload(storagePath, generated.buffer, {
        contentType: "image/png",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Failed to upload generated image: ${uploadError.message}`);
    }

    const publicUrl = getAssetPublicUrl(params.supabase, storagePath, params.env.LP_ASSET_BUCKET);
    const alt = `生成画像 ${generation.target_line_index + 1}行目`;
    const insertedMarkdown = `![${alt}](${publicUrl})`;

    await updateGenerationStatus({
      supabase: params.supabase,
      generationId: generation.id,
      status: "completed",
      progressStep: "完了",
      values: {
        storage_path: storagePath,
        inserted_markdown: insertedMarkdown,
        usage: generated.usage,
        request_id: generated.requestId,
        error_message: null,
        completed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    await updateGenerationStatus({
      supabase: params.supabase,
      generationId: generation.id,
      status: "failed",
      progressStep: "失敗",
      values: {
        error_message: generationErrorMessage(error),
        completed_at: new Date().toISOString(),
      },
    });
  } finally {
    await updateBatchProgress(params.supabase, params.batch.id);
  }
}

function buildImageBlock(params: {
  row: GeneratedImageRecord;
  publicUrl: string;
  insertedMarkdown: string;
}): EditorImageBlock {
  return {
    id: params.row.id,
    lineIndex: params.row.target_line_index,
    markdown: params.insertedMarkdown,
    imageUrl: params.publicUrl,
    alt: `生成画像 ${params.row.target_line_index + 1}行目`,
    referenceAssetIds: params.row.reference_asset_ids ?? [],
    createdAt: params.row.completed_at ?? params.row.created_at,
  };
}

function mergeImageBlocks(nextBlocks: EditorImageBlock[], existingBlocks: EditorImageBlock[]) {
  const seen = new Set<string>();
  return [...nextBlocks, ...existingBlocks].filter((block) => {
    const key = block.id || block.imageUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function finalizeBatch(params: {
  supabase: SupabaseClient;
  env: AppEnv;
  batch: ImageGenerationBatchRecord;
}) {
  const { data: rows, error: rowsError } = await params.supabase
    .from("generated_images")
    .select("*")
    .eq("batch_id", params.batch.id)
    .eq("status", "completed")
    .not("storage_path", "is", null)
    .order("target_line_index", { ascending: true });

  if (rowsError) {
    throw new Error(`Failed to load completed generations: ${rowsError.message}`);
  }

  const completedRows = (rows ?? []) as GeneratedImageRecord[];
  if (completedRows.length === 0) return;

  const { data: session, error: sessionError } = await params.supabase
    .from("editor_sessions")
    .select("id, title, article_text, image_blocks, editor_state, last_saved_at, created_at, updated_at")
    .eq("id", params.batch.session_id)
    .single();

  if (sessionError || !session) {
    throw new Error(`Failed to load editor session: ${sessionError?.message ?? "unknown error"}`);
  }

  const nextBlocks = completedRows.map((row) => {
    const publicUrl = getAssetPublicUrl(params.supabase, row.storage_path!, params.env.LP_ASSET_BUCKET);
    return buildImageBlock({
      row,
      publicUrl,
      insertedMarkdown: row.inserted_markdown ?? `![生成画像 ${row.target_line_index + 1}行目](${publicUrl})`,
    });
  });
  const sessionRow = session as EditorSessionRow;
  const values: Record<string, unknown> = {
    image_blocks: mergeImageBlocks(nextBlocks, sessionRow.image_blocks ?? []),
    last_saved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (sessionRow.article_text === params.batch.article_text_snapshot) {
    values.article_text = insertMarkdownImagesAfterLines(
      params.batch.article_text_snapshot,
      nextBlocks.map((block) => ({
        lineIndex: block.lineIndex,
        markdown: block.markdown,
      })),
    );
  }

  const { error: updateError } = await params.supabase.from("editor_sessions").update(values).eq("id", params.batch.session_id);
  if (updateError) {
    throw new Error(`Failed to update editor session: ${updateError.message}`);
  }
}

export async function runImageGenerationBatch(batchId: string) {
  const env = getServerEnv();
  const supabase = createAdminClient();
  const { data: batchData, error: batchError } = await supabase
    .from("image_generation_batches")
    .select("*")
    .eq("id", batchId)
    .single();

  if (batchError || !batchData) {
    throw new Error(`Failed to load image generation batch: ${batchError?.message ?? "unknown error"}`);
  }
  const batch = batchData as ImageGenerationBatchRecord;

  await supabase
    .from("image_generation_batches")
    .update({
      status: "running",
      started_at: batch.started_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  const { data: generationRows, error: generationError } = await supabase
    .from("generated_images")
    .select("*")
    .eq("batch_id", batchId)
    .in("status", ACTIVE_GENERATION_STATUSES);

  if (generationError) {
    throw new Error(`Failed to load generation jobs: ${generationError.message}`);
  }

  await runWithConcurrency((generationRows ?? []) as GeneratedImageRecord[], env.IMAGE_GENERATION_CONCURRENCY, (generation) =>
    processGenerationJob({ supabase, env, batch, generation }),
  );

  const summary = await updateBatchProgress(supabase, batchId);
  if (summary.queuedCount + summary.runningCount === 0) {
    await finalizeBatch({ supabase, env, batch });
  }
}

function generatedImageFromRecord(params: {
  supabase: SupabaseClient;
  env: AppEnv;
  row: GeneratedImageRecord;
}): GeneratedImage | null {
  if (params.row.status !== "completed" || !params.row.storage_path) return null;
  const promptPlan = params.row.prompt_plan as ImagePromptPlan | null;
  return {
    id: params.row.id,
    sessionId: params.row.session_id,
    url: getAssetPublicUrl(params.supabase, params.row.storage_path, params.env.LP_ASSET_BUCKET),
    storagePath: params.row.storage_path,
    alt: `生成画像 ${params.row.target_line_index + 1}行目`,
    model: params.row.model,
    size: params.row.size,
    quality: params.row.quality,
    referenceAssetIds: params.row.reference_asset_ids ?? [],
    additionalImageCount: Math.max(
      0,
      (params.row.additional_image_paths?.length ?? 0) - (params.row.parent_generation_id ? 1 : 0),
    ),
    additionalInstruction: params.row.additional_instruction ?? "",
    promptSummary: promptPlan?.promptSummary ?? `${params.row.target_line_index + 1}行目向けの記事LP画像`,
    status: params.row.status,
  };
}

function referenceAssetSummary(params: {
  supabase: SupabaseClient;
  asset: AssetWithAnnotation;
}): ImageGenerationReferenceAsset {
  return {
    id: params.asset.id,
    url: params.asset.public_url ?? getAssetPublicUrl(params.supabase, params.asset.storage_path, params.asset.storage_bucket),
    thumbnailUrl:
      params.asset.thumbnail_url ??
      getAssetPublicUrl(
        params.supabase,
        params.asset.thumbnail_storage_path ?? params.asset.storage_path,
        params.asset.storage_bucket,
      ),
    description:
      params.asset.asset_annotations?.description ??
      params.asset.asset_annotations?.visual_description ??
      params.asset.alt_text ??
      "参考画像",
    problemCategory: params.asset.problem_category,
    imageCategory: params.asset.asset_annotations?.image_category ?? null,
  };
}

function historyItemFromRecord(params: {
  supabase: SupabaseClient;
  env: AppEnv;
  row: GeneratedImageRecord;
  referenceAssetMap?: Map<string, AssetWithAnnotation>;
}): ImageGenerationHistoryItem {
  const generatedImage = generatedImageFromRecord(params);
  return {
    id: params.row.id,
    batchId: params.row.batch_id,
    sessionId: params.row.session_id,
    parentGenerationId: params.row.parent_generation_id,
    generationKind: params.row.generation_kind ?? "initial",
    targetLineIndex: params.row.target_line_index,
    targetLineText: params.row.target_line_text_snapshot ?? "",
    status: params.row.status,
    progressStep: params.row.progress_step,
    generatedImage,
    insertedMarkdown:
      params.row.inserted_markdown ??
      (generatedImage ? `![${generatedImage.alt}](${generatedImage.url})` : null),
    promptPlan: (params.row.prompt_plan as ImagePromptPlan | null) ?? null,
    finalPrompt: params.row.final_prompt,
    revisionInstruction: params.row.revision_instruction,
    referenceAssets: (params.row.reference_asset_ids ?? [])
      .map((id) => params.referenceAssetMap?.get(id))
      .filter(Boolean)
      .map((asset) => referenceAssetSummary({ supabase: params.supabase, asset: asset! })),
    errorMessage: params.row.error_message,
    createdAt: params.row.created_at,
    startedAt: params.row.started_at,
    completedAt: params.row.completed_at,
  };
}

export async function listImageGenerationHistory(params: {
  sessionId?: string;
  batchId?: string;
  limit?: number;
}): Promise<ImageGenerationHistoryResponse> {
  const env = getServerEnv();
  const supabase = createAdminClient();
  let query = supabase.from("generated_images").select("*").order("created_at", { ascending: false }).limit(params.limit ?? 100);

  if (params.sessionId) {
    query = query.eq("session_id", params.sessionId);
  }
  if (params.batchId) {
    query = query.eq("batch_id", params.batchId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load generation history: ${error.message}`);
  }

  let session: ImageGenerationHistoryResponse["session"] = null;
  const sessionId = params.sessionId || ((data?.[0] as GeneratedImageRecord | undefined)?.session_id ?? "");
  if (sessionId) {
    const { data: sessionData, error: sessionError } = await supabase
      .from("editor_sessions")
      .select("id, title, article_text, image_blocks, editor_state, last_saved_at, created_at, updated_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      throw new Error(`Failed to load editor session: ${sessionError.message}`);
    }
    if (sessionData) {
      const sessionRow = sessionData as EditorSessionRow;
      session = {
        id: sessionRow.id,
        title: sessionRow.title ?? DEFAULT_EDITOR_PROJECT_TITLE,
        articleText: sessionRow.article_text,
        imageBlocks: sessionRow.image_blocks ?? [],
        editorState: normalizeEditorState(sessionRow.editor_state),
        lastSavedAt: sessionRow.last_saved_at ?? null,
      };
    }
  }

  const rows = (data ?? []) as GeneratedImageRecord[];
  const referenceAssetIds = rows.flatMap((row) => row.reference_asset_ids ?? []);
  const referenceAssetMap = await fetchReferenceAssetMap(supabase, referenceAssetIds);

  return {
    items: rows.map((row) => historyItemFromRecord({ supabase, env, row, referenceAssetMap })),
    session,
  };
}
