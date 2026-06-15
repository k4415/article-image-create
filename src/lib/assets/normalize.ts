import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetAnnotation, AssetSource, AssetWithAnnotation } from "@/lib/db/types";
import { getAssetPublicUrl } from "./public-url";

type RawAssetRow = Record<string, unknown> & {
  asset_annotations?: AssetAnnotation[] | AssetAnnotation | null;
  asset_sources?: AssetSource[] | AssetSource | null;
  similarity?: number;
};

export function normalizeAssetRow(supabase: SupabaseClient, row: RawAssetRow): AssetWithAnnotation {
  const annotation = Array.isArray(row.asset_annotations)
    ? row.asset_annotations[0] ?? null
    : row.asset_annotations ?? null;
  const sources = Array.isArray(row.asset_sources)
    ? row.asset_sources
    : row.asset_sources
      ? [row.asset_sources]
      : [];
  const storagePath = String(row.storage_path ?? "");
  const thumbnailPath = row.thumbnail_storage_path ? String(row.thumbnail_storage_path) : null;

  return {
    ...(row as unknown as AssetWithAnnotation),
    asset_annotations: annotation,
    asset_sources: sources,
    public_url: getAssetPublicUrl(supabase, storagePath),
    thumbnail_url: thumbnailPath ? getAssetPublicUrl(supabase, thumbnailPath) : undefined,
    similarity: row.similarity,
  };
}

export function normalizeAssetRows(supabase: SupabaseClient, rows: RawAssetRow[]) {
  return rows.map((row) => normalizeAssetRow(supabase, row));
}
