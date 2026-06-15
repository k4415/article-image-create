import { describe, expect, it } from "vitest";
import { calculateIngestProgressPercent } from "./progress";

describe("calculateIngestProgressPercent", () => {
  it("uses processed candidates over total candidates when candidates are known", () => {
    expect(calculateIngestProgressPercent({ totalCandidates: 20, processedCandidates: 5, totalUrls: 6, processedUrls: 1 })).toBe(
      25,
    );
  });

  it("falls back to processed urls while candidates are still being discovered", () => {
    expect(calculateIngestProgressPercent({ totalCandidates: 0, processedCandidates: 0, totalUrls: 4, processedUrls: 1 })).toBe(
      25,
    );
  });

  it("caps progress at 100", () => {
    expect(calculateIngestProgressPercent({ totalCandidates: 3, processedCandidates: 10, totalUrls: 1, processedUrls: 1 })).toBe(
      100,
    );
  });
});
