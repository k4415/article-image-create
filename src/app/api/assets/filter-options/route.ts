import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/error";
import { buildAssetFilterOptions } from "@/lib/assets/filter-options";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const url = new URL(request.url);
    const mediaType = url.searchParams.get("mediaType");

    let query = supabase.from("media_assets").select("target_gender, target_age_band").limit(5000);
    if (mediaType) {
      query = query.eq("media_type", mediaType);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(buildAssetFilterOptions(data ?? []));
  } catch (error) {
    return jsonError(error);
  }
}
