import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { normalizeAnnotationImageCategory } from "../src/lib/assets/category-normalization";
import { selectFirstViewSourceIds, type FirstViewSourceLike } from "../src/lib/assets/first-view";
import { buildSearchText } from "../src/lib/assets/search-text";

type AssetSourceRow = FirstViewSourceLike & {
  is_first_view: boolean;
};

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

  const { data: sourceRows, error: sourceError } = await supabase
    .from("asset_sources")
    .select("id, asset_id, source_article_url, source_order, created_at, is_first_view")
    .order("source_article_url", { ascending: true })
    .order("source_order", { ascending: true });
  if (sourceError) throw new Error(sourceError.message);

  const sources = (sourceRows ?? []) as AssetSourceRow[];
  const selectedFirstViewIds = selectFirstViewSourceIds(sources);
  const changedSources = sources.filter((source) => selectedFirstViewIds.has(source.id) !== source.is_first_view);

  if (changedSources.length > 0) {
    const { error: resetError } = await supabase
      .from("asset_sources")
      .update({ is_first_view: false })
      .eq("is_first_view", true);
    if (resetError) throw new Error(resetError.message);

    const firstViewIds = [...selectedFirstViewIds];
    if (firstViewIds.length > 0) {
      const { error: firstViewError } = await supabase
        .from("asset_sources")
        .update({ is_first_view: true })
        .in("id", firstViewIds);
      if (firstViewError) throw new Error(firstViewError.message);
    }
  }

  const { data: annotations, error: annotationError } = await supabase
    .from("asset_annotations")
    .select("id, image_category")
    .eq("image_category", "ファーストビュー");
  if (annotationError) throw new Error(annotationError.message);

  const firstViewAnnotationIds = (annotations ?? []).map((annotation) => String(annotation.id));
  if (firstViewAnnotationIds.length > 0) {
    const { error: updateAnnotationError } = await supabase
      .from("asset_annotations")
      .update({ image_category: "その他", updated_at: new Date().toISOString() })
      .in("id", firstViewAnnotationIds);
    if (updateAnnotationError) throw new Error(updateAnnotationError.message);
  }

  const { data: assets, error: assetError } = await supabase
    .from("media_assets")
    .select("id, product_name, target_gender, target_age_band, problem_category, asset_annotations(*)")
    .limit(5000);
  if (assetError) throw new Error(assetError.message);

  let updatedSearchTexts = 0;
  for (const row of (assets ?? []) as AssetRow[]) {
    const annotation = annotationFor(row);
    const imageCategory = normalizeAnnotationImageCategory(annotation?.image_category) ?? annotation?.image_category;
    const searchText = buildSearchText({
      productName: row.product_name,
      targetGender: row.target_gender,
      targetAgeBand: row.target_age_band,
      problemCategory: row.problem_category,
      imageCategory,
      lpSectionRole: annotation?.lp_section_role,
      appealRole: annotation?.appeal_role,
      description: annotation?.description,
      ocrText: annotation?.ocr_text,
      tags: annotation?.tags,
    });

    if (!searchText.trim()) continue;

    const { data: updatedSearchRows, error: updateSearchTextError } = await supabase
      .from("asset_embeddings")
      .update({ search_text: searchText })
      .eq("asset_id", row.id)
      .neq("search_text", searchText)
      .select("asset_id");
    if (updateSearchTextError) throw new Error(updateSearchTextError.message);
    updatedSearchTexts += updatedSearchRows?.length ?? 0;
  }

  console.log(
    JSON.stringify(
      {
        selectedFirstViewSources: selectedFirstViewIds.size,
        updatedFirstViewSources: changedSources.length,
        updatedAnnotations: firstViewAnnotationIds.length,
        updatedSearchTexts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
