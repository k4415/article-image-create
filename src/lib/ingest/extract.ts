import * as cheerio from "cheerio";
import { resolveCandidateUrl } from "./url";

export type MediaType = "image" | "video";

export type MediaCandidate = {
  url: string;
  mediaType: MediaType;
  sourceOrder: number;
  foundIn: "img" | "source" | "video" | "poster" | "style";
  altText?: string;
};

function parseSrcSet(srcset: string | undefined): string[] {
  if (!srcset) {
    return [];
  }

  return srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((url): url is string => Boolean(url));
}

function extractStyleUrls(style: string | undefined): string[] {
  if (!style) {
    return [];
  }

  const matches = Array.from(style.matchAll(/url\(([^)]+)\)/gi));
  return matches.map((match) => match[1]?.trim() ?? "").filter(Boolean);
}

function getPathExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const fileName = pathname.split("/").pop() ?? "";
    return fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  } catch {
    return "";
  }
}

function getCandidatePreference(url: string, mediaType: MediaType): number {
  const extension = getPathExtension(url);
  const imagePriority: Record<string, number> = {
    jpg: 0,
    jpeg: 0,
    png: 1,
    webp: 2,
    gif: 3,
    avif: 4,
  };
  const videoPriority: Record<string, number> = {
    mp4: 0,
    webm: 1,
    mov: 2,
  };
  const basePriority = mediaType === "video" ? (videoPriority[extension] ?? 99) : (imagePriority[extension] ?? 99);

  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return mediaType === "video" && pathname.endsWith(".h265.mp4") ? basePriority + 10 : basePriority;
  } catch {
    return basePriority;
  }
}

function getVisualIdentityKey(url: string, mediaType: MediaType): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.toLowerCase();
    if (
      parsedUrl.hostname === "file.mysquadbeyond.com" &&
      pathname.includes("/uploads/article_photo/photo/")
    ) {
      const normalizedPathname = pathname.replace(/\.h265(?=\.mp4$)/, "").replace(/\.[a-z0-9]+$/, "");
      return `${mediaType}:${parsedUrl.hostname}${normalizedPathname}`;
    }
  } catch {
    return `${mediaType}:${url}`;
  }

  return `${mediaType}:${url}`;
}

function isIgnoredMediaUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    if (hostname === "id.mysquadbeyond.com" || pathname.endsWith("/pixel.gif")) {
      return true;
    }
    if (hostname === "file.mysquadbeyond.com" && pathname.endsWith("/lazy.png")) {
      return true;
    }
    if (hostname.endsWith("facebook.com") && pathname.includes("/tr")) {
      return true;
    }
  } catch {
    return true;
  }

  return false;
}

export function extractMediaCandidates(html: string, articleUrl: string): MediaCandidate[] {
  const $ = cheerio.load(html);
  const results: MediaCandidate[] = [];
  const identityToIndex = new Map<string, number>();

  function add(rawUrl: string | null | undefined, mediaType: MediaType, foundIn: MediaCandidate["foundIn"], altText?: string) {
    const url = resolveCandidateUrl(rawUrl, articleUrl);
    if (!url || isIgnoredMediaUrl(url)) {
      return;
    }
    const identityKey = getVisualIdentityKey(url, mediaType);
    const existingIndex = identityToIndex.get(identityKey);
    const candidate: MediaCandidate = {
      url,
      mediaType,
      sourceOrder: results.length,
      foundIn,
      altText,
    };

    if (existingIndex !== undefined) {
      const existing = results[existingIndex];
      if (existing && getCandidatePreference(url, mediaType) < getCandidatePreference(existing.url, mediaType)) {
        results[existingIndex] = {
          ...candidate,
          sourceOrder: existing.sourceOrder,
          altText: candidate.altText ?? existing.altText,
        };
      }
      return;
    }

    identityToIndex.set(identityKey, results.length);
    results.push(candidate);
  }

  $("img, source, video, [style]").each((_, element) => {
    const node = $(element);
    const tagName = element.tagName?.toLowerCase();

    if (tagName === "img") {
      add(node.attr("src"), "image", "img", node.attr("alt"));
      add(node.attr("data-src"), "image", "img", node.attr("alt"));
      add(node.attr("data-original"), "image", "img", node.attr("alt"));
      add(node.attr("data-lazy-src"), "image", "img", node.attr("alt"));
      parseSrcSet(node.attr("srcset")).forEach((url) => add(url, "image", "img", node.attr("alt")));
      parseSrcSet(node.attr("data-srcset")).forEach((url) => add(url, "image", "img", node.attr("alt")));
      parseSrcSet(node.attr("data-lazy-srcset")).forEach((url) => add(url, "image", "img", node.attr("alt")));
    }

    if (tagName === "source") {
      const parentTag = node.parent().prop("tagName")?.toLowerCase();
      const mediaType: MediaType = parentTag === "video" ? "video" : "image";
      parseSrcSet(node.attr("srcset")).forEach((url) => add(url, mediaType, "source"));
      parseSrcSet(node.attr("data-srcset")).forEach((url) => add(url, mediaType, "source"));
      add(node.attr("src"), mediaType, "source");
      add(node.attr("data-src"), mediaType, "source");
    }

    if (tagName === "video") {
      add(node.attr("poster"), "image", "poster");
      add(node.attr("data-poster"), "image", "poster");
      add(node.attr("src"), "video", "video");
      add(node.attr("data-src"), "video", "video");
    }

    add(node.attr("data-bg"), "image", "style");
    add(node.attr("data-bg-hidpi"), "image", "style");
    extractStyleUrls(node.attr("style")).forEach((url) => add(url, "image", "style"));
  });

  return results;
}
