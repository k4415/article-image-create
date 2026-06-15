import type { GeneratedImageStatus } from "@/lib/db/types";

export const DEFAULT_EDITOR_PROJECT_TITLE = "無題プロジェクト";

export type EditorMode = "edit" | "preview";

export type EditorState = {
  targetLineIndex: number;
  problemCategory: string;
  imageCategory: string;
  targetGenders: string[];
  targetAgeBands: string[];
  productName: string;
  query: string;
  selectedAssetIds: string[];
  additionalInstruction: string;
  size: string;
  quality: string;
  editorMode: EditorMode;
};

export type EditorSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  lastSavedAt: string | null;
  completedImageCount: number;
  activeGenerationCount: number;
  latestImageUrl?: string;
};

type EditorSessionSummaryRow = {
  id: string;
  title?: string | null;
  created_at: string;
  updated_at: string;
  last_saved_at?: string | null;
  generated_images?: Array<{
    status?: GeneratedImageStatus | string | null;
    storage_bucket?: string | null;
    storage_path?: string | null;
    created_at?: string | null;
  }> | null;
};

const ACTIVE_STATUSES = new Set<GeneratedImageStatus>(["queued", "planning", "generating", "uploading"]);

export const DEFAULT_EDITOR_STATE: EditorState = {
  targetLineIndex: 0,
  problemCategory: "",
  imageCategory: "",
  targetGenders: [],
  targetAgeBands: [],
  productName: "",
  query: "",
  selectedAssetIds: [],
  additionalInstruction: "",
  size: "auto",
  quality: "low",
  editorMode: "edit",
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(cleanString).filter(Boolean) : [];
}

export function normalizeEditorTitle(value: unknown) {
  return cleanString(value) || DEFAULT_EDITOR_PROJECT_TITLE;
}

export function normalizeEditorState(value: unknown): EditorState {
  const state = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const targetLineIndex = typeof state.targetLineIndex === "number" && state.targetLineIndex >= 0 ? Math.floor(state.targetLineIndex) : 0;
  const editorMode = state.editorMode === "preview" ? "preview" : "edit";

  return {
    targetLineIndex,
    problemCategory: cleanString(state.problemCategory),
    imageCategory: cleanString(state.imageCategory),
    targetGenders: cleanStringArray(state.targetGenders),
    targetAgeBands: cleanStringArray(state.targetAgeBands),
    productName: cleanString(state.productName),
    query: cleanString(state.query),
    selectedAssetIds: cleanStringArray(state.selectedAssetIds),
    additionalInstruction: cleanString(state.additionalInstruction),
    size: cleanString(state.size) || DEFAULT_EDITOR_STATE.size,
    quality: cleanString(state.quality) || DEFAULT_EDITOR_STATE.quality,
    editorMode,
  };
}

export function buildEditorAutosavePayload(input: {
  title?: unknown;
  articleText?: unknown;
  editorState?: unknown;
}) {
  return {
    title: normalizeEditorTitle(input.title),
    articleText: typeof input.articleText === "string" ? input.articleText : "",
    editorState: normalizeEditorState(input.editorState),
  };
}

export function buildEditorSessionSummary(
  row: EditorSessionSummaryRow,
  getImageUrl: (bucket: string, path: string) => string,
): EditorSessionSummary {
  const images = row.generated_images ?? [];
  const completedImages = images.filter((image) => image.status === "completed" && image.storage_path);
  const activeGenerationCount = images.filter((image) => ACTIVE_STATUSES.has(image.status as GeneratedImageStatus)).length;
  const latestCompleted = [...completedImages].sort((left, right) =>
    String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")),
  )[0];
  const latestImageUrl = latestCompleted?.storage_path
    ? getImageUrl(latestCompleted.storage_bucket || "lp-assets", latestCompleted.storage_path)
    : undefined;

  return {
    id: row.id,
    title: normalizeEditorTitle(row.title),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSavedAt: row.last_saved_at ?? null,
    completedImageCount: completedImages.length,
    activeGenerationCount,
    ...(latestImageUrl ? { latestImageUrl } : {}),
  };
}
