import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/error";
import { normalizeProblemCategory, normalizeTargetAgeBand, normalizeTargetGender } from "@/lib/assets/category-normalization";
import { filterAssetRows } from "@/lib/assets/filters";
import { normalizeAssetRows } from "@/lib/assets/normalize";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const url = new URL(request.url);
    const mediaType = url.searchParams.get("mediaType");
    const problemCategories = url.searchParams
      .getAll("problemCategory")
      .map((category) => normalizeProblemCategory(category))
      .filter((category): category is string => Boolean(category));
    const imageCategories = url.searchParams
      .getAll("imageCategory")
      .map((category) => category.trim())
      .filter(Boolean);
    const targetGenders = url.searchParams
      .getAll("targetGender")
      .map((value) => normalizeTargetGender(value))
      .filter((value): value is string => Boolean(value));
    const targetAgeBands = url.searchParams
      .getAll("targetAgeBand")
      .map((value) => normalizeTargetAgeBand(value))
      .filter((value): value is string => Boolean(value));
    const productName = url.searchParams.get("productName");
    const q = url.searchParams.get("q")?.trim();

    let query = supabase
      .from("media_assets")
      .select("*, asset_annotations(*), asset_sources(*)")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (mediaType) {
      query = query.eq("media_type", mediaType);
    }
    if (problemCategories.length > 0) {
      query = query.in("problem_category", problemCategories);
    }
    if (productName) {
      query = query.eq("product_name", productName);
    }
    if (targetGenders.length > 0) {
      query = query.in("target_gender", targetGenders);
    }
    if (targetAgeBands.length > 0) {
      query = query.in("target_age_band", targetAgeBands);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const filtered = filterAssetRows(rows, {
      problemCategories,
      imageCategories,
      targetGenders,
      targetAgeBands,
      productName,
      q,
    });

    return NextResponse.json({ assets: normalizeAssetRows(supabase, filtered) });
  } catch (error) {
    return jsonError(error);
  }
}
