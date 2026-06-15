import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeAnnotationImageCategory,
  normalizeProblemCategory,
  normalizeTargetAgeBand,
  normalizeTargetGender,
} from "@/lib/assets/category-normalization";
import { buildSearchText } from "@/lib/assets/search-text";
import { createEmbedding } from "@/lib/ai/embedding";
import { getServerEnv } from "@/lib/config/env";
import { annotateImageWithOpenAI, fallbackAnnotation, type AssetAiAnnotation } from "@/lib/ai/annotation";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractMediaCandidates, type MediaCandidate } from "./extract";
import { inferArticleContext, type ArticleContext } from "./article-context";
import { downloadMedia, fetchArticleHtml } from "./download";
import { getCanonicalSourceMediaUrl, shouldReuseExistingAsset } from "./dedupe";
import { buildStoragePath, getBasicMediaMetadata } from "./media-metadata";
import { extractLastFrame, probeVideo } from "./video";

type LogEntry = {
  level: "info" | "warn" | "error";
  message: string;
  url?: string;
  assetId?: string;
  at: string;
};

type IngestCounters = {
  totalCandidates: number;
  processedUrls: number;
  processedCandidates: number;
  createdAssets: number;
  skippedAssets: number;
  failedAssets: number;
};

type StoredAsset = {
  id: string;
  storage_path: string;
  file_hash: string;
};

const MIN_ASSET_BYTES = 1024;

export type IngestResult = {
  jobId: string;
  status: "completed" | "failed";
  totalCandidates: number;
  processedUrls: number;
  processedCandidates: number;
  createdAssets: number;
  skippedAssets: number;
  failedAssets: number;
  logs: LogEntry[];
};

export type IngestOptions = {
  maxCandidatesPerUrl?: number;
};

function log(logs: LogEntry[], entry: Omit<LogEntry, "at">) {
  const nextEntry = { ...entry, at: new Date().toISOString() };
  logs.push(nextEntry);
  return nextEntry;
}

async function patchJob(supabase: SupabaseClient, jobId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("ingest_jobs").update(values).eq("id", jobId);
  if (error) {
    throw new Error(`Failed to update ingest job: ${error.message}`);
  }
}

async function patchProgress(params: {
  supabase: SupabaseClient;
  jobId: string;
  counters: IngestCounters;
  logs: LogEntry[];
  currentArticleUrl?: string | null;
  currentMediaUrl?: string | null;
  currentStep?: string | null;
  status?: "queued" | "running" | "completed" | "failed";
  errorMessage?: string | null;
  finishedAt?: string | null;
}) {
  await patchJob(params.supabase, params.jobId, {
    status: params.status,
    total_candidates: params.counters.totalCandidates,
    processed_urls: params.counters.processedUrls,
    processed_candidates: params.counters.processedCandidates,
    created_assets: params.counters.createdAssets,
    skipped_assets: params.counters.skippedAssets,
    failed_assets: params.counters.failedAssets,
    current_article_url: params.currentArticleUrl ?? null,
    current_media_url: params.currentMediaUrl ?? null,
    current_step: params.currentStep ?? null,
    last_log_at: params.logs.at(-1)?.at ?? new Date().toISOString(),
    error_message: params.errorMessage,
    finished_at: params.finishedAt,
    logs: params.logs,
  });
}

async function uploadBuffer(
  supabase: SupabaseClient,
  bucket: string,
  storagePath: string,
  buffer: Buffer,
  mimeType: string,
) {
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Failed to upload ${storagePath}: ${error.message}`);
  }
}

async function findExistingAsset(supabase: SupabaseClient, fileHash: string): Promise<StoredAsset | null> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id, storage_path, file_hash")
    .eq("file_hash", fileHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check duplicate asset: ${error.message}`);
  }
  return data as StoredAsset | null;
}

async function upsertAssetSource(params: {
  supabase: SupabaseClient;
  assetId: string;
  articleContext: ArticleContext;
  candidate: MediaCandidate;
  sourceMediaUrl: string;
  isFirstView: boolean;
}) {
  if (params.isFirstView) {
    const { error: resetError } = await params.supabase
      .from("asset_sources")
      .update({ is_first_view: false })
      .eq("source_article_url", params.articleContext.articleUrl)
      .eq("is_first_view", true);

    if (resetError) {
      throw new Error(`Failed to reset first-view source: ${resetError.message}`);
    }
  }

  const { error } = await params.supabase.from("asset_sources").upsert(
    {
      asset_id: params.assetId,
      source_article_url: params.articleContext.articleUrl,
      source_media_url: params.sourceMediaUrl,
      source_order: params.candidate.sourceOrder,
      found_in: params.candidate.foundIn,
      alt_text: params.candidate.altText ?? null,
      is_first_view: params.isFirstView,
    },
    { onConflict: "asset_id,source_article_url,source_media_url" },
  );

  if (error) {
    throw new Error(`Failed to save asset source: ${error.message}`);
  }
}

async function insertAnnotationAndEmbedding(
  supabase: SupabaseClient,
  assetId: string,
  annotation: AssetAiAnnotation,
  apiKey: string,
  embeddingModel: string,
) {
  const searchText = buildSearchText({
    productName: annotation.productName,
    targetGender: annotation.targetGender,
    targetAgeBand: annotation.targetAgeBand,
    problemCategory: annotation.problemCategory,
    imageCategory: annotation.imageCategory,
    lpSectionRole: annotation.lpSectionRole,
    appealRole: annotation.appealRole,
    description: annotation.description,
    ocrText: annotation.ocrText,
    tags: annotation.tags,
  });

  const { error: annotationError } = await supabase.from("asset_annotations").upsert({
    asset_id: assetId,
    image_category: annotation.imageCategory,
    lp_section_role: annotation.lpSectionRole,
    appeal_role: annotation.appealRole,
    description: annotation.description,
    visual_description: annotation.visualDescription,
    ocr_text: annotation.ocrText,
    tags: annotation.tags,
    raw_ai_response: annotation,
    ai_confidence: annotation.confidence,
    needs_review: (annotation.confidence ?? 0) < 0.4,
    updated_at: new Date().toISOString(),
  });

  if (annotationError) {
    throw new Error(`Failed to save annotation: ${annotationError.message}`);
  }

  const embedding = await createEmbedding(searchText, apiKey, embeddingModel);
  const { error: embeddingError } = await supabase.from("asset_embeddings").upsert({
    asset_id: assetId,
    search_text: searchText,
    embedding,
    embedding_model: embeddingModel,
  });

  if (embeddingError) {
    throw new Error(`Failed to save embedding: ${embeddingError.message}`);
  }
}

async function createAssetRecord(params: {
  supabase: SupabaseClient;
  articleContext: ArticleContext;
  candidate: MediaCandidate;
  mediaType: "image" | "video_frame";
  sourceMediaUrl: string;
  storagePath: string;
  fileHash: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  durationSeconds?: number | null;
  annotation: AssetAiAnnotation;
}) {
  const problemCategory = normalizeProblemCategory(params.annotation.problemCategory ?? params.articleContext.problemCategory);
  const targetGender = normalizeTargetGender(params.annotation.targetGender ?? params.articleContext.targetGender);
  const targetAgeBand = normalizeTargetAgeBand(params.annotation.targetAgeBand ?? params.articleContext.targetAgeBand);

  const { data, error } = await params.supabase
    .from("media_assets")
    .insert({
      media_type: params.mediaType,
      parent_asset_id: null,
      source_article_url: params.articleContext.articleUrl,
      source_media_url: params.sourceMediaUrl,
      source_order: params.candidate.sourceOrder,
      storage_path: params.storagePath,
      file_hash: params.fileHash,
      mime_type: params.mimeType,
      file_size_bytes: params.fileSizeBytes,
      width: params.width,
      height: params.height,
      duration_seconds: params.durationSeconds ?? null,
      aspect_ratio: params.aspectRatio,
      found_in: params.candidate.foundIn,
      alt_text: params.candidate.altText ?? null,
      product_name: params.annotation.productName ?? params.articleContext.productName,
      target_gender: targetGender,
      target_age_band: targetAgeBand,
      problem_category: problemCategory,
    })
    .select("id, storage_path, file_hash")
    .single();

  if (error) {
    throw new Error(`Failed to create media asset: ${error.message}`);
  }

  return data as StoredAsset;
}

async function processImageAsset(params: {
  supabase: SupabaseClient;
  articleContext: ArticleContext;
  candidate: MediaCandidate;
  buffer: Buffer;
  mimeType: string;
  size: number;
  sourceMediaUrl: string;
  mediaType?: "image" | "video_frame";
  forcedSuffix?: string;
  isFirstView: boolean;
  apiKey: string;
  visionModel: string;
  embeddingModel: string;
  bucket: string;
}) {
  const metadata = getBasicMediaMetadata(params.buffer, params.sourceMediaUrl, params.mimeType);
  const existing = await findExistingAsset(params.supabase, metadata.fileHash);
  if (
    existing &&
    shouldReuseExistingAsset({
      existingFileHash: existing.file_hash,
      nextFileHash: metadata.fileHash,
      existingSourceArticleUrl: params.articleContext.articleUrl,
      nextSourceArticleUrl: params.articleContext.articleUrl,
    })
  ) {
    await upsertAssetSource({
      supabase: params.supabase,
      assetId: existing.id,
      articleContext: params.articleContext,
      candidate: params.candidate,
      sourceMediaUrl: params.sourceMediaUrl,
      isFirstView: params.isFirstView,
    });
    return { asset: existing, skipped: true };
  }

  const storagePath = buildStoragePath(
    params.articleContext.articleUrl,
    metadata.fileHash,
    metadata.extension,
    params.forcedSuffix,
  );
  await uploadBuffer(params.supabase, params.bucket, storagePath, params.buffer, params.mimeType);

  let annotation: AssetAiAnnotation;
  try {
    annotation = await annotateImageWithOpenAI(
      {
        mediaBuffer: params.buffer,
        mimeType: params.mimeType,
        articleContext: params.articleContext,
        candidate: params.candidate,
      },
      params.apiKey,
      params.visionModel,
    );
  } catch {
    annotation = fallbackAnnotation({
      articleContext: params.articleContext,
      candidate: params.candidate,
    });
  }

  const normalizedAnnotation: AssetAiAnnotation = {
    ...annotation,
    problemCategory: normalizeProblemCategory(annotation.problemCategory ?? params.articleContext.problemCategory),
    imageCategory: normalizeAnnotationImageCategory(annotation.imageCategory) ?? "その他",
  };

  const asset = await createAssetRecord({
    supabase: params.supabase,
    articleContext: params.articleContext,
    candidate: params.candidate,
    mediaType: params.mediaType ?? "image",
    sourceMediaUrl: params.sourceMediaUrl,
    storagePath,
    fileHash: metadata.fileHash,
    mimeType: params.mimeType,
    fileSizeBytes: params.size,
    width: metadata.width,
    height: metadata.height,
    aspectRatio: metadata.aspectRatio,
    annotation: normalizedAnnotation,
  });

  await insertAnnotationAndEmbedding(params.supabase, asset.id, normalizedAnnotation, params.apiKey, params.embeddingModel);
  await upsertAssetSource({
    supabase: params.supabase,
    assetId: asset.id,
    articleContext: params.articleContext,
    candidate: params.candidate,
    sourceMediaUrl: params.sourceMediaUrl,
    isFirstView: params.isFirstView,
  });
  return { asset, skipped: false };
}

async function processVideoAsset(params: {
  supabase: SupabaseClient;
  articleContext: ArticleContext;
  candidate: MediaCandidate;
  buffer: Buffer;
  mimeType: string;
  apiKey: string;
  visionModel: string;
  embeddingModel: string;
  bucket: string;
  isFirstView: boolean;
}) {
  const videoMetadata = getBasicMediaMetadata(params.buffer, params.candidate.url, params.mimeType);
  const videoProbe = await probeVideo(params.buffer, videoMetadata.extension);
  const frameBuffer = await extractLastFrame(params.buffer, videoMetadata.extension, videoProbe.durationSeconds);

  return processImageAsset({
    supabase: params.supabase,
    articleContext: params.articleContext,
    candidate: {
      ...params.candidate,
      mediaType: "image",
      foundIn: "video",
      altText: "動画ラストカット",
    },
    buffer: frameBuffer,
    mimeType: "image/jpeg",
    size: frameBuffer.byteLength,
    sourceMediaUrl: getCanonicalSourceMediaUrl(params.candidate.url, "video"),
    mediaType: "video_frame",
    forcedSuffix: "last-frame",
    isFirstView: params.isFirstView,
    apiKey: params.apiKey,
    visionModel: params.visionModel,
    embeddingModel: params.embeddingModel,
    bucket: params.bucket,
  });
}

async function createIngestJob(supabase: SupabaseClient, urls: string[]) {
  const { data: job, error: jobError } = await supabase
    .from("ingest_jobs")
    .insert({
      urls,
      status: "queued",
      total_urls: urls.length,
      processed_urls: 0,
      processed_candidates: 0,
      started_at: null,
      logs: [],
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new Error(`Failed to create ingest job: ${jobError?.message ?? "unknown error"}`);
  }

  return (job as { id: string }).id;
}

export async function runIngestJob(jobId: string, urls: string[], options: IngestOptions = {}): Promise<IngestResult> {
  const env = getServerEnv();
  const supabase = createAdminClient();
  const logs: LogEntry[] = [];
  const counters: IngestCounters = {
    totalCandidates: 0,
    processedUrls: 0,
    processedCandidates: 0,
    createdAssets: 0,
    skippedAssets: 0,
    failedAssets: 0,
  };

  try {
    log(logs, { level: "info", message: "Ingest job started" });
    await patchProgress({
      supabase,
      jobId,
      counters,
      logs,
      status: "running",
      currentStep: "開始",
    });

    for (const articleUrl of urls) {
      log(logs, { level: "info", message: "Fetching article", url: articleUrl });
      await patchProgress({
        supabase,
        jobId,
        counters,
        logs,
        status: "running",
        currentArticleUrl: articleUrl,
        currentStep: "記事HTML取得中",
      });

      const html = await fetchArticleHtml(articleUrl);
      const context = inferArticleContext(articleUrl, html);
      const discoveredCandidates = extractMediaCandidates(html, articleUrl);
      const candidates = options.maxCandidatesPerUrl
        ? discoveredCandidates.slice(0, options.maxCandidatesPerUrl)
        : discoveredCandidates;
      let firstViewAssigned = false;
      counters.totalCandidates += candidates.length;
      log(logs, {
        level: "info",
        message: `Found ${discoveredCandidates.length} media candidates`,
        url: articleUrl,
      });
      if (candidates.length < discoveredCandidates.length) {
        log(logs, {
          level: "info",
          message: `Processing first ${candidates.length} candidates`,
          url: articleUrl,
        });
      }
      await patchProgress({
        supabase,
        jobId,
        counters,
        logs,
        status: "running",
        currentArticleUrl: articleUrl,
        currentStep: "素材候補を抽出済み",
      });

      for (const candidate of candidates) {
        try {
          await patchProgress({
            supabase,
            jobId,
            counters,
            logs,
            status: "running",
            currentArticleUrl: articleUrl,
            currentMediaUrl: candidate.url,
            currentStep: "素材ダウンロード中",
          });
          const downloaded = await downloadMedia(candidate.url);
          if (!downloaded.mimeType.startsWith("image/") && !downloaded.mimeType.startsWith("video/")) {
            counters.skippedAssets += 1;
            log(logs, { level: "warn", message: `Skipped unsupported MIME ${downloaded.mimeType}`, url: candidate.url });
            continue;
          }
          if (downloaded.mimeType === "image/svg+xml" || downloaded.size < MIN_ASSET_BYTES) {
            counters.skippedAssets += 1;
            log(logs, { level: "warn", message: "Skipped tiny or unsupported image asset", url: candidate.url });
            continue;
          }

          await patchProgress({
            supabase,
            jobId,
            counters,
            logs,
            status: "running",
            currentArticleUrl: articleUrl,
            currentMediaUrl: candidate.url,
            currentStep: candidate.mediaType === "video" ? "動画ラストカット抽出中" : "AI解析・保存中",
          });

          if (candidate.mediaType === "video" || downloaded.mimeType.startsWith("video/")) {
            const result = await processVideoAsset({
              supabase,
              articleContext: context,
              candidate,
              buffer: downloaded.buffer,
              mimeType: downloaded.mimeType,
              apiKey: env.OPENAI_API_KEY,
              visionModel: env.OPENAI_VISION_MODEL,
              embeddingModel: env.OPENAI_EMBEDDING_MODEL,
              bucket: env.LP_ASSET_BUCKET,
              isFirstView: !firstViewAssigned,
            });
            firstViewAssigned = true;
            if (result.skipped) {
              counters.skippedAssets += 1;
              log(logs, { level: "info", message: "Skipped duplicate video frame source", url: candidate.url, assetId: result.asset.id });
            } else {
              counters.createdAssets += 1;
              log(logs, { level: "info", message: "Created video last-frame asset", url: candidate.url, assetId: result.asset.id });
            }
          } else {
            const result = await processImageAsset({
              supabase,
              articleContext: context,
              candidate,
              buffer: downloaded.buffer,
              mimeType: downloaded.mimeType,
              size: downloaded.size,
              sourceMediaUrl: candidate.url,
              apiKey: env.OPENAI_API_KEY,
              visionModel: env.OPENAI_VISION_MODEL,
              embeddingModel: env.OPENAI_EMBEDDING_MODEL,
              bucket: env.LP_ASSET_BUCKET,
              isFirstView: !firstViewAssigned,
            });
            firstViewAssigned = true;
            if (result.skipped) {
              counters.skippedAssets += 1;
              log(logs, { level: "info", message: "Skipped duplicate image source", url: candidate.url, assetId: result.asset.id });
            } else {
              counters.createdAssets += 1;
              log(logs, { level: "info", message: "Created image asset", url: candidate.url, assetId: result.asset.id });
            }
          }
        } catch (error) {
          counters.failedAssets += 1;
          log(logs, {
            level: "error",
            message: error instanceof Error ? error.message : "Unknown asset processing error",
            url: candidate.url,
          });
        } finally {
          counters.processedCandidates += 1;
          await patchProgress({
            supabase,
            jobId,
            counters,
            logs,
            status: "running",
            currentArticleUrl: articleUrl,
            currentMediaUrl: candidate.url,
            currentStep: "素材処理済み",
          });
        }
      }

      counters.processedUrls += 1;
      await patchProgress({
        supabase,
        jobId,
        counters,
        logs,
        status: "running",
        currentArticleUrl: articleUrl,
        currentStep: "記事URL処理済み",
      });
    }

    log(logs, { level: "info", message: "Ingest job completed" });
    await patchProgress({
      supabase,
      jobId,
      counters,
      logs,
      status: "completed",
      currentArticleUrl: null,
      currentMediaUrl: null,
      currentStep: "完了",
      finishedAt: new Date().toISOString(),
    });

    return { jobId, status: "completed", logs, ...counters };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown ingest error";
    log(logs, { level: "error", message: errorMessage });
    await patchProgress({
      supabase,
      jobId,
      counters,
      logs,
      status: "failed",
      currentStep: "失敗",
      errorMessage,
      finishedAt: new Date().toISOString(),
    });
    return { jobId, status: "failed", logs, ...counters };
  }
}

export async function startIngestJob(urls: string[], options: IngestOptions = {}) {
  const supabase = createAdminClient();
  const jobId = await createIngestJob(supabase, urls);
  void runIngestJob(jobId, urls, options).catch((error) => {
    console.error(error);
  });
  return { jobId, status: "running" as const };
}

export async function ingestUrls(urls: string[], options: IngestOptions = {}): Promise<IngestResult> {
  const supabase = createAdminClient();
  const jobId = await createIngestJob(supabase, urls);
  return runIngestJob(jobId, urls, options);
}
