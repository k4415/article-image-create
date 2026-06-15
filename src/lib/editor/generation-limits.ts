const ALLOWED_ADDITIONAL_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateImageGenerationLimits(input: {
  referenceAssetCount: number;
  additionalImageCount: number;
}) {
  if (input.referenceAssetCount > 4) {
    throw new Error("参考素材は最大4枚まで選択できます");
  }
  if (input.additionalImageCount > 2) {
    throw new Error("追加画像は最大2枚までアップロードできます");
  }
}

export function validateAdditionalImageType(mimeType: string) {
  if (!ALLOWED_ADDITIONAL_IMAGE_TYPES.has(mimeType)) {
    throw new Error("追加画像はPNG/JPEG/WebPのみアップロードできます");
  }
}
