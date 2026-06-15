export { validateImageGenerationLimits } from "./generation-limits";

export type MockGeneratedImage = {
  id: string;
  url: string;
  alt: string;
  model: string;
  size: string;
  quality: string;
  referenceAssetIds: string[];
  additionalImageCount: number;
  additionalInstruction: string;
  promptSummary: string;
  status: "completed";
};

export function createMockGeneratedImage(_input: {
  now: Date;
  targetLineIndex: number;
  referenceAssetIds: string[];
  additionalImageCount: number;
  additionalInstruction: string;
  size: string;
  quality: string;
}): MockGeneratedImage {
  const timestamp = _input.now.toISOString().replace(/[-:.]/g, "");
  const instruction = _input.additionalInstruction.trim();
  return {
    id: `mock-${timestamp}`,
    url: "/globe.svg",
    alt: `生成画像 ${_input.targetLineIndex + 1}行目`,
    model: "mock-gpt-image-2",
    size: _input.size,
    quality: _input.quality,
    referenceAssetIds: _input.referenceAssetIds,
    additionalImageCount: _input.additionalImageCount,
    additionalInstruction: instruction,
    promptSummary: [
      `${_input.targetLineIndex + 1}行目に挿入する記事LP画像のモック`,
      _input.referenceAssetIds.length ? `参考素材${_input.referenceAssetIds.length}件` : "参考素材なし",
      _input.additionalImageCount ? `追加画像${_input.additionalImageCount}件` : "追加画像なし",
      instruction ? `追加指示: ${instruction}` : null,
    ]
      .filter(Boolean)
      .join(" / "),
    status: "completed",
  };
}
