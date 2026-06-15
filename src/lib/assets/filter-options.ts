import { normalizeTargetAgeBand, normalizeTargetGender } from "./category-normalization";

const TARGET_GENDER_ORDER = ["女性", "男性", "男女共通", "不明"];

type AssetFilterOptionRow = {
  target_gender?: unknown;
  target_age_band?: unknown;
};

function distinctStrings(values: unknown[], normalize: (value: string | null | undefined) => string | null) {
  const normalizedValues = values
    .map((value) => (typeof value === "string" ? normalize(value) : null))
    .filter((value): value is string => Boolean(value));

  return Array.from(
    new Set(normalizedValues),
  ).sort((left, right) => left.localeCompare(right, "ja"));
}

function sortTargetGenders(values: string[]) {
  return values.sort((left, right) => {
    const leftIndex = TARGET_GENDER_ORDER.indexOf(left);
    const rightIndex = TARGET_GENDER_ORDER.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
    }
    return left.localeCompare(right, "ja");
  });
}

export function buildAssetFilterOptions(rows: AssetFilterOptionRow[]) {
  return {
    targetGenders: sortTargetGenders(
      distinctStrings(
        rows.map((row) => row.target_gender),
        normalizeTargetGender,
      ),
    ),
    targetAgeBands: distinctStrings(
      rows.map((row) => row.target_age_band),
      normalizeTargetAgeBand,
    ),
  };
}
