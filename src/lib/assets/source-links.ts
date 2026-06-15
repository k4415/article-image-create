type SourceLike = {
  source_article_url?: string | null;
  asset_sources?: Array<{ source_article_url?: string | null }> | null;
};

export function getPrimaryArticleUrl(asset: SourceLike) {
  const directUrl = normalizeSourceUrl(asset.source_article_url);
  if (directUrl) return directUrl;
  return normalizeSourceUrl(asset.asset_sources?.find((source) => source.source_article_url)?.source_article_url);
}

export function getUniqueArticleUrls(asset: SourceLike) {
  const urls = [asset.source_article_url, ...(asset.asset_sources ?? []).map((source) => source.source_article_url)]
    .map(normalizeSourceUrl)
    .filter((url): url is string => Boolean(url));

  return Array.from(new Set(urls));
}

function normalizeSourceUrl(url: string | null | undefined) {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return trimmed;
}
