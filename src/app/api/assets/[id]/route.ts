import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/error";
import {
  normalizeAnnotationImageCategory,
  normalizeProblemCategory,
  normalizeTargetAgeBand,
  normalizeTargetGender,
} from "@/lib/assets/category-normalization";
import { normalizeAssetRow } from "@/lib/assets/normalize";
import { buildSearchText } from "@/lib/assets/search-text";
import { createEmbedding } from "@/lib/ai/embedding";
import { getServerEnv } from "@/lib/config/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  productName: z.string().nullable().optional(),
  targetGender: z.string().nullable().optional(),
  targetAgeBand: z.string().nullable().optional(),
  problemCategory: z.string().nullable().optional(),
  imageCategory: z.string().nullable().optional(),
  lpSectionRole: z.string().nullable().optional(),
  appealRole: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  visualDescription: z.string().nullable().optional(),
  ocrText: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("media_assets")
      .select("*, asset_annotations(*), asset_sources(*)")
      .eq("id", id)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ asset: normalizeAssetRow(supabase, data as Record<string, unknown>) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const normalizedBody = {
      ...body,
      targetGender: body.targetGender === undefined ? undefined : normalizeTargetGender(body.targetGender),
      targetAgeBand: body.targetAgeBand === undefined ? undefined : normalizeTargetAgeBand(body.targetAgeBand),
      problemCategory: body.problemCategory === undefined ? undefined : normalizeProblemCategory(body.problemCategory),
      imageCategory: body.imageCategory === undefined ? undefined : normalizeAnnotationImageCategory(body.imageCategory),
    };
    const env = getServerEnv();
    const supabase = createAdminClient();

    const mediaPatch = {
      product_name: normalizedBody.productName,
      target_gender: normalizedBody.targetGender,
      target_age_band: normalizedBody.targetAgeBand,
      problem_category: normalizedBody.problemCategory,
      updated_at: new Date().toISOString(),
    };
    const { error: mediaError } = await supabase.from("media_assets").update(mediaPatch).eq("id", id);
    if (mediaError) {
      throw new Error(mediaError.message);
    }

    const annotationPatch = {
      asset_id: id,
      image_category: normalizedBody.imageCategory,
      lp_section_role: normalizedBody.lpSectionRole,
      appeal_role: normalizedBody.appealRole,
      description: normalizedBody.description,
      visual_description: normalizedBody.visualDescription,
      ocr_text: normalizedBody.ocrText,
      tags: normalizedBody.tags ?? [],
      needs_review: false,
      updated_at: new Date().toISOString(),
    };
    const { error: annotationError } = await supabase.from("asset_annotations").upsert(annotationPatch);
    if (annotationError) {
      throw new Error(annotationError.message);
    }

    const searchText = buildSearchText(normalizedBody);
    if (searchText.trim()) {
      const embedding = await createEmbedding(searchText, env.OPENAI_API_KEY, env.OPENAI_EMBEDDING_MODEL);
      const { error: embeddingError } = await supabase.from("asset_embeddings").upsert({
        asset_id: id,
        search_text: searchText,
        embedding,
        embedding_model: env.OPENAI_EMBEDDING_MODEL,
      });
      if (embeddingError) {
        throw new Error(embeddingError.message);
      }
    }

    const { data, error } = await supabase
      .from("media_assets")
      .select("*, asset_annotations(*), asset_sources(*)")
      .eq("id", id)
      .single();
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ asset: normalizeAssetRow(supabase, data as Record<string, unknown>) });
  } catch (error) {
    return jsonError(error);
  }
}
