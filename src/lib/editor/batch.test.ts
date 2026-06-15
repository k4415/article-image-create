import { describe, expect, it } from "vitest";
import { findNextGenerationLineIndex, normalizeTargetLineIndexes, runWithConcurrency, summarizeGenerationProgress } from "./batch";

describe("image generation batch helpers", () => {
  it("deduplicates and sorts selected target lines for stable batch creation", () => {
    expect(normalizeTargetLineIndexes([3, 1, 3, 0], 10)).toEqual([0, 1, 3]);
  });

  it("rejects empty, invalid, and over-limit target line selections", () => {
    expect(() => normalizeTargetLineIndexes([], 10)).toThrow("生成対象行");
    expect(() => normalizeTargetLineIndexes([0, -1], 10)).toThrow("zero-based");
    expect(() => normalizeTargetLineIndexes(Array.from({ length: 11 }, (_, index) => index), 10)).toThrow("最大10行");
  });

  it("runs workers with a fixed concurrency and preserves every settled result", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await runWithConcurrency([0, 1, 2, 3], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (item === 2) {
        throw new Error("failed item");
      }
      return item * 2;
    });

    expect(maxActive).toBe(2);
    expect(results).toHaveLength(4);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled", "rejected", "fulfilled"]);
  });

  it("summarizes batch progress from granular generation statuses", () => {
    expect(summarizeGenerationProgress(["queued", "completed", "failed", "generating"])).toEqual({
      status: "running",
      queuedCount: 1,
      runningCount: 1,
      completedCount: 1,
      failedCount: 1,
    });

    expect(summarizeGenerationProgress(["completed", "failed"])).toMatchObject({
      status: "completed",
      completedCount: 1,
      failedCount: 1,
    });

    expect(summarizeGenerationProgress(["failed", "failed"])).toMatchObject({
      status: "failed",
      failedCount: 2,
    });
  });

  it("moves the next generation target to the line after the submitted single image line", () => {
    const articleText = ["導入", "悩み喚起", "商品提示"].join("\n");

    expect(findNextGenerationLineIndex(articleText, 0)).toBe(1);
    expect(findNextGenerationLineIndex(articleText, 1)).toBe(2);
    expect(findNextGenerationLineIndex(articleText, 2)).toBe(2);
  });
});
