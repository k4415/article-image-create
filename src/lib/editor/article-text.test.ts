import { describe, expect, it } from "vitest";
import {
  buildArticlePreviewBlocks,
  getLineIndexAtSelection,
  insertMarkdownImageAfterLine,
  insertMarkdownImagesAfterLines,
  parseArticlePreviewBlocks,
} from "./article-text";

describe("article editor text helpers", () => {
  it("detects the zero-based line index at a cursor offset", () => {
    const text = ["導入", "悩み喚起", "商品提示"].join("\n");

    expect(getLineIndexAtSelection(text, 0)).toBe(0);
    expect(getLineIndexAtSelection(text, text.indexOf("悩み"))).toBe(1);
    expect(getLineIndexAtSelection(text, text.length)).toBe(2);
  });

  it("inserts a generated image markdown line after the selected line", () => {
    const text = ["導入", "悩み喚起", "商品提示"].join("\n");

    const result = insertMarkdownImageAfterLine(text, 1, {
      alt: "悩み喚起画像",
      url: "/generated/mock.png",
    });

    expect(result).toBe(["導入", "悩み喚起", "![悩み喚起画像](/generated/mock.png)", "商品提示"].join("\n"));
  });

  it("appends the generated image when the selected line is beyond the current text", () => {
    const result = insertMarkdownImageAfterLine("導入", 4, {
      alt: "生成画像",
      url: "/generated/mock.png",
    });

    expect(result).toBe(["導入", "![生成画像](/generated/mock.png)"].join("\n"));
  });

  it("parses markdown image lines for preview rendering", () => {
    const result = parseArticlePreviewBlocks(["導入", "![生成画像](/generated/image.png)", "商品提示"].join("\n"));

    expect(result).toEqual([
      { type: "text", lineIndex: 0, text: "導入" },
      {
        type: "image",
        lineIndex: 1,
        alt: "生成画像",
        url: "/generated/image.png",
        markdown: "![生成画像](/generated/image.png)",
      },
      { type: "text", lineIndex: 2, text: "商品提示" },
    ]);
  });

  it("inserts multiple generated image markdown lines without shifting target lines", () => {
    const text = ["導入", "悩み喚起", "商品提示"].join("\n");

    const result = insertMarkdownImagesAfterLines(text, [
      { lineIndex: 0, markdown: "![導入画像](/generated/first.png)" },
      { lineIndex: 2, markdown: "![商品画像](/generated/product.png)" },
    ]);

    expect(result).toBe(
      ["導入", "![導入画像](/generated/first.png)", "悩み喚起", "商品提示", "![商品画像](/generated/product.png)"].join(
        "\n",
      ),
    );
  });

  it("adds completed generation blocks to preview without requiring markdown to be in the article text", () => {
    const result = buildArticlePreviewBlocks(["導入", "悩み喚起"].join("\n"), [
      {
        id: "generated-1",
        lineIndex: 0,
        markdown: "![導入画像](/generated/first.png)",
        imageUrl: "/generated/first.png",
        alt: "導入画像",
        referenceAssetIds: [],
        createdAt: "2026-06-15T00:00:00.000Z",
      },
    ]);

    expect(result).toEqual([
      { type: "text", lineIndex: 0, text: "導入" },
      {
        type: "image",
        lineIndex: 0,
        alt: "導入画像",
        url: "/generated/first.png",
        markdown: "![導入画像](/generated/first.png)",
      },
      { type: "text", lineIndex: 1, text: "悩み喚起" },
    ]);
  });
});
