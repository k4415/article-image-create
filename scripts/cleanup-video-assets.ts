import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

function loadLocalEnv() {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  loadLocalEnv();
  const bucket = process.env.LP_ASSET_BUCKET || "lp-assets";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase env vars are missing");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });

  const { data: videos, error: videoError } = await supabase
    .from("media_assets")
    .select("id, storage_path")
    .eq("media_type", "video");
  if (videoError) throw new Error(videoError.message);

  const storagePaths = (videos ?? [])
    .map((video) => String(video.storage_path ?? ""))
    .filter(Boolean);

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from(bucket).remove(storagePaths);
    if (storageError) throw new Error(storageError.message);
  }

  const videoIds = (videos ?? []).map((video) => String(video.id));
  if (videoIds.length > 0) {
    const { error: frameError } = await supabase
      .from("media_assets")
      .update({ parent_asset_id: null, updated_at: new Date().toISOString() })
      .in("parent_asset_id", videoIds);
    if (frameError) throw new Error(frameError.message);
  }

  const { error: deleteError } = await supabase.from("media_assets").delete().eq("media_type", "video");
  if (deleteError) throw new Error(deleteError.message);

  console.log(JSON.stringify({ deletedVideoRows: videoIds.length, deletedStorageObjects: storagePaths.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
