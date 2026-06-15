import { describe, expect, it } from "vitest";
import { buildSearchText } from "./search-text";

describe("buildSearchText", () => {
  it("combines target, problem, roles, description, OCR text, and tags for embeddings", () => {
    const searchText = buildSearchText({
      productName: "トメラックEX",
      targetGender: "男性",
      targetAgeBand: "60代以上",
      problemCategory: "尿漏れ・頻尿",
      imageCategory: "悩み喚起",
      lpSectionRole: "導入",
      appealRole: "不安喚起",
      description: "外出中に尿漏れがバレないか不安な高齢男性の画像",
      ocrText: "バレないかヒヤヒヤ",
      tags: ["高齢者", "外出", "悩み"],
    });

    expect(searchText).toContain("商材: トメラックEX");
    expect(searchText).toContain("ターゲット: 男性 60代以上");
    expect(searchText).toContain("悩みカテゴリ: 尿漏れ・頻尿");
    expect(searchText).toContain("LP内役割: 導入");
    expect(searchText).toContain("訴求役割: 不安喚起");
    expect(searchText).toContain("画像内テキスト: バレないかヒヤヒヤ");
    expect(searchText).toContain("タグ: 高齢者, 外出, 悩み");
  });
});
