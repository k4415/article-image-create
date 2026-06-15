import { describe, expect, it } from "vitest";
import { buildEffectiveAdditionalInstruction, buildRevisionImageInputPaths } from "./revision";

describe("image generation queue helpers", () => {
  it("keeps the original instruction when there is no revision instruction", () => {
    expect(
      buildEffectiveAdditionalInstruction({
        baseInstruction: "ニュース記事風にする",
        revisionInstruction: "",
      }),
    ).toBe("ニュース記事風にする");
  });

  it("combines the original instruction and revision instruction for image edits", () => {
    const instruction = buildEffectiveAdditionalInstruction({
      baseInstruction: "赤い見出しを入れる",
      revisionInstruction: "見出しを大きくして人物を左に寄せる",
    });

    expect(instruction).toContain("生成済み画像を元にした修正生成");
    expect(instruction).toContain("元の追加指示: 赤い見出しを入れる");
    expect(instruction).toContain("修正指示: 見出しを大きくして人物を左に寄せる");
  });

  it("uses the completed output image as the first revision input", () => {
    expect(buildRevisionImageInputPaths("editor-generations/session/source.png", ["editor-generations/session/input.png"])).toEqual([
      "editor-generations/session/source.png",
      "editor-generations/session/input.png",
    ]);
  });
});
