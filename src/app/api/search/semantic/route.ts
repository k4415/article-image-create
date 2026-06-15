import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/error";
import { createEmbedding } from "@/lib/ai/embedding";
import { filterAssetRows } from "@/lib/assets/filters";
import { normalizeAssetRows } from "@/lib/assets/normalize";
import { getServerEnv } from "@/lib/config/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const semanticSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(20),
  filters: z
    .object({
      problemCategories: z.array(z.string()).optional(),
      problemCategory: z.string().optional(),
      imageCategories: z.array(z.string()).optional(),
      imageCategory: z.string().optional(),
      productNames: z.array(z.string()).optional(),
      productName: z.string().optional(),
      targetGenders: z.array(z.string()).optional(),
      targetGender: z.string().optional(),
      targetAgeBands: z.array(z.string()).optional(),
      targetAgeBand: z.string().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = semanticSearchSchema.parse(await request.json());
    const env = getServerEnv();
    const supabase = createAdminClient();
    const embedding = await createEmbedding(body.query, env.OPENAI_API_KEY, env.OPENAI_EMBEDDING_MODEL);

    const { data: matches, error: matchError } = await supabase.rpc("match_assets", {
      query_embedding: embedding,
      match_threshold: 0,
      match_count: Math.min(body.limit * 4, 100),
    });

    if (matchError) {
      throw new Error(matchError.message);
    }

    const ids = ((matches ?? []) as Array<{ asset_id: string }>).map((match) => match.asset_id);
    if (ids.length === 0) {
      return NextResponse.json({ assets: [] });
    }

    const { data, error } = await supabase
      .from("media_assets")
      .select("*, asset_annotations(*), asset_sources(*)")
      .in("id", ids);
    if (error) {
      throw new Error(error.message);
    }

    const similarityById = new Map(
      ((matches ?? []) as Array<{ asset_id: string; similarity: number }>).map((match) => [
        match.asset_id,
        match.similarity,
      ]),
    );
    const rows = filterAssetRows(
      ((data ?? []) as Array<Record<string, unknown>>)
      .map((row) => ({ ...row, similarity: similarityById.get(String(row.id)) ?? 0 }))
        .sort((left, right) => (right.similarity as number) - (left.similarity as number)),
      body.filters ?? {},
    ).slice(0, body.limit);

    return NextResponse.json({ assets: normalizeAssetRows(supabase, rows) });
  } catch (error) {
    return jsonError(error);
  }
}
