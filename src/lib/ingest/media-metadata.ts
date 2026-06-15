import crypto from "node:crypto";
import { imageSize } from "image-size";
import { getFileExtension } from "./url";

export type BasicMediaMetadata = {
  fileHash: string;
  extension: string;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
};

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function hashBuffer(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function getExtensionForMedia(url: string, mimeType: string) {
  return MIME_EXTENSIONS[mimeType] ?? getFileExtension(url);
}

export function getBasicMediaMetadata(buffer: Buffer, url: string, mimeType: string): BasicMediaMetadata {
  const fileHash = hashBuffer(buffer);
  const extension = getExtensionForMedia(url, mimeType);
  let width: number | null = null;
  let height: number | null = null;

  if (mimeType.startsWith("image/")) {
    try {
      const dimensions = imageSize(buffer);
      width = dimensions.width ?? null;
      height = dimensions.height ?? null;
    } catch {
      width = null;
      height = null;
    }
  }

  return {
    fileHash,
    extension,
    width,
    height,
    aspectRatio: width && height ? Number((width / height).toFixed(4)) : null,
  };
}

export function buildStoragePath(articleUrl: string, fileHash: string, extension: string, suffix?: string) {
  const host = new URL(articleUrl).hostname.replace(/[^a-z0-9.-]/gi, "-");
  const base = suffix ? `${fileHash}-${suffix}` : fileHash;
  return `${host}/${base}.${extension}`;
}
