import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/error";
import { buildEditorAutosavePayload } from "@/lib/editor/sessions";
import { editorSessionFromRow, editorSessionSummaryFromRow } from "@/lib/editor/session-records";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJsonBody(request: Request) {
  return request.json().catch(() => ({}));
}

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 100);
    const { data, error } = await supabase
      .from("editor_sessions")
      .select("id, title, article_text, image_blocks, editor_state, last_saved_at, created_at, updated_at, generated_images(status, storage_bucket, storage_path, created_at)")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      sessions: (data ?? []).map((row) => editorSessionSummaryFromRow(supabase, row as never)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createAdminClient();
    const body = await readJsonBody(request);
    const payload = buildEditorAutosavePayload({
      title: (body as Record<string, unknown>).title,
      articleText: (body as Record<string, unknown>).articleText,
      editorState: (body as Record<string, unknown>).editorState,
    });
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("editor_sessions")
      .insert({
        title: payload.title,
        article_text: payload.articleText,
        image_blocks: [],
        editor_state: payload.editorState,
        last_saved_at: now,
        updated_at: now,
      })
      .select("id, title, article_text, image_blocks, editor_state, last_saved_at, created_at, updated_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create editor session");
    }

    return NextResponse.json({ session: editorSessionFromRow(data as never) });
  } catch (error) {
    return jsonError(error);
  }
}
