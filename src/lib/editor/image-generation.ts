import OpenAI, { toFile } from "openai";
import { z } from "zod";
import type { AssetWithAnnotation } from "@/lib/db/types";
import type { ImagePromptPlan, ReferenceDesignBrief } from "./types";

export type ImageGenerationEndpoint = "generate" | "edit";

export type ImageInputForGeneration = {
  source: "reference" | "additional";
  name: string;
  mimeType: string;
  buffer: Buffer;
  asset?: AssetWithAnnotation;
};

const referenceDesignBriefSchema = z.object({
  canvasShape: z.string().min(1),
  aspectRatio: z.string().min(1),
  compositionGrid: z.string().min(1),
  textHierarchy: z.string().min(1),
  typography: z.string().min(1),
  colorPalette: z.string().min(1),
  visualDensity: z.string().min(1),
  imageTreatment: z.string().min(1),
  layoutConstraints: z.array(z.string()).default([]),
  referenceObservations: z.array(z.string()).default([]),
});

const promptPlanSchema = z.object({
  articleSummary: z.string().min(1),
  targetLineRole: z.string().min(1),
  targetLineText: z.string().min(1),
  imageText: z.string().min(1),
  visualDirection: z.string().min(1),
  layoutDirection: z.string().min(1),
  referenceImageDirections: z.array(z.string()).default([]),
  referenceDesignBrief: referenceDesignBriefSchema,
  safetyNotes: z.array(z.string()).default([]),
  promptSummary: z.string().min(1),
});

function selectedLineText(articleText: string, lineIndex: number) {
  return articleText.split("\n")[lineIndex] ?? "";
}

function parseJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in OpenAI response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function assetSummary(asset: AssetWithAnnotation) {
  const annotation = asset.asset_annotations;
  return [
    asset.product_name ? `商材: ${asset.product_name}` : null,
    asset.problem_category ? `悩み: ${asset.problem_category}` : null,
    annotation?.image_category ? `画像カテゴリ: ${annotation.image_category}` : null,
    annotation?.lp_section_role ? `LP役割: ${annotation.lp_section_role}` : null,
    annotation?.appeal_role ? `訴求役割: ${annotation.appeal_role}` : null,
    annotation?.description ? `説明: ${annotation.description}` : null,
    annotation?.visual_description ? `視覚: ${annotation.visual_description}` : null,
    annotation?.ocr_text ? `画像内テキスト: ${annotation.ocr_text}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function assetDesignSummary(asset: AssetWithAnnotation, index: number) {
  const annotation = asset.asset_annotations;
  return [
    `参考画像${index + 1}`,
    asset.width && asset.height ? `寸法: ${asset.width}x${asset.height}` : null,
    annotation?.image_category ? `画像カテゴリ: ${annotation.image_category}` : null,
    annotation?.visual_description ? `視覚説明: ${annotation.visual_description}` : null,
    annotation?.ocr_text ? `OCR: ${annotation.ocr_text}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function inferAspectLabel(width: number | null | undefined, height: number | null | undefined) {
  if (!width || !height) return "参考画像に準拠";
  const ratio = width / height;
  if (ratio > 1.15) return `横長 ${width}:${height}`;
  if (ratio < 0.85) return `縦長 ${width}:${height}`;
  return `正方形に近い ${width}:${height}`;
}

export function resolveImageOutputSize(requestedSize: string, referenceAssets: AssetWithAnnotation[]) {
  if (requestedSize !== "auto") return requestedSize;

  const referenceWithSize = referenceAssets.find((asset) => asset.width && asset.height);
  if (!referenceWithSize?.width || !referenceWithSize.height) return "auto";

  const ratio = referenceWithSize.width / referenceWithSize.height;
  if (ratio > 1.15) return "1536x1024";
  if (ratio < 0.85) return "1024x1536";
  return "1024x1024";
}

export function createFallbackReferenceDesignBrief(referenceAssets: AssetWithAnnotation[]): ReferenceDesignBrief {
  const firstAsset = referenceAssets[0];
  const firstAnnotation = firstAsset?.asset_annotations;
  const summaries = referenceAssets.map(assetDesignSummary);
  const visualDescriptions = referenceAssets
    .map((asset) => asset.asset_annotations?.visual_description)
    .filter(Boolean)
    .join(" / ");
  const ocrTexts = referenceAssets
    .map((asset) => asset.asset_annotations?.ocr_text)
    .filter(Boolean)
    .join(" / ");

  return {
    canvasShape: inferAspectLabel(firstAsset?.width, firstAsset?.height),
    aspectRatio: firstAsset?.width && firstAsset.height ? `${firstAsset.width}:${firstAsset.height}` : "参考画像に準拠",
    compositionGrid: visualDescriptions || firstAnnotation?.description || "参考画像の主要ブロック配置を維持する。",
    textHierarchy: ocrTexts
      ? `OCRから推定した大見出し・補足見出し・小ラベルの階層を維持する: ${ocrTexts}`
      : "大見出し、補足コピー、小ラベルの階層と相対サイズを参考画像に合わせる。",
    typography: "参考画像の太字感、縁取り、影、文字間隔、フォントの重さ、見出しの相対サイズを維持する。",
    colorPalette: "参考画像の主色、アクセント色、背景色、文字色のコントラストを維持する。",
    visualDensity: "参考画像と同程度の情報密度、余白量、文字量、装飾量にする。",
    imageTreatment: "参考画像の人物・商品・図解・写真の切り抜き方、重ね方、背景処理を参考にする。",
    layoutConstraints: [
      "参考画像の縦横比とキャンバス方向に合わせる。",
      "テキストブロックの位置、面積比、見出しの大きさを参考画像から大きく変えない。",
      "既存の文言、ブランド、商品名は複製せず、今回の記事構成案に合う内容へ置き換える。",
    ],
    referenceObservations: summaries.length ? summaries : ["参考画像のデザイン骨格を維持する。"],
  };
}

export function chooseImageGenerationEndpoint(input: {
  referenceImageCount: number;
  additionalImageCount: number;
}): ImageGenerationEndpoint {
  return input.referenceImageCount + input.additionalImageCount > 0 ? "edit" : "generate";
}

export function createFallbackPromptPlan(input: {
  articleText: string;
  targetLineIndex: number;
  additionalInstruction: string;
  referenceAssets: AssetWithAnnotation[];
  referenceDesignBrief?: ReferenceDesignBrief;
}): ImagePromptPlan {
  const targetLine = selectedLineText(input.articleText, input.targetLineIndex) || "対象行";
  const referenceImageDirections = input.referenceAssets.map((asset, index) => {
    const summary = assetSummary(asset);
    return summary ? `参考画像${index + 1}: ${summary}` : `参考画像${index + 1}: 構図と広告表現を参考にする`;
  });

  return {
    articleSummary: input.articleText.slice(0, 400),
    targetLineRole: targetLine,
    targetLineText: targetLine,
    imageText: targetLine.replace(/^\d+[.．]\s*/, "").slice(0, 34),
    visualDirection: input.additionalInstruction || "記事LPの流れに合う日本のダイレクトレスポンス広告画像にする。",
    layoutDirection:
      input.referenceDesignBrief?.compositionGrid ??
      "スマホ記事LP内で読みやすい構図。強い見出し、主ビジュアル、補助情報を明確に分ける。",
    referenceImageDirections,
    referenceDesignBrief: input.referenceDesignBrief ?? createFallbackReferenceDesignBrief(input.referenceAssets),
    safetyNotes: ["参考画像の既存テキストやブランド表現をそのまま複製しない。"],
    promptSummary: `${input.targetLineIndex + 1}行目向けの記事LP画像`,
  };
}

export function buildFinalImagePrompt(plan: ImagePromptPlan, options: { size: string; quality: string }) {
  return [
    "日本語の記事LPに挿入する広告画像を1枚生成してください。",
    "画像内の文字も含めて画像生成モデル内で一体生成してください。後処理で文字を合成する前提にしないでください。",
    "参考画像がある場合は、まず参考画像のデザイン骨格を最優先で維持してください。既存の文言やブランド要素は複製せず、今回の記事構成案に合わせて置き換えてください。",
    "参考画像デザイン解析:",
    `- キャンバス/比率: ${plan.referenceDesignBrief.canvasShape} / ${plan.referenceDesignBrief.aspectRatio}`,
    `- 構成グリッド: ${plan.referenceDesignBrief.compositionGrid}`,
    `- 文字階層: ${plan.referenceDesignBrief.textHierarchy}`,
    `- 書体/文字装飾: ${plan.referenceDesignBrief.typography}`,
    `- 色設計: ${plan.referenceDesignBrief.colorPalette}`,
    `- 情報密度: ${plan.referenceDesignBrief.visualDensity}`,
    `- 写真/図解処理: ${plan.referenceDesignBrief.imageTreatment}`,
    plan.referenceDesignBrief.layoutConstraints.length
      ? `- 必須レイアウト制約: ${plan.referenceDesignBrief.layoutConstraints.join(" / ")}`
      : null,
    plan.referenceDesignBrief.referenceObservations.length
      ? `- 参考画像観察メモ: ${plan.referenceDesignBrief.referenceObservations.join(" / ")}`
      : null,
    `記事全体の流れ: ${plan.articleSummary}`,
    `対象行の役割: ${plan.targetLineRole}`,
    `対象行: ${plan.targetLineText}`,
    `画像内に入れる主要テキスト: ${plan.imageText}`,
    `ビジュアル方針: ${plan.visualDirection}`,
    `レイアウト方針: ${plan.layoutDirection}`,
    plan.referenceImageDirections.length ? `参考画像から取り入れる要素: ${plan.referenceImageDirections.join(" / ")}` : null,
    plan.safetyNotes.length ? `注意: ${plan.safetyNotes.join(" / ")}` : null,
    `出力サイズ指定: ${options.size}`,
    `品質指定: ${options.quality}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function extractReferenceDesignBrief(input: {
  apiKey: string;
  model: string;
  referenceAssets: AssetWithAnnotation[];
  imageInputs: ImageInputForGeneration[];
}): Promise<ReferenceDesignBrief> {
  const referenceInputs = input.imageInputs.filter((image) => image.source === "reference");
  if (referenceInputs.length === 0) {
    return createFallbackReferenceDesignBrief(input.referenceAssets);
  }

  const openai = new OpenAI({ apiKey: input.apiKey });
  const designPrompt = [
    "あなたは日本のダイレクトレスポンス広告LP画像のアートディレクターです。",
    "添付した参考画像をリバースエンジニアリングし、画像生成プロンプトに使うデザイン仕様JSONだけを返してください。",
    "記事内容や新しいコピーはまだ考えず、参考画像のレイアウト、文字サイズ、文字階層、書体の重さ、縁取り、影、色、余白、写真/図解の配置だけを抽出してください。",
    "返すキー: canvasShape,aspectRatio,compositionGrid,textHierarchy,typography,colorPalette,visualDensity,imageTreatment,layoutConstraints,referenceObservations",
    "layoutConstraintsには、生成時に絶対守るべき比率・配置・文字サイズ・余白の制約を短文で入れてください。",
    "既存文言やブランド表現を複製する指示は入れず、デザイン骨格だけを抽出してください。",
    input.referenceAssets.map(assetDesignSummary).join("\n"),
  ].join("\n");

  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [{ type: "input_text", text: designPrompt }];

  for (const image of referenceInputs) {
    content.push({
      type: "input_image",
      image_url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}`,
      detail: "high",
    });
  }

  const response = await openai.responses.create({
    model: input.model,
    input: [{ role: "user", content }],
  });

  try {
    return referenceDesignBriefSchema.parse(parseJsonObject(response.output_text));
  } catch {
    return createFallbackReferenceDesignBrief(input.referenceAssets);
  }
}

export async function createImagePromptPlan(input: {
  apiKey: string;
  model: string;
  articleText: string;
  targetLineIndex: number;
  additionalInstruction: string;
  referenceAssets: AssetWithAnnotation[];
  imageInputs: ImageInputForGeneration[];
}): Promise<ImagePromptPlan> {
  const openai = new OpenAI({ apiKey: input.apiKey });
  const referenceDesignBrief = await extractReferenceDesignBrief({
    apiKey: input.apiKey,
    model: input.model,
    referenceAssets: input.referenceAssets,
    imageInputs: input.imageInputs,
  });
  const targetLine = selectedLineText(input.articleText, input.targetLineIndex);
  const referenceText = input.referenceAssets.map((asset, index) => `参考画像${index + 1}: ${assetSummary(asset)}`).join("\n");
  const planningPrompt = [
    "あなたは日本のダイレクトレスポンス広告LPの画像ディレクターです。",
    "記事構成案全体、対象行、参考画像デザイン解析を読み取り、画像生成モデルに渡すための設計JSONだけを返してください。",
    "返すキー: articleSummary,targetLineRole,targetLineText,imageText,visualDirection,layoutDirection,referenceImageDirections,referenceDesignBrief,safetyNotes,promptSummary",
    "imageTextには、画像内に大きく入れる日本語コピーを短く具体的に入れてください。",
    "layoutDirectionには、参考画像デザイン解析の構成グリッドを維持したうえで、今回の記事内容をどこに入れるかを書いてください。",
    "referenceDesignBriefは、下に渡す参考画像デザイン解析JSONを原則そのまま保持し、記事内容に合わせて変えてはいけません。",
    "referenceImageDirectionsには、参考画像から取り入れるレイアウトや表現を画像ごとに書いてください。既存文言やブランド要素の複製は禁止です。",
    `記事構成案:\n${input.articleText}`,
    `対象行番号: ${input.targetLineIndex + 1}`,
    `対象行: ${targetLine}`,
    `追加指示: ${input.additionalInstruction}`,
    `参考画像デザイン解析JSON:\n${JSON.stringify(referenceDesignBrief, null, 2)}`,
    referenceText,
  ].join("\n");

  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "low" }
  > = [{ type: "input_text", text: planningPrompt }];

  for (const image of input.imageInputs) {
    content.push({
      type: "input_image",
      image_url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}`,
      detail: "low",
    });
  }

  const response = await openai.responses.create({
    model: input.model,
    input: [{ role: "user", content }],
  });

  try {
    const plan = promptPlanSchema.parse(parseJsonObject(response.output_text));
    return {
      ...plan,
      referenceDesignBrief,
    };
  } catch {
    return createFallbackPromptPlan({ ...input, referenceDesignBrief });
  }
}

export async function generateImageBytes(input: {
  apiKey: string;
  model: string;
  endpoint: ImageGenerationEndpoint;
  prompt: string;
  size: string;
  quality: string;
  imageInputs: ImageInputForGeneration[];
}) {
  const openai = new OpenAI({ apiKey: input.apiKey });
  const commonOptions = {
    model: input.model,
    prompt: input.prompt,
    size: input.size,
    quality: input.quality,
    n: 1,
  };

  const response =
    input.endpoint === "edit"
      ? await openai.images.edit({
          ...commonOptions,
          image: await Promise.all(
            input.imageInputs.map((image) => toFile(image.buffer, image.name, { type: image.mimeType })),
          ),
        } as never)
      : await openai.images.generate(commonOptions as never);

  const imageBase64 = response.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("OpenAI image response did not include image data");
  }

  return {
    buffer: Buffer.from(imageBase64, "base64"),
    usage: (response as { usage?: Record<string, unknown> }).usage ?? null,
    requestId: (response as { _request_id?: string; request_id?: string })._request_id ?? null,
  };
}
