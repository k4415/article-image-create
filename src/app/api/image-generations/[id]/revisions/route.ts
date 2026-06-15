import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/error";
import {
  imageGenerationErrorStatus,
  parseImageGenerationRevisionForm,
  startImageGenerationRevision,
} from "@/lib/editor/generation-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const form = parseImageGenerationRevisionForm(await request.formData());
    const response = await startImageGenerationRevision({
      generationId: id,
      ...form,
    });
    return NextResponse.json(response);
  } catch (error) {
    return jsonError(error, imageGenerationErrorStatus(error));
  }
}
