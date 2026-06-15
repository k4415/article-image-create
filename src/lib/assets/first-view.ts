export type FirstViewSourceLike = {
  id: string;
  asset_id: string;
  source_article_url: string;
  source_order: number;
  created_at?: string | null;
};

type RawFirstViewRow = {
  asset_sources?: Record<string, unknown> | Array<Record<string, unknown>> | null;
};

function sourceArray(row: RawFirstViewRow) {
  if (Array.isArray(row.asset_sources)) return row.asset_sources;
  return row.asset_sources ? [row.asset_sources] : [];
}

export function hasFirstViewSource(row: RawFirstViewRow) {
  return sourceArray(row).some((source) => source.is_first_view === true);
}

export function selectFirstViewSourceIds<T extends FirstViewSourceLike>(sources: T[]) {
  const firstByArticle = new Map<string, T>();

  for (const source of sources) {
    const current = firstByArticle.get(source.source_article_url);
    if (!current || compareSources(source, current) < 0) {
      firstByArticle.set(source.source_article_url, source);
    }
  }

  return new Set(Array.from(firstByArticle.values()).map((source) => source.id));
}

function compareSources(left: FirstViewSourceLike, right: FirstViewSourceLike) {
  if (left.source_order !== right.source_order) {
    return left.source_order - right.source_order;
  }
  const leftCreated = left.created_at ?? "";
  const rightCreated = right.created_at ?? "";
  if (leftCreated !== rightCreated) {
    return leftCreated.localeCompare(rightCreated);
  }
  return left.id.localeCompare(right.id);
}
