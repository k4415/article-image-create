import { describe, expect, it } from "vitest";
import { buildLastFrameFfmpegArgs } from "./video";

describe("buildLastFrameFfmpegArgs", () => {
  it("seeks near the end when video duration is known", () => {
    expect(buildLastFrameFfmpegArgs({ inputPath: "/tmp/input.mp4", outputPath: "/tmp/frame.jpg", durationSeconds: 3.4 })).toContain(
      "3.200",
    );
  });

  it("uses sseof fallback when duration is unavailable", () => {
    const args = buildLastFrameFfmpegArgs({ inputPath: "/tmp/input.mp4", outputPath: "/tmp/frame.jpg", durationSeconds: null });

    expect(args).toContain("-sseof");
    expect(args).toContain("-0.2");
    expect(args.slice(0, 5)).toEqual(["-y", "-sseof", "-0.2", "-i", "/tmp/input.mp4"]);
  });
});
