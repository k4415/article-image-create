export type DownloadedMedia = {
  buffer: Buffer;
  mimeType: string;
  size: number;
};

export async function downloadMedia(url: string): Promise<DownloadedMedia> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; LPAssetBot/1.0)",
      accept: "image/avif,image/webp,image/png,image/jpeg,image/*,video/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    mimeType,
    size: buffer.byteLength,
  };
}

export async function fetchArticleHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; LPAssetBot/1.0)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article ${url}: HTTP ${response.status}`);
  }

  return response.text();
}
