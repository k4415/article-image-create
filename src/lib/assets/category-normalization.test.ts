import { describe, expect, it } from "vitest";
import {
  inferCanonicalProblemCategory,
  normalizeAnnotationImageCategory,
  normalizeImageCategory,
  normalizeProblemCategory,
  normalizeTargetAgeBand,
  normalizeTargetGender,
} from "./category-normalization";

describe("category normalization", () => {
  it("normalizes duplicate problem categories into canonical labels", () => {
    expect(normalizeProblemCategory("薄毛")).toBe("薄毛・抜け毛");
    expect(normalizeProblemCategory("薄毛・抜け毛")).toBe("薄毛・抜け毛");
    expect(normalizeProblemCategory("頻尿")).toBe("頻尿・尿もれ");
    expect(normalizeProblemCategory("頻尿・残尿感")).toBe("頻尿・尿もれ");
    expect(normalizeProblemCategory("頻尿・尿もれ")).toBe("頻尿・尿もれ");
    expect(normalizeProblemCategory("血糖")).toBe("血糖・糖尿病");
    expect(normalizeProblemCategory("血糖・糖尿病対策")).toBe("血糖・糖尿病");
    expect(normalizeProblemCategory("視力低下・老眼・夕方や暗所で見えづらい不安")).toBe("視力低下・老眼");
    expect(normalizeProblemCategory("ムダ毛処理・全身脱毛の費用不安")).toBe("ムダ毛・脱毛");
  });

  it("keeps unknown non-empty problem category labels trimmed", () => {
    expect(normalizeProblemCategory("  新カテゴリ  ")).toBe("新カテゴリ");
    expect(normalizeProblemCategory("")).toBeNull();
    expect(normalizeProblemCategory(null)).toBeNull();
  });

  it("infers canonical problem categories from text", () => {
    expect(inferCanonicalProblemCategory("夜中に何度もトイレに行く頻尿と尿もれの悩み")).toBe("頻尿・尿もれ");
    expect(inferCanonicalProblemCategory("抜け毛が増えて頭皮が目立つ")).toBe("薄毛・抜け毛");
    expect(inferCanonicalProblemCategory("糖尿病と血糖値が気になる")).toBe("血糖・糖尿病");
  });

  it("normalizes image category aliases", () => {
    expect(normalizeImageCategory("FV")).toBe("ファーストビュー");
    expect(normalizeImageCategory("ファーストビュー画像")).toBe("ファーストビュー");
    expect(normalizeImageCategory("ビフォー / アフター")).toBe("ビフォーアフター");
    expect(normalizeImageCategory("")).toBeNull();
  });

  it("normalizes target gender aliases", () => {
    expect(normalizeTargetGender("女性")).toBe("女性");
    expect(normalizeTargetGender("男性")).toBe("男性");
    expect(normalizeTargetGender("all")).toBe("男女共通");
    expect(normalizeTargetGender("全体")).toBe("男女共通");
    expect(normalizeTargetGender("共通")).toBe("男女共通");
    expect(normalizeTargetGender("男女共通")).toBe("男女共通");
    expect(normalizeTargetGender("男女共用")).toBe("男女共通");
    expect(normalizeTargetGender("男女両方")).toBe("男女共通");
    expect(normalizeTargetGender("男性・女性")).toBe("男女共通");
    expect(normalizeTargetGender("不明")).toBe("不明");
    expect(normalizeTargetGender("")).toBeNull();
  });

  it("normalizes target age band aliases while preserving distinct granularity", () => {
    expect(normalizeTargetAgeBand("10代後半-30代")).toBe("10代後半〜30代");
    expect(normalizeTargetAgeBand("20代-30代")).toBe("20代〜30代");
    expect(normalizeTargetAgeBand("18-29歳")).toBe("20代");
    expect(normalizeTargetAgeBand("50-69")).toBe("50代〜60代");
    expect(normalizeTargetAgeBand("50s-60s")).toBe("50代〜60代");
    expect(normalizeTargetAgeBand("60代以���")).toBe("60代以上");
    expect(normalizeTargetAgeBand("シニア")).toBe("60代以上");
    expect(normalizeTargetAgeBand("シニア層")).toBe("60代以上");
    expect(normalizeTargetAgeBand("中高年")).toBe("40代以上");
    expect(normalizeTargetAgeBand("40代,50代,60代以上")).toBe("40代以上");
    expect(normalizeTargetAgeBand("70代")).toBe("70代以上");
    expect(normalizeTargetAgeBand("全年齢")).toBe("全年齢");
    expect(normalizeTargetAgeBand("40代")).toBe("40代");
    expect(normalizeTargetAgeBand("40代以上")).toBe("40代以上");
    expect(normalizeTargetAgeBand("")).toBeNull();
  });

  it("keeps first view available for filters but removes it from annotation categories", () => {
    expect(normalizeImageCategory("ファーストビュー")).toBe("ファーストビュー");
    expect(normalizeAnnotationImageCategory("ファーストビュー")).toBe("その他");
    expect(normalizeAnnotationImageCategory("FV")).toBe("その他");
    expect(normalizeAnnotationImageCategory("悩み喚起")).toBe("悩み喚起");
  });
});
