export type MarkdownImage = {
  alt: string;
  url: string;
};

export type GeneratedPreviewImageBlock = {
  lineIndex: number;
  markdown: string;
  imageUrl: string;
  alt: string;
  createdAt?: string;
};

export type ArticlePreviewBlock =
  | {
      type: "text";
      lineIndex: number;
      text: string;
    }
  | {
      type: "image";
      lineIndex: number;
      alt: string;
      url: string;
      markdown: string;
    };

const markdownImagePattern = /^!\[([^\]]*)\]\(([^)]+)\)$/;

export function getLineIndexAtSelection(text: string, selectionStart: number): number {
  const safeSelectionStart = Math.max(0, Math.min(selectionStart, text.length));
  return text.slice(0, safeSelectionStart).split("\n").length - 1;
}

export function insertMarkdownImageAfterLine(text: string, lineIndex: number, image: MarkdownImage): string {
  const lines = text.split("\n");
  const insertAt = Math.min(Math.max(lineIndex + 1, 0), lines.length);
  lines.splice(insertAt, 0, `![${image.alt}](${image.url})`);
  return lines.join("\n");
}

export function insertMarkdownImagesAfterLines(
  text: string,
  images: Array<{ lineIndex: number; markdown: string }>,
): string {
  const lines = text.split("\n");
  const byLine = new Map<number, string[]>();

  for (const image of images) {
    if (!Number.isInteger(image.lineIndex) || image.lineIndex < 0 || !image.markdown.trim()) continue;
    const current = byLine.get(image.lineIndex) ?? [];
    current.push(image.markdown.trim());
    byLine.set(image.lineIndex, current);
  }

  const lineIndexes = [...byLine.keys()].sort((a, b) => b - a);
  for (const lineIndex of lineIndexes) {
    const insertAt = Math.min(Math.max(lineIndex + 1, 0), lines.length);
    lines.splice(insertAt, 0, ...(byLine.get(lineIndex) ?? []));
  }

  return lines.join("\n");
}

export function parseArticlePreviewBlocks(text: string): ArticlePreviewBlock[] {
  return text.split("\n").map((line, lineIndex) => {
    const match = line.trim().match(markdownImagePattern);
    if (match) {
      return {
        type: "image",
        lineIndex,
        alt: match[1] ?? "",
        url: match[2] ?? "",
        markdown: line.trim(),
      };
    }

    return {
      type: "text",
      lineIndex,
      text: line,
    };
  });
}

export function buildArticlePreviewBlocks(
  text: string,
  imageBlocks: GeneratedPreviewImageBlock[] = [],
): ArticlePreviewBlock[] {
  const parsedBlocks = parseArticlePreviewBlocks(text);
  const existingImageUrls = new Set(parsedBlocks.filter((block) => block.type === "image").map((block) => block.url));
  const generatedByLine = new Map<number, GeneratedPreviewImageBlock[]>();

  for (const imageBlock of imageBlocks) {
    if (existingImageUrls.has(imageBlock.imageUrl)) continue;
    const current = generatedByLine.get(imageBlock.lineIndex) ?? [];
    current.push(imageBlock);
    generatedByLine.set(imageBlock.lineIndex, current);
  }

  for (const blocks of generatedByLine.values()) {
    blocks.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  }

  const result: ArticlePreviewBlock[] = [];
  for (const block of parsedBlocks) {
    result.push(block);
    if (block.type !== "text") continue;

    const generated = generatedByLine.get(block.lineIndex) ?? [];
    for (const imageBlock of generated) {
      result.push({
        type: "image",
        lineIndex: imageBlock.lineIndex,
        alt: imageBlock.alt,
        url: imageBlock.imageUrl,
        markdown: imageBlock.markdown,
      });
    }
  }

  return result;
}
