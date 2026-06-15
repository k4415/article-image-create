import { describe, expect, it } from "vitest";
import { createMockGeneratedImage, validateImageGenerationLimits } from "./mock-generation";

describe("mock image generation helpers", () => {
  it("rejects too many selected reference assets", () => {
    expect(() => validateImageGenerationLimits({ referenceAssetCount: 5, additionalImageCount: 0 })).toThrow(
      "参考素材は最大4枚まで選択できます",
    );
  });

  it("rejects too many additional uploaded images", () => {
    expect(() => validateImageGenerationLimits({ referenceAssetCount: 1, additionalImageCount: 3 })).toThrow(
      "追加画像は最大2枚までアップロードできます",
    );
  });

  it("builds a deterministic mock generated image payload", () => {
    const generated = createMockGeneratedImage({
      now: new Date("2026-06-15T05:30:00.000Z"),
      targetLineIndex: 2,
      referenceAssetIds: ["asset-1", "asset-2"],
      additionalImageCount: 1,
      additionalInstruction: "ニュース風に強い見出しで作る",
      size: "1024x1536",
      quality: "low",
    });

    expect(generated).toMatchObject({
      id: "mock-20260615T053000000Z",
      url: "/globe.svg",
      alt: "生成画像 3行目",
      model: "mock-gpt-image-2",
      size: "1024x1536",
      quality: "low",
      referenceAssetIds: ["asset-1", "asset-2"],
      additionalImageCount: 1,
      status: "completed",
    });
    expect(generated.promptSummary).toContain("ニュース風");
  });
});
