import type { MediaType } from "./extract";

export function shouldReuseExistingAsset(params: {
  existingFileHash: string | null | undefined;
  nextFileHash: string;
  existingSourceArticleUrl?: string | null;
  nextSourceArticleUrl?: string | null;
}) {
  return Boolean(params.existingFileHash && params.existingFileHash === params.nextFileHash);
}

export function getCanonicalSourceMediaUrl(sourceMediaUrl: string, mediaType: MediaType) {
  return mediaType === "video" ? `${sourceMediaUrl}#frame=last` : sourceMediaUrl;
}
