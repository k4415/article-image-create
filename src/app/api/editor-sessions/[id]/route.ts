import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/error";
import { buildEditorAutosavePayload } from "@/lib/editor/sessions";
import { editorSessionFromRow } from "@/lib/editor/session-records";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJsonBody(request: Request) {
  return request.json().catch(() => ({}));
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("editor_sessions")
      .select("id, title, article_text, image_blocks, editor_state, last_saved_at, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Editor session not found");
    }

    return NextResponse.json({ session: editorSessionFromRow(data as never) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = createAdminClient();
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const payload = buildEditorAutosavePayload({
      title: body.title,
      articleText: body.articleText,
      editorState: body.editorState,
    });
    const now = new Date().toISOString();
    const values: Record<string, unknown> = {
      updated_at: now,
      last_saved_at: now,
    };

    if ("title" in body) values.title = payload.title;
    if ("articleText" in body) values.article_text = payload.articleText;
    if ("editorState" in body) values.editor_state = payload.editorState;

    const { data, error } = await supabase
      .from("editor_sessions")
      .update(values)
      .eq("id", id)
      .select("id, title, article_text, image_blocks, editor_state, last_saved_at, created_at, updated_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update editor session");
    }

    return NextResponse.json({ session: editorSessionFromRow(data as never) });
  } catch (error) {
    return jsonError(error);
  }
}
