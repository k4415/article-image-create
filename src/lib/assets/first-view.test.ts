import { describe, expect, it } from "vitest";
import { hasFirstViewSource, selectFirstViewSourceIds } from "./first-view";

describe("first view source helpers", () => {
  it("selects one first-view source per article by source order", () => {
    const selected = selectFirstViewSourceIds([
      { id: "a-2", asset_id: "asset-2", source_article_url: "https://example.com/a", source_order: 2, created_at: "2026-01-01T00:00:02Z" },
      { id: "a-1", asset_id: "asset-1", source_article_url: "https://example.com/a", source_order: 0, created_at: "2026-01-01T00:00:01Z" },
      { id: "b-2", asset_id: "asset-4", source_article_url: "https://example.com/b", source_order: 5, created_at: "2026-01-01T00:00:04Z" },
      { id: "b-1", asset_id: "asset-3", source_article_url: "https://example.com/b", source_order: 1, created_at: "2026-01-01T00:00:03Z" },
    ]);

    expect([...selected].sort()).toEqual(["a-1", "b-1"]);
  });

  it("breaks source-order ties deterministically", () => {
    const selected = selectFirstViewSourceIds([
      { id: "later", asset_id: "asset-2", source_article_url: "https://example.com/a", source_order: 0, created_at: "2026-01-01T00:00:02Z" },
      { id: "earlier", asset_id: "asset-1", source_article_url: "https://example.com/a", source_order: 0, created_at: "2026-01-01T00:00:01Z" },
    ]);

    expect([...selected]).toEqual(["earlier"]);
  });

  it("detects first-view status from asset sources", () => {
    expect(
      hasFirstViewSource({
        asset_sources: [
          { source_article_url: "https://example.com/a", is_first_view: false },
          { source_article_url: "https://example.com/b", is_first_view: true },
        ],
      }),
    ).toBe(true);
    expect(hasFirstViewSource({ asset_sources: [{ source_article_url: "https://example.com/a", is_first_view: false }] })).toBe(false);
  });
});
