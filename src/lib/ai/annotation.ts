import OpenAI from "openai";
import { z } from "zod";
import { IMAGE_CATEGORIES, PROBLEM_CATEGORIES } from "@/lib/assets/categories";
import {
  normalizeAnnotationImageCategory,
  normalizeProblemCategory,
  normalizeTargetAgeBand,
  normalizeTargetGender,
} from "@/lib/assets/category-normalization";
import type { MediaCandidate } from "@/lib/ingest/extract";
import type { ArticleContext } from "@/lib/ingest/article-context";

const ANNOTATION_IMAGE_CATEGORIES = IMAGE_CATEGORIES.filter((category) => category !== "ファーストビュー");

const annotationSchema = z.object({
  productName: z.string().nullable().default(null),
  targetGender: z.string().nullable().default(null),
  targetAgeBand: z.string().nullable().default(null),
  problemCategory: z.string().nullable().default(null),
  imageCategory: z.string().nullable().default(null),
  lpSectionRole: z.string().nullable().default(null),
  appealRole: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  visualDescription: z.string().nullable().default(null),
  ocrText: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  confidence: z.number().nullable().default(null),
});

export type AssetAiAnnotation = z.infer<typeof annotationSchema>;

export type AnnotateInput = {
  mediaBuffer: Buffer;
  mimeType: string;
  articleContext: ArticleContext;
  candidate: MediaCandidate;
};

function parseJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in OpenAI response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function normalizeAnnotation(annotation: AssetAiAnnotation): AssetAiAnnotation {
  return {
    ...annotation,
    targetGender: normalizeTargetGender(annotation.targetGender),
    targetAgeBand: normalizeTargetAgeBand(annotation.targetAgeBand),
    problemCategory: normalizeProblemCategory(annotation.problemCategory),
    imageCategory: normalizeAnnotationImageCategory(annotation.imageCategory),
  };
}

export function fallbackAnnotation(input: Omit<AnnotateInput, "mediaBuffer" | "mimeType">): AssetAiAnnotation {
  const descriptionParts = [
    input.articleContext.productName ? `${input.articleContext.productName}の記事LP素材` : "記事LP素材",
    input.articleContext.problemCategory ? `${input.articleContext.problemCategory}カテゴリ` : null,
    input.candidate.altText ? `alt: ${input.candidate.altText}` : null,
    `${input.candidate.foundIn}から抽出`,
  ].filter(Boolean);

  return {
    productName: input.articleContext.productName,
    targetGender: normalizeTargetGender(input.articleContext.targetGender),
    targetAgeBand: normalizeTargetAgeBand(input.articleContext.targetAgeBand),
    problemCategory: normalizeProblemCategory(input.articleContext.problemCategory),
    imageCategory: "その他",
    lpSectionRole: "未分類",
    appealRole: "未分類",
    description: descriptionParts.join("。"),
    visualDescription: null,
    ocrText: input.candidate.altText ?? null,
    tags: [input.candidate.mediaType, input.candidate.foundIn],
    confidence: 0,
  };
}

export async function annotateImageWithOpenAI(input: AnnotateInput, apiKey: string, model: string) {
  if (!input.mimeType.startsWith("image/")) {
    return fallbackAnnotation(input);
  }

  const openai = new OpenAI({ apiKey });
  const prompt = [
    "あなたは日本のダイレクトレスポンス広告LPの画像素材を分類するアノテーターです。",
    "画像の内容と、記事本文から推測できる文脈を使って、素材DB用のJSONだけを返してください。",
    "返すキー: productName,targetGender,targetAgeBand,problemCategory,imageCategory,lpSectionRole,appealRole,description,visualDescription,ocrText,tags,confidence",
    "targetGenderは 女性, 男性, 男女共通, 不明 のいずれか。判断できない場合はnull。",
    "targetAgeBandは 20代, 20代〜30代, 30代〜50代, 40代, 40代以上, 50代以上, 50代〜60代, 60代以上, 70代以上, 全年齢 など、記事文脈に近い簡潔な表記。判断できない場合はnull。",
    `problemCategoryは次のいずれかから選ぶ: ${PROBLEM_CATEGORIES.join(", ")}`,
    `imageCategoryは次のいずれかから選ぶ: ${ANNOTATION_IMAGE_CATEGORIES.join(", ")}`,
    "lpSectionRole例: 導入, 問題提起, 原因説明, 解決策提示, 根拠, 商品提示, オファー, フォーム, 追伸",
    "appealRole例: 不安喚起, 思い込み破壊, 権威付け, 実績提示, 理想未来, 緊急性, 安心材料, 行動促進",
    `記事URL: ${input.articleContext.articleUrl}`,
    `記事タイトル: ${input.articleContext.title ?? ""}`,
    `推測商材: ${input.articleContext.productName ?? ""}`,
    `推測悩みカテゴリ: ${input.articleContext.problemCategory ?? ""}`,
    `抽出位置: ${input.candidate.sourceOrder}`,
    `alt: ${input.candidate.altText ?? ""}`,
    `記事本文抜粋: ${input.articleContext.text.slice(0, 2500)}`,
  ].join("\n");

  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: `data:${input.mimeType};base64,${input.mediaBuffer.toString("base64")}`,
            detail: "low",
          },
        ],
      },
    ],
  });

  return normalizeAnnotation(annotationSchema.parse(parseJsonObject(response.output_text)));
}
