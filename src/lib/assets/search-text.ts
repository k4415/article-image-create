export type SearchTextInput = {
  productName?: string | null;
  targetGender?: string | null;
  targetAgeBand?: string | null;
  problemCategory?: string | null;
  imageCategory?: string | null;
  lpSectionRole?: string | null;
  appealRole?: string | null;
  description?: string | null;
  ocrText?: string | null;
  tags?: string[] | null;
};

export function buildSearchText(input: SearchTextInput): string {
  const target = [input.targetGender, input.targetAgeBand].filter(Boolean).join(" ");
  const lines = [
    input.productName ? `商材: ${input.productName}` : null,
    target ? `ターゲット: ${target}` : null,
    input.problemCategory ? `悩みカテゴリ: ${input.problemCategory}` : null,
    input.imageCategory ? `画像カテゴリ: ${input.imageCategory}` : null,
    input.lpSectionRole ? `LP内役割: ${input.lpSectionRole}` : null,
    input.appealRole ? `訴求役割: ${input.appealRole}` : null,
    input.description ? `説明: ${input.description}` : null,
    input.ocrText ? `画像内テキスト: ${input.ocrText}` : null,
    input.tags?.length ? `タグ: ${input.tags.join(", ")}` : null,
  ];

  return lines.filter(Boolean).join("\n");
}
