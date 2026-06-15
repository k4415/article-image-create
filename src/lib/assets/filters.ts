import { IMAGE_CATEGORIES } from "./categories";
import {
  normalizeImageCategory,
  normalizeProblemCategory,
  normalizeTargetAgeBand,
  normalizeTargetGender,
} from "./category-normalization";
import { hasFirstViewSource } from "./first-view";

type RawAssetRow = Record<string, unknown> & {
  asset_annotations?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  asset_sources?: Record<string, unknown> | Array<Record<string, unknown>> | null;
};

export type AssetSearchFilters = {
  problemCategories?: string[] | null;
  problemCategory?: string | null;
  imageCategories?: string[] | null;
  imageCategory?: string | null;
  productNames?: string[] | null;
  productName?: string | null;
  targetGenders?: string[] | null;
  targetGender?: string | null;
  targetAgeBands?: string[] | null;
  targetAgeBand?: string | null;
  q?: string | null;
};

function annotationFor(row: RawAssetRow) {
  return Array.isArray(row.asset_annotations) ? row.asset_annotations[0] : row.asset_annotations;
}

function includes(value: unknown, query: string) {
  return typeof value === "string" && value.toLowerCase().includes(query.toLowerCase());
}

function selected(values: Array<string | null | undefined> | null | undefined) {
  return Array.from(new Set((values ?? []).map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function matchesImageCategorySelection(
  row: RawAssetRow,
  annotation: Record<string, unknown> | Array<Record<string, unknown>> | null | undefined,
  imageCategories: string[],
) {
  const currentAnnotation = Array.isArray(annotation) ? annotation[0] : annotation;
  const matchesFirstView = imageCategories.includes("ファーストビュー") && hasFirstViewSource(row);
  const nonFirstViewCategories = imageCategories.filter((category) => category !== "ファーストビュー");
  const matchesAnnotation = nonFirstViewCategories.includes(String(currentAnnotation?.image_category ?? ""));
  return matchesFirstView || matchesAnnotation;
}

export function assetMatchesFilters(row: RawAssetRow, filters: AssetSearchFilters) {
  const annotation = annotationFor(row);
  const problemCategories = selected([
    ...(filters.problemCategories ?? []).map((value) => normalizeProblemCategory(value)),
    normalizeProblemCategory(filters.problemCategory),
  ]);
  const imageCategories = selected([
    ...(filters.imageCategories ?? []).map((value) => normalizeImageCategory(value)),
    normalizeImageCategory(filters.imageCategory),
  ]);
  const productNames = selected([...(filters.productNames ?? []), filters.productName]);
  const targetGenders = selected([...(filters.targetGenders ?? []), filters.targetGender].map((value) => normalizeTargetGender(value)));
  const targetAgeBands = selected(
    [...(filters.targetAgeBands ?? []), filters.targetAgeBand].map((value) => normalizeTargetAgeBand(value)),
  );

  if (problemCategories.length > 0 && !problemCategories.includes(String(row.problem_category ?? ""))) return false;
  if (productNames.length > 0 && !productNames.includes(String(row.product_name ?? ""))) return false;
  if (targetGenders.length > 0 && !targetGenders.includes(String(normalizeTargetGender(String(row.target_gender ?? "")) ?? ""))) {
    return false;
  }
  if (targetAgeBands.length > 0 && !targetAgeBands.includes(String(normalizeTargetAgeBand(String(row.target_age_band ?? "")) ?? ""))) {
    return false;
  }
  if (imageCategories.length > 0 && !matchesImageCategorySelection(row, annotation, imageCategories)) return false;

  const q = filters.q?.trim();
  if (!q) return true;
  const exactImageCategory = normalizeImageCategory(q);
  if (exactImageCategory && IMAGE_CATEGORIES.includes(exactImageCategory)) {
    return matchesImageCategorySelection(row, annotation, [exactImageCategory]);
  }

  return (
    includes(row.product_name, q) ||
    includes(row.problem_category, q) ||
    includes(row.target_gender, q) ||
    includes(row.target_age_band, q) ||
    includes(row.source_article_url, q) ||
    (q === "ファーストビュー" && hasFirstViewSource(row)) ||
    includes(annotation?.image_category, q) ||
    includes(annotation?.lp_section_role, q) ||
    includes(annotation?.appeal_role, q) ||
    includes(annotation?.description, q) ||
    includes(annotation?.ocr_text, q) ||
    (Array.isArray(annotation?.tags) && annotation.tags.some((tag) => includes(tag, q)))
  );
}

export function filterAssetRows<T extends RawAssetRow>(rows: T[], filters: AssetSearchFilters) {
  return rows.filter((row) => assetMatchesFilters(row, filters));
}
