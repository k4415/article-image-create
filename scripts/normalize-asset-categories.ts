import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  normalizeAnnotationImageCategory,
  normalizeProblemCategory,
  normalizeTargetAgeBand,
  normalizeTargetGender,
} from "../src/lib/assets/category-normalization";
import { buildSearchText } from "../src/lib/assets/search-text";

type AnnotationRow = {
  id: string;
  image_category: string | null;
  lp_section_role: string | null;
  appeal_role: string | null;
  description: string | null;
  ocr_text: string | null;
  tags: string[] | null;
};

type AssetRow = {
  id: string;
  product_name: string | null;
  target_gender: string | null;
  target_age_band: string | null;
  problem_category: string | null;
  asset_annotations: AnnotationRow[] | AnnotationRow | null;
};

function loadLocalEnv() {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function annotationFor(row: AssetRow) {
  return Array.isArray(row.asset_annotations) ? row.asset_annotations[0] : row.asset_annotations;
}

async function main() {
  loadLocalEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase env vars are missing");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });

  const { data, error } = await supabase
    .from("media_assets")
    .select("id, product_name, target_gender, target_age_band, problem_category, asset_annotations(*)")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);

  let updatedAssets = 0;
  let updatedAnnotations = 0;
  let updatedSearchTexts = 0;

  for (const row of (data ?? []) as AssetRow[]) {
    const annotation = annotationFor(row);
    const problemCategory = normalizeProblemCategory(row.problem_category);
    const targetGender = normalizeTargetGender(row.target_gender);
    const targetAgeBand = normalizeTargetAgeBand(row.target_age_band);
    const imageCategory = normalizeAnnotationImageCategory(annotation?.image_category) ?? annotation?.image_category ?? null;

    if (problemCategory !== row.problem_category || targetGender !== row.target_gender || targetAgeBand !== row.target_age_band) {
      const { error: updateAssetError } = await supabase
        .from("media_assets")
        .update({
          problem_category: problemCategory,
          target_gender: targetGender,
          target_age_band: targetAgeBand,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateAssetError) throw new Error(updateAssetError.message);
      row.problem_category = problemCategory;
      row.target_gender = targetGender;
      row.target_age_band = targetAgeBand;
      updatedAssets += 1;
    }

    if (annotation && imageCategory !== annotation.image_category) {
      const { error: updateAnnotationError } = await supabase
        .from("asset_annotations")
        .update({ image_category: imageCategory, updated_at: new Date().toISOString() })
        .eq("id", annotation.id);
      if (updateAnnotationError) throw new Error(updateAnnotationError.message);
      annotation.image_category = imageCategory;
      updatedAnnotations += 1;
    }

    const searchText = buildSearchText({
      productName: row.product_name,
      targetGender: row.target_gender,
      targetAgeBand: row.target_age_band,
      problemCategory: row.problem_category,
      imageCategory: annotation?.image_category,
      lpSectionRole: annotation?.lp_section_role,
      appealRole: annotation?.appeal_role,
      description: annotation?.description,
      ocrText: annotation?.ocr_text,
      tags: annotation?.tags,
    });

    if (searchText.trim()) {
      const { data: updatedSearchRows, error: updateSearchTextError } = await supabase
        .from("asset_embeddings")
        .update({ search_text: searchText })
        .eq("asset_id", row.id)
        .neq("search_text", searchText)
        .select("asset_id");
      if (updateSearchTextError) throw new Error(updateSearchTextError.message);
      updatedSearchTexts += updatedSearchRows?.length ?? 0;
    }
  }

  console.log(JSON.stringify({ updatedAssets, updatedAnnotations, updatedSearchTexts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
