import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/error";
import { getServerEnv } from "@/lib/config/env";
import {
  imageGenerationErrorStatus,
  listImageGenerationHistory,
  parseImageGenerationBatchForm,
  startImageGenerationBatch,
} from "@/lib/editor/generation-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const response = await listImageGenerationHistory({
      sessionId: searchParams.get("sessionId") || undefined,
      batchId: searchParams.get("batchId") || undefined,
    });
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error, imageGenerationErrorStatus(error));
  }
}

export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const form = parseImageGenerationBatchForm(await request.formData(), env.IMAGE_GENERATION_BATCH_LIMIT);
    const response = await startImageGenerationBatch({
      ...form,
      targetLineIndexes: [form.targetLineIndexes[0]],
    });
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error, imageGenerationErrorStatus(error));
  }
}
