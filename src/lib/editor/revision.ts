export function buildEffectiveAdditionalInstruction(input: {
  baseInstruction: string | null | undefined;
  revisionInstruction: string | null | undefined;
}) {
  if (!input.revisionInstruction?.trim()) {
    return input.baseInstruction ?? "";
  }

  return [
    "これは生成済み画像を元にした修正生成です。入力画像のレイアウト、文字階層、比率、主なビジュアル構成を維持してください。",
    input.baseInstruction ? `元の追加指示: ${input.baseInstruction}` : null,
    `修正指示: ${input.revisionInstruction.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRevisionImageInputPaths(parentStoragePath: string, uploadedPaths: string[]) {
  return [parentStoragePath, ...uploadedPaths];
}
