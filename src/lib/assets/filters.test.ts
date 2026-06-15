import { describe, expect, it } from "vitest";
import { filterAssetRows } from "./filters";

const rows = [
  {
    id: "asset-1",
    product_name: "血糖サプリ",
    problem_category: "血糖・糖尿病",
    target_gender: "男性",
    target_age_band: "60代",
    source_article_url: "https://example.com/a",
    asset_sources: [{ source_article_url: "https://example.com/a", is_first_view: true }],
    asset_annotations: {
      image_category: "その他",
      lp_section_role: "導入",
      appeal_role: "実績提示",
      description: "医師が登場する強い見出し画像",
      ocr_text: "血糖値に注意",
      tags: ["医師"],
    },
  },
  {
    id: "asset-2",
    product_name: "頻尿サプリ",
    problem_category: "頻尿・尿もれ",
    target_gender: "女性",
    target_age_band: "50代",
    source_article_url: "https://example.com/b",
    asset_sources: [{ source_article_url: "https://example.com/b", is_first_view: false }],
    asset_annotations: {
      image_category: "悩み喚起",
      lp_section_role: "問題提起",
      appeal_role: "不安喚起",
      description: "夜間頻尿の不安訴求",
      ocr_text: "夜トイレ",
      tags: ["悩み"],
    },
  },
];

describe("filterAssetRows", () => {
  it("filters by image category", () => {
    expect(filterAssetRows(rows, { imageCategory: "ファーストビュー" }).map((row) => row.id)).toEqual(["asset-1"]);
  });

  it("combines problem category and free text filters", () => {
    expect(filterAssetRows(rows, { problemCategory: "頻尿・尿もれ", q: "夜間" }).map((row) => row.id)).toEqual([
      "asset-2",
    ]);
  });

  it("matches any selected problem category and any selected image category", () => {
    const result = filterAssetRows(rows, {
      problemCategories: ["血糖・糖尿病", "頻尿・尿もれ"],
      imageCategories: ["ファーストビュー"],
    });

    expect(result.map((row) => row.id)).toEqual(["asset-1"]);
  });

  it("matches any selected target gender", () => {
    expect(filterAssetRows(rows, { targetGenders: ["女性"] }).map((row) => row.id)).toEqual(["asset-2"]);
    expect(filterAssetRows(rows, { targetGenders: ["男性", "女性"] }).map((row) => row.id)).toEqual([
      "asset-1",
      "asset-2",
    ]);
  });

  it("normalizes target gender aliases before matching", () => {
    expect(
      filterAssetRows(
        [
          { id: "asset-5", target_gender: "all", target_age_band: "50s-60s", asset_annotations: null },
          { id: "asset-6", target_gender: "男性・女性", target_age_band: "シニア", asset_annotations: null },
        ],
        { targetGenders: ["男女共通"] },
      ).map((row) => row.id),
    ).toEqual(["asset-5", "asset-6"]);
  });

  it("matches any selected target age band", () => {
    expect(filterAssetRows(rows, { targetAgeBands: ["60代"] }).map((row) => row.id)).toEqual(["asset-1"]);
  });

  it("normalizes target age band aliases before matching", () => {
    expect(
      filterAssetRows(
        [
          { id: "asset-5", target_gender: "all", target_age_band: "50s-60s", asset_annotations: null },
          { id: "asset-6", target_gender: "男性・女性", target_age_band: "シニア", asset_annotations: null },
        ],
        { targetAgeBands: ["50代〜60代", "60代以上"] },
      ).map((row) => row.id),
    ).toEqual(["asset-5", "asset-6"]);
  });

  it("combines target gender, target age band, and problem category filters", () => {
    expect(
      filterAssetRows(rows, {
        targetGenders: ["女性"],
        targetAgeBands: ["50代"],
        problemCategories: ["頻尿・尿もれ"],
      }).map((row) => row.id),
    ).toEqual(["asset-2"]);
  });

  it("keyword search includes image category and lp section role", () => {
    expect(filterAssetRows(rows, { q: "ファーストビュー" }).map((row) => row.id)).toEqual(["asset-1"]);
    expect(filterAssetRows(rows, { q: "問題提起" }).map((row) => row.id)).toEqual(["asset-2"]);
  });

  it("does not match first view from annotation alone", () => {
    expect(
      filterAssetRows(
        [
          {
            id: "asset-3",
            problem_category: "血糖・糖尿病",
            source_article_url: "https://example.com/c",
            asset_sources: [{ source_article_url: "https://example.com/c", is_first_view: false }],
            asset_annotations: { image_category: "ファーストビュー", description: "旧データ", tags: [] },
          },
        ],
        { imageCategory: "ファーストビュー" },
      ).map((row) => row.id),
    ).toEqual([]);
  });

  it("treats an exact first-view keyword as the source-based image element", () => {
    expect(
      filterAssetRows(
        [
          ...rows,
          {
            id: "asset-4",
            problem_category: "血糖・糖尿病",
            source_article_url: "https://example.com/d",
            asset_sources: [{ source_article_url: "https://example.com/d", is_first_view: false }],
            asset_annotations: { image_category: "その他", description: "ファーストビュー風の中盤画像", tags: [] },
          },
        ],
        { q: "ファーストビュー" },
      ).map((row) => row.id),
    ).toEqual(["asset-1"]);
  });
});
