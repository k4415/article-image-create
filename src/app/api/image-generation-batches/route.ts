import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/error";
import { getServerEnv } from "@/lib/config/env";
import {
  imageGenerationErrorStatus,
  parseImageGenerationBatchForm,
  startImageGenerationBatch,
} from "@/lib/editor/generation-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const form = parseImageGenerationBatchForm(await request.formData(), env.IMAGE_GENERATION_BATCH_LIMIT);
    const response = await startImageGenerationBatch(form);
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error, imageGenerationErrorStatus(error));
  }
}
