import type { SupabaseClient } from "@supabase/supabase-js";

export function getAssetPublicUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
  bucket = process.env.LP_ASSET_BUCKET ?? "lp-assets",
) {
  if (!storagePath) {
    return "";
  }

  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}
