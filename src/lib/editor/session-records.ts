import type { SupabaseClient } from "@supabase/supabase-js";
import { getAssetPublicUrl } from "@/lib/assets/public-url";
import type { EditorImageBlock, EditorSession } from "./types";
import {
  buildEditorSessionSummary,
  normalizeEditorState,
  normalizeEditorTitle,
  type EditorSessionSummary,
} from "./sessions";

type EditorSessionRow = {
  id: string;
  title: string | null;
  article_text: string | null;
  image_blocks: unknown;
  editor_state: unknown;
  last_saved_at: string | null;
  created_at: string;
  updated_at: string;
};

type EditorSessionSummaryRow = EditorSessionRow & {
  generated_images?: Array<{
    status?: string | null;
    storage_bucket?: string | null;
    storage_path?: string | null;
    created_at?: string | null;
  }> | null;
};

function imageBlocksFromValue(value: unknown): EditorImageBlock[] {
  return Array.isArray(value) ? (value as EditorImageBlock[]) : [];
}

export function editorSessionFromRow(row: EditorSessionRow): EditorSession {
  return {
    id: row.id,
    title: normalizeEditorTitle(row.title),
    articleText: row.article_text ?? "",
    imageBlocks: imageBlocksFromValue(row.image_blocks),
    editorState: normalizeEditorState(row.editor_state),
    lastSavedAt: row.last_saved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function editorSessionSummaryFromRow(
  supabase: SupabaseClient,
  row: EditorSessionSummaryRow,
): EditorSessionSummary {
  return buildEditorSessionSummary(row, (bucket, path) => getAssetPublicUrl(supabase, path, bucket));
}
