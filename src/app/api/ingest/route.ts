import { NextResponse } from "next/server";
import { z } from "zod";
import { startIngestJob } from "@/lib/ingest/pipeline";
import { jsonError } from "@/lib/api/error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ingestSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  maxCandidatesPerUrl: z.number().int().positive().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const body = ingestSchema.parse(await request.json());
    const result = await startIngestJob(body.urls, { maxCandidatesPerUrl: body.maxCandidatesPerUrl });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
