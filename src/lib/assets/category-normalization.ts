import { IMAGE_CATEGORIES, PROBLEM_CATEGORIES } from "./categories";

const PROBLEM_ALIAS_PATTERNS: Array<{ canonical: string; patterns: RegExp[] }> = [
  { canonical: "血糖・糖尿病", patterns: [/血糖/, /糖尿/] },
  { canonical: "薄毛・抜け毛", patterns: [/薄毛/, /抜け毛/, /頭皮/, /育毛/] },
  { canonical: "頻尿・尿もれ", patterns: [/頻尿/, /尿もれ/, /尿漏れ/, /残尿/, /夜間尿/, /膀胱/, /トイレ/] },
  { canonical: "視力低下・老眼", patterns: [/視力/, /老眼/, /見えづら/, /眼圧/, /暗所/] },
  { canonical: "肝臓", patterns: [/肝臓/, /脂肪肝/, /肝機能/] },
  { canonical: "ムダ毛・脱毛", patterns: [/ムダ毛/, /無駄毛/, /体毛/, /脱毛/, /毛の濃さ/] },
  { canonical: "美容", patterns: [/シミ/, /シワ/, /毛穴/, /ニキビ/, /美容/, /肌/] },
  { canonical: "痩身", patterns: [/痩身/, /ダイエット/, /脂肪/, /体重/] },
  { canonical: "ひざ腰", patterns: [/ひざ/, /膝/, /腰/, /関節/] },
  { canonical: "フェムケア", patterns: [/フェムケア/, /更年期/, /デリケート/] },
];

const IMAGE_CATEGORY_ALIASES = new Map<string, string>([
  ["FV", "ファーストビュー"],
  ["ファーストビュー画像", "ファーストビュー"],
  ["ビフォー / アフター", "ビフォーアフター"],
  ["ビフォー・アフター", "ビフォーアフター"],
]);

const TARGET_GENDER_ALIASES = new Map<string, string>([
  ["all", "男女共通"],
  ["全体", "男女共通"],
  ["共通", "男女共通"],
  ["男女共通", "男女共通"],
  ["男女共用", "男女共通"],
  ["男女両方", "男女共通"],
  ["男性・女性", "男女共通"],
  ["男性女性", "男女共通"],
]);

const TARGET_AGE_ALIASES = new Map<string, string>([
  ["10代後半-30代", "10代後半〜30代"],
  ["20代-30代", "20代〜30代"],
  ["18-29歳", "20代"],
  ["50-69", "50代〜60代"],
  ["50s-60s", "50代〜60代"],
  ["シニア", "60代以上"],
  ["シニア層", "60代以上"],
  ["中高年", "40代以上"],
  ["40代,50代,60代以上", "40代以上"],
  ["70代", "70代以上"],
]);

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeProblemCategory(value: string | null | undefined) {
  const label = clean(value);
  if (!label) return null;
  if (PROBLEM_CATEGORIES.includes(label)) return label;

  const matched = PROBLEM_ALIAS_PATTERNS.find((entry) => entry.patterns.some((pattern) => pattern.test(label)));
  return matched?.canonical ?? label;
}

export function inferCanonicalProblemCategory(text: string) {
  const matched = PROBLEM_ALIAS_PATTERNS.find((entry) => entry.patterns.some((pattern) => pattern.test(text)));
  return matched?.canonical ?? null;
}

export function normalizeImageCategory(value: string | null | undefined) {
  const label = clean(value);
  if (!label) return null;
  const aliased = IMAGE_CATEGORY_ALIASES.get(label) ?? label;
  if (IMAGE_CATEGORIES.includes(aliased)) return aliased;
  const matched = IMAGE_CATEGORIES.find((category) => aliased.includes(category));
  return matched ?? aliased;
}

export function normalizeAnnotationImageCategory(value: string | null | undefined) {
  const category = normalizeImageCategory(value);
  return category === "ファーストビュー" ? "その他" : category;
}

export function normalizeTargetGender(value: string | null | undefined) {
  const label = clean(value);
  if (!label) return null;
  if (label === "女性" || label === "男性" || label === "不明") return label;
  return TARGET_GENDER_ALIASES.get(label) ?? label;
}

export function normalizeTargetAgeBand(value: string | null | undefined) {
  const label = clean(value);
  if (!label) return null;
  const aliased = TARGET_AGE_ALIASES.get(label);
  if (aliased) return aliased;
  if (label.includes("60代以") && label !== "60代以下") return "60代以上";
  return label;
}
