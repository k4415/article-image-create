import { describe, expect, it } from "vitest";
import { getCanonicalSourceMediaUrl, shouldReuseExistingAsset } from "./dedupe";

describe("ingest dedupe helpers", () => {
  it("deduplicates assets globally by file hash instead of article url", () => {
    expect(
      shouldReuseExistingAsset({
        existingFileHash: "same-hash",
        nextFileHash: "same-hash",
        existingSourceArticleUrl: "https://example.com/ab/a",
        nextSourceArticleUrl: "https://example.com/ab/b",
      }),
    ).toBe(true);
  });

  it("keeps a stable frame source url for video-derived images", () => {
    expect(getCanonicalSourceMediaUrl("https://example.com/movie.mp4", "video")).toBe(
      "https://example.com/movie.mp4#frame=last",
    );
    expect(getCanonicalSourceMediaUrl("https://example.com/fv.jpg", "image")).toBe("https://example.com/fv.jpg");
  });
});
