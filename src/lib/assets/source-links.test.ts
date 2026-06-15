import { describe, expect, it } from "vitest";
import { getPrimaryArticleUrl, getUniqueArticleUrls } from "./source-links";

describe("source article link helpers", () => {
  it("uses the asset source_article_url as the primary article URL", () => {
    expect(
      getPrimaryArticleUrl({
        source_article_url: "https://example.com/article-a",
        asset_sources: [{ source_article_url: "https://example.com/article-b" }],
      }),
    ).toBe("https://example.com/article-a");
  });

  it("falls back to the first asset source when the asset source URL is missing", () => {
    expect(
      getPrimaryArticleUrl({
        source_article_url: "",
        asset_sources: [{ source_article_url: "https://example.com/article-b" }],
      }),
    ).toBe("https://example.com/article-b");
  });

  it("deduplicates source article URLs and keeps the primary URL first", () => {
    expect(
      getUniqueArticleUrls({
        source_article_url: "https://example.com/article-a",
        asset_sources: [
          { source_article_url: "https://example.com/article-b" },
          { source_article_url: "https://example.com/article-a" },
        ],
      }),
    ).toEqual(["https://example.com/article-a", "https://example.com/article-b"]);
  });
});
