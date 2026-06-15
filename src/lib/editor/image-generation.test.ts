import { describe, expect, it } from "vitest";
import {
  buildFinalImagePrompt,
  chooseImageGenerationEndpoint,
  createFallbackReferenceDesignBrief,
  createFallbackPromptPlan,
  resolveImageOutputSize,
} from "./image-generation";

describe("image generation helpers", () => {
  it("uses edit when reference or additional images exist", () => {
    expect(chooseImageGenerationEndpoint({ referenceImageCount: 0, additionalImageCount: 0 })).toBe("generate");
    expect(chooseImageGenerationEndpoint({ referenceImageCount: 1, additionalImageCount: 0 })).toBe("edit");
    expect(chooseImageGenerationEndpoint({ referenceImageCount: 0, additionalImageCount: 1 })).toBe("edit");
  });

  it("builds a prompt plan from article text, target line, references, and instructions", () => {
    const plan = createFallbackPromptPlan({
      articleText: ["導入", "悩み喚起: 血糖リスクを提示", "商品提示"].join("\n"),
      targetLineIndex: 1,
      additionalInstruction: "ニュース記事風にする",
      referenceAssets: [
        {
          id: "asset-1",
          product_name: "血糖サプリ",
          problem_category: "血糖",
          asset_annotations: {
            image_category: "ファーストビュー",
            lp_section_role: "導入",
            appeal_role: "不安喚起",
            description: "強い見出しと医師写真",
            visual_description: "赤い帯見出し",
            ocr_text: "血糖値",
          },
        } as never,
      ],
    });

    expect(plan.targetLineText).toContain("血糖リスク");
    expect(plan.visualDirection).toContain("ニュース記事風");
    expect(plan.referenceImageDirections.join("\n")).toContain("ファーストビュー");
    expect(plan.referenceDesignBrief.textHierarchy).toContain("大見出し");
  });

  it("keeps text instructions inside the final image prompt", () => {
    const finalPrompt = buildFinalImagePrompt(
      {
        articleSummary: "血糖リスクを提示して商品へつなげる",
        targetLineRole: "悩み喚起",
        targetLineText: "悩み喚起: 血糖リスクを提示",
        imageText: "食後の眠気は血糖サイン?",
        visualDirection: "高齢男性が不安そうに食卓を見る",
        layoutDirection: "縦長、上部に大見出し、中央に人物",
        referenceImageDirections: ["赤い見出し帯と人物写真の構図を参考にする"],
        referenceDesignBrief: {
          canvasShape: "横長バナー",
          aspectRatio: "3:2",
          compositionGrid: "上部に赤い帯見出し、中央に人物、下部に太いCTA帯",
          textHierarchy: "最上部の大見出し、中央の極太強調語、下部の補足コピー",
          typography: "白フチ付き太字ゴシック、赤と黄色の強い縁取り、文字は画面幅の20%以上",
          colorPalette: "赤、黄色、白、黒を中心に高コントラスト",
          visualDensity: "情報量が多い記事LP風",
          imageTreatment: "人物写真と帯見出しを重ねる",
          layoutConstraints: ["横長比率を維持", "見出し帯の比率を維持"],
          referenceObservations: ["上部テキスト帯が画面の約25%"],
        },
        safetyNotes: ["既存文言を複製しない"],
        promptSummary: "血糖悩み喚起画像",
      },
      { size: "1536x1024", quality: "low" },
    );

    expect(finalPrompt).toContain("画像内の文字も含めて画像生成モデル内で一体生成");
    expect(finalPrompt).toContain("食後の眠気は血糖サイン?");
    expect(finalPrompt).toContain("赤い見出し帯");
    expect(finalPrompt).toContain("参考画像デザイン解析");
    expect(finalPrompt).toContain("白フチ付き太字ゴシック");
    expect(finalPrompt).toContain("横長比率を維持");
    expect(finalPrompt).toContain("出力サイズ指定: 1536x1024");
  });

  it("derives auto output size from the first reference image aspect ratio", () => {
    expect(resolveImageOutputSize("auto", [{ width: 1200, height: 628 } as never])).toBe("1536x1024");
    expect(resolveImageOutputSize("auto", [{ width: 800, height: 1200 } as never])).toBe("1024x1536");
    expect(resolveImageOutputSize("auto", [{ width: 1000, height: 980 } as never])).toBe("1024x1024");
    expect(resolveImageOutputSize("1024x1536", [{ width: 1200, height: 628 } as never])).toBe("1024x1536");
  });

  it("creates a design brief fallback that preserves reference layout metadata", () => {
    const brief = createFallbackReferenceDesignBrief([
      {
        width: 1200,
        height: 628,
        asset_annotations: {
          image_category: "ファーストビュー",
          visual_description: "赤い上部帯、白フチの大きな見出し、人物写真",
          ocr_text: "糖尿病に効く",
        },
      } as never,
    ]);

    expect(brief.canvasShape).toContain("横長");
    expect(brief.compositionGrid).toContain("赤い上部帯");
    expect(brief.textHierarchy).toContain("OCR");
    expect(brief.layoutConstraints.join("\n")).toContain("参考画像の縦横比");
  });
});
