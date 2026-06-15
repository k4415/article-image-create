import { describe, expect, it } from "vitest";
import {
  buildEditorAutosavePayload,
  buildEditorSessionSummary,
  normalizeEditorState,
} from "./sessions";

describe("editor session helpers", () => {
  it("builds a project summary with counts and the latest completed thumbnail", () => {
    const summary = buildEditorSessionSummary(
      {
        id: "session-1",
        title: " 血糖LP ",
        created_at: "2026-06-15T00:00:00.000Z",
        updated_at: "2026-06-15T01:00:00.000Z",
        last_saved_at: "2026-06-15T01:01:00.000Z",
        generated_images: [
          {
            status: "completed",
            storage_bucket: "lp-assets",
            storage_path: "editor-generations/session-1/old.png",
            created_at: "2026-06-15T00:10:00.000Z",
          },
          {
            status: "generating",
            storage_bucket: "lp-assets",
            storage_path: null,
            created_at: "2026-06-15T00:20:00.000Z",
          },
          {
            status: "completed",
            storage_bucket: "lp-assets",
            storage_path: "editor-generations/session-1/new.png",
            created_at: "2026-06-15T00:30:00.000Z",
          },
        ],
      },
      (_bucket, path) => `https://cdn.example.com/${path}`,
    );

    expect(summary).toEqual({
      id: "session-1",
      title: "血糖LP",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T01:00:00.000Z",
      lastSavedAt: "2026-06-15T01:01:00.000Z",
      completedImageCount: 2,
      activeGenerationCount: 1,
      latestImageUrl: "https://cdn.example.com/editor-generations/session-1/new.png",
    });
  });

  it("normalizes editor state and drops non-persistable upload values from autosave payload", () => {
    const payload = buildEditorAutosavePayload({
      title: "",
      articleText: "本文",
      editorState: {
        targetLineIndex: 2,
        targetGenders: ["女性"],
        targetAgeBands: ["60代"],
        selectedAssetIds: ["asset-1"],
        additionalImages: [{ name: "local.png" }],
      },
    });

    expect(payload).toEqual({
      title: "無題プロジェクト",
      articleText: "本文",
      editorState: {
        targetLineIndex: 2,
        problemCategory: "",
        imageCategory: "",
        targetGenders: ["女性"],
        targetAgeBands: ["60代"],
        productName: "",
        query: "",
        selectedAssetIds: ["asset-1"],
        additionalInstruction: "",
        size: "auto",
        quality: "low",
        editorMode: "edit",
      },
    });
  });

  it("uses safe defaults for unknown editor state values", () => {
    expect(normalizeEditorState({ targetLineIndex: -1, editorMode: "bad", targetGenders: "女性" })).toMatchObject({
      targetLineIndex: 0,
      targetGenders: [],
      editorMode: "edit",
    });
  });
});
