"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Eye,
  FileImage,
  FolderOpen,
  Loader2,
  MousePointer2,
  PencilLine,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { IMAGE_CATEGORIES, PROBLEM_CATEGORIES } from "@/lib/assets/categories";
import { hasFirstViewSource } from "@/lib/assets/first-view";
import type { AssetWithAnnotation } from "@/lib/db/types";
import {
  getLineIndexAtSelection,
  buildArticlePreviewBlocks,
  type ArticlePreviewBlock,
} from "@/lib/editor/article-text";
import { findNextGenerationLineIndex } from "@/lib/editor/batch";
import type {
  EditorImageBlock,
  ImageGenerationBatchResponse,
  ImageGenerationHistoryItem,
  ImageGenerationHistoryResponse,
  EditorSessionListResponse,
  EditorSessionResponse,
} from "@/lib/editor/types";
import {
  DEFAULT_EDITOR_PROJECT_TITLE,
  DEFAULT_EDITOR_STATE,
  type EditorSessionSummary,
  type EditorState,
} from "@/lib/editor/sessions";

type EditorMode = "edit" | "preview";
type SaveStatus = "idle" | "saving" | "saved" | "error";

const INITIAL_ARTICLE_TEXT = [
  "1. 導入: 最近、食後の眠気やだるさが気になる人へ問いかける",
  "2. 悩み喚起: 年齢のせいだと思って放置している血糖リスクを提示",
  "3. 新事実: 実は毎日の食事習慣が原因かもしれないと切り返す",
  "4. 解決策: サポート成分と生活習慣改善をセットで見せる",
  "5. 商品提示: 初回限定オファーと口コミで背中を押す",
].join("\n");

const SIZE_OPTIONS = ["1024x1536", "1024x1024", "1536x1024", "auto"];
const QUALITY_OPTIONS = [
  { value: "low", label: "Draft" },
  { value: "medium", label: "Standard" },
  { value: "high", label: "Final" },
  { value: "auto", label: "Auto" },
];
const ACTIVE_HISTORY_STATUSES = new Set(["queued", "planning", "generating", "uploading"]);

const EMPTY_FILTER_OPTIONS = {
  targetGenders: [] as string[],
  targetAgeBands: [] as string[],
};

function optionList(values: string[]) {
  return values.map((value) => ({ value, label: value }));
}

function saveStatusLabel(status: SaveStatus) {
  switch (status) {
    case "saving":
      return "保存中";
    case "saved":
      return "保存済み";
    case "error":
      return "保存失敗";
    case "idle":
      return "未保存の変更";
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function selectedLineText(articleText: string, lineIndex: number) {
  return articleText.split("\n")[lineIndex] ?? "";
}

function AssetThumb({ asset }: { asset: AssetWithAnnotation }) {
  const src = asset.thumbnail_url || asset.public_url || "";
  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
        <FileImage size={22} />
      </div>
    );
  }
  return <img className="h-full w-full object-contain p-1" src={src} alt={asset.asset_annotations?.description ?? ""} />;
}

function assetImageLabels(asset: AssetWithAnnotation) {
  const annotationCategory = asset.asset_annotations?.image_category;
  return [
    hasFirstViewSource(asset) ? "ファーストビュー" : null,
    annotationCategory && annotationCategory !== "ファーストビュー" ? annotationCategory : null,
  ];
}

function ResultPreview({ block }: { block: EditorImageBlock }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md border border-slate-200 bg-white p-2">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded bg-slate-100">
        <img className="h-8 w-8" src={block.imageUrl} alt={block.alt} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-950">{block.lineIndex + 1}行目に挿入</p>
        <p className="mt-1 truncate font-mono text-xs text-slate-500">{block.markdown}</p>
      </div>
    </div>
  );
}

function historyItemToImageBlock(item: ImageGenerationHistoryItem): EditorImageBlock | null {
  if (!item.generatedImage || !item.insertedMarkdown) return null;
  return {
    id: item.generatedImage.id,
    lineIndex: item.targetLineIndex,
    markdown: item.insertedMarkdown,
    imageUrl: item.generatedImage.url,
    alt: item.generatedImage.alt,
    referenceAssetIds: item.generatedImage.referenceAssetIds,
    createdAt: item.completedAt ?? item.createdAt,
  };
}

function mergeImageBlocks(nextBlocks: EditorImageBlock[], currentBlocks: EditorImageBlock[]) {
  const seen = new Set<string>();
  return [...nextBlocks, ...currentBlocks].filter((block) => {
    const key = block.id || block.imageUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function historyStatusLabel(status: ImageGenerationHistoryItem["status"]) {
  switch (status) {
    case "queued":
      return "待機中";
    case "planning":
      return "設計中";
    case "generating":
      return "生成中";
    case "uploading":
      return "保存中";
    case "completed":
      return "完了";
    case "failed":
      return "失敗";
  }
}

function ArticlePreview({
  blocks,
  imageBlocks,
  targetLineIndex,
  onSelectLine,
}: {
  blocks: ArticlePreviewBlock[];
  imageBlocks: EditorImageBlock[];
  targetLineIndex: number;
  onSelectLine: (lineIndex: number) => void;
}) {
  return (
    <div className="flex min-h-[560px] flex-1 items-start justify-center overflow-y-auto bg-slate-100 p-4 xl:min-h-0">
      <div
        data-testid="mobile-preview-frame"
        className="aspect-[9/16] w-full max-w-[360px] overflow-y-auto rounded-[24px] border-[10px] border-slate-900 bg-white shadow-lg"
      >
        <div className="space-y-3 p-3">
        {blocks.map((block) => {
          if (block.type === "image") {
            const imageBlock = imageBlocks.find((item) => item.imageUrl === block.url);
            return (
              <figure
                key={`${block.lineIndex}-${block.url}`}
                id={imageBlock ? `generated-image-${imageBlock.id}` : undefined}
                className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"
              >
                <div className="bg-white p-2">
                  <img className="w-full rounded object-contain" src={block.url} alt={block.alt} />
                </div>
                <figcaption className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
                  {block.alt || "生成画像"}
                </figcaption>
              </figure>
            );
          }

          return (
            <button
              key={`${block.lineIndex}-${block.text}`}
              type="button"
              onClick={() => onSelectLine(block.lineIndex)}
              className={`grid w-full grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-md px-2 py-1.5 text-left text-sm leading-7 ${
                block.lineIndex === targetLineIndex
                  ? "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200"
                  : "text-slate-900 hover:bg-slate-50"
              }`}
            >
              <span
                className={`select-none text-right font-mono text-xs ${
                  block.lineIndex === targetLineIndex ? "text-emerald-700" : "text-slate-400"
                }`}
              >
                {block.lineIndex + 1}
              </span>
              <span className={block.text ? "whitespace-pre-wrap" : "text-slate-400"}>{block.text || "空行"}</span>
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}

export function EditorClient() {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const initializedRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);
  const [sessionId, setSessionId] = useState("");
  const [projectTitle, setProjectTitle] = useState(DEFAULT_EDITOR_PROJECT_TITLE);
  const [articleText, setArticleText] = useState(INITIAL_ARTICLE_TEXT);
  const [targetLineIndex, setTargetLineIndex] = useState(0);
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [assets, setAssets] = useState<AssetWithAnnotation[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [query, setQuery] = useState("高齢者の不安を強める悩み喚起画像");
  const [problemCategory, setProblemCategory] = useState("血糖");
  const [imageCategory, setImageCategory] = useState("");
  const [targetGenders, setTargetGenders] = useState<string[]>([]);
  const [targetAgeBands, setTargetAgeBands] = useState<string[]>([]);
  const [productName, setProductName] = useState("");
  const [additionalInstruction, setAdditionalInstruction] = useState("ニュース記事風。強い見出しと、読者が自分ごと化する表情を入れる。");
  const [size, setSize] = useState("auto");
  const [quality, setQuality] = useState("low");
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const [imageBlocks, setImageBlocks] = useState<EditorImageBlock[]>([]);
  const [historyItems, setHistoryItems] = useState<ImageGenerationHistoryItem[]>([]);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [batchArticleTextSnapshot, setBatchArticleTextSnapshot] = useState("");
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [queueingGeneration, setQueueingGeneration] = useState(false);
  const [queueingRevision, setQueueingRevision] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [projectSummaries, setProjectSummaries] = useState<EditorSessionSummary[]>([]);
  const [filterOptions, setFilterOptions] = useState(EMPTY_FILTER_OPTIONS);
  const [error, setError] = useState("");
  const [revisionTarget, setRevisionTarget] = useState<ImageGenerationHistoryItem | null>(null);
  const [revisionDetailsOpen, setRevisionDetailsOpen] = useState(true);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [revisionSize, setRevisionSize] = useState(size);
  const [revisionQuality, setRevisionQuality] = useState(quality);
  const [revisionAdditionalImages, setRevisionAdditionalImages] = useState<File[]>([]);

  const selectedAssets = useMemo(
    () => selectedAssetIds.map((id) => assets.find((asset) => asset.id === id)).filter(Boolean) as AssetWithAnnotation[],
    [assets, selectedAssetIds],
  );

  const currentLineText = selectedLineText(articleText, targetLineIndex);
  const articleLines = useMemo(() => articleText.split("\n"), [articleText]);
  const previewBlocks = useMemo(() => buildArticlePreviewBlocks(articleText, imageBlocks), [articleText, imageBlocks]);
  const activeHistoryCount = useMemo(
    () => historyItems.filter((item) => ACTIVE_HISTORY_STATUSES.has(item.status)).length,
    [historyItems],
  );
  const currentEditorState = useMemo<EditorState>(
    () => ({
      targetLineIndex,
      problemCategory,
      imageCategory,
      targetGenders,
      targetAgeBands,
      productName,
      query,
      selectedAssetIds,
      additionalInstruction,
      size,
      quality,
      editorMode,
    }),
    [
      additionalInstruction,
      editorMode,
      imageCategory,
      problemCategory,
      productName,
      quality,
      query,
      selectedAssetIds,
      size,
      targetAgeBands,
      targetGenders,
      targetLineIndex,
    ],
  );
  const genderOptions = useMemo(() => optionList(filterOptions.targetGenders), [filterOptions.targetGenders]);
  const ageBandOptions = useMemo(() => optionList(filterOptions.targetAgeBands), [filterOptions.targetAgeBands]);

  const setEditorUrlSession = useCallback((nextSessionId: string, mode: "push" | "replace" = "replace") => {
    const url = new URL(window.location.href);
    url.searchParams.set("sessionId", nextSessionId);
    if (mode === "push") {
      window.history.pushState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
      return;
    }
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, []);

  const applyEditorSession = useCallback((session: EditorSessionResponse["session"]) => {
    skipNextAutosaveRef.current = true;
    const nextState = { ...DEFAULT_EDITOR_STATE, ...session.editorState };
    const lineCount = session.articleText.split("\n").length;
    setSessionId(session.id);
    setProjectTitle(session.title || DEFAULT_EDITOR_PROJECT_TITLE);
    setArticleText(session.articleText);
    setImageBlocks(session.imageBlocks ?? []);
    setTargetLineIndex(Math.min(nextState.targetLineIndex, Math.max(lineCount - 1, 0)));
    setProblemCategory(nextState.problemCategory);
    setImageCategory(nextState.imageCategory);
    setTargetGenders(nextState.targetGenders);
    setTargetAgeBands(nextState.targetAgeBands);
    setProductName(nextState.productName);
    setQuery(nextState.query);
    setSelectedAssetIds(nextState.selectedAssetIds);
    setAdditionalInstruction(nextState.additionalInstruction);
    setSize(nextState.size);
    setQuality(nextState.quality);
    setEditorMode(nextState.editorMode);
    setLastSavedAt(session.lastSavedAt);
    setSaveStatus("saved");
  }, []);

  const loadProjectSummaries = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const response = await fetch("/api/editor-sessions?limit=50");
      const payload = (await response.json()) as EditorSessionListResponse | { error?: string };
      if (!response.ok || !("sessions" in payload)) {
        throw new Error(("error" in payload ? payload.error : undefined) ?? "プロジェクト履歴の取得に失敗しました");
      }
      setProjectSummaries(payload.sessions);
    } catch (projectError) {
      setError(projectError instanceof Error ? projectError.message : "プロジェクト履歴の取得に失敗しました");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const loadFilterOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/assets/filter-options?mediaType=image");
      const payload = (await response.json()) as typeof EMPTY_FILTER_OPTIONS | { error?: string };
      if (!response.ok || !("targetGenders" in payload)) {
        throw new Error(("error" in payload ? payload.error : undefined) ?? "フィルタ候補の取得に失敗しました");
      }
      setFilterOptions({
        targetGenders: payload.targetGenders,
        targetAgeBands: payload.targetAgeBands,
      });
    } catch (filterError) {
      setError(filterError instanceof Error ? filterError.message : "フィルタ候補の取得に失敗しました");
    }
  }, []);

  const loadGenerationHistory = useCallback(
    async (nextSessionId = sessionId, nextBatchId = activeBatchId) => {
      if (!nextSessionId && !nextBatchId) return;
      setLoadingHistory(true);
      try {
        const params = new URLSearchParams();
        if (nextSessionId) params.set("sessionId", nextSessionId);
        const response = await fetch(`/api/image-generations?${params.toString()}`);
        const payload = (await response.json()) as ImageGenerationHistoryResponse | { error?: string };
        if (!response.ok || !("items" in payload)) {
          throw new Error(("error" in payload ? payload.error : undefined) ?? "画像生成履歴の取得に失敗しました");
        }

        setHistoryItems(payload.items);
        setRevisionTarget((current) => (current ? payload.items.find((item) => item.id === current.id) ?? current : current));
        if (payload.session) {
          setProjectTitle(payload.session.title || DEFAULT_EDITOR_PROJECT_TITLE);
          setLastSavedAt(payload.session.lastSavedAt);
        }
        const completedBlocks = payload.items
          .map((item) => historyItemToImageBlock(item))
          .filter(Boolean) as EditorImageBlock[];
        setImageBlocks((current) => mergeImageBlocks([...completedBlocks, ...(payload.session?.imageBlocks ?? [])], current));

        const hasActiveBatchItems = payload.items.some(
          (item) => (!nextBatchId || item.batchId === nextBatchId) && ACTIVE_HISTORY_STATUSES.has(item.status),
        );
        if (nextBatchId && !hasActiveBatchItems) {
          setActiveBatchId("");
          if (payload.session && batchArticleTextSnapshot && articleText === batchArticleTextSnapshot) {
            setArticleText(payload.session.articleText);
          }
        }
      } catch (historyError) {
        setError(historyError instanceof Error ? historyError.message : "画像生成履歴の取得に失敗しました");
      } finally {
        setLoadingHistory(false);
      }
    },
    [activeBatchId, articleText, batchArticleTextSnapshot, sessionId],
  );

  const loadEditorSession = useCallback(
    async (nextSessionId: string, mode: "push" | "replace" = "replace") => {
      setLoadingSession(true);
      setError("");
      try {
        const response = await fetch(`/api/editor-sessions/${nextSessionId}`);
        const payload = (await response.json()) as EditorSessionResponse | { error?: string };
        if (!response.ok || !("session" in payload)) {
          throw new Error(("error" in payload ? payload.error : undefined) ?? "プロジェクトの取得に失敗しました");
        }
        applyEditorSession(payload.session);
        setEditorUrlSession(payload.session.id, mode);
        setActiveBatchId("");
        setBatchArticleTextSnapshot("");
        setRevisionTarget(null);
        await loadGenerationHistory(payload.session.id, "");
      } catch (sessionError) {
        setError(sessionError instanceof Error ? sessionError.message : "プロジェクトの取得に失敗しました");
      } finally {
        setLoadingSession(false);
      }
    },
    [applyEditorSession, loadGenerationHistory, setEditorUrlSession],
  );

  const createDraftSession = useCallback(async () => {
    setLoadingSession(true);
    setError("");
    try {
      const response = await fetch("/api/editor-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: DEFAULT_EDITOR_PROJECT_TITLE,
          articleText: INITIAL_ARTICLE_TEXT,
          editorState: DEFAULT_EDITOR_STATE,
        }),
      });
      const payload = (await response.json()) as EditorSessionResponse | { error?: string };
      if (!response.ok || !("session" in payload)) {
        throw new Error(("error" in payload ? payload.error : undefined) ?? "下書きプロジェクトの作成に失敗しました");
      }
      applyEditorSession(payload.session);
      setEditorUrlSession(payload.session.id, "replace");
      await loadProjectSummaries();
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "下書きプロジェクトの作成に失敗しました");
    } finally {
      setLoadingSession(false);
    }
  }, [applyEditorSession, loadProjectSummaries, setEditorUrlSession]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const timeout = window.setTimeout(() => {
      void loadFilterOptions();
      void loadProjectSummaries();

      const url = new URL(window.location.href);
      const urlSessionId = url.searchParams.get("sessionId");
      if (urlSessionId) {
        void loadEditorSession(urlSessionId, "replace");
        return;
      }
      void createDraftSession();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [createDraftSession, loadEditorSession, loadFilterOptions, loadProjectSummaries]);

  useEffect(() => {
    if (!sessionId || loadingSession) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    setSaveStatus("idle");
    const timeout = window.setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const response = await fetch(`/api/editor-sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: projectTitle,
            articleText,
            editorState: currentEditorState,
          }),
        });
        const payload = (await response.json()) as EditorSessionResponse | { error?: string };
        if (!response.ok || !("session" in payload)) {
          throw new Error(("error" in payload ? payload.error : undefined) ?? "保存に失敗しました");
        }
        setProjectTitle(payload.session.title);
        setLastSavedAt(payload.session.lastSavedAt);
        setSaveStatus("saved");
        setProjectSummaries((current) =>
          current.map((project) =>
            project.id === payload.session.id
              ? {
                  ...project,
                  title: payload.session.title,
                  updatedAt: payload.session.updatedAt,
                  lastSavedAt: payload.session.lastSavedAt,
                }
              : project,
          ),
        );
      } catch (saveError) {
        setSaveStatus("error");
        setError(saveError instanceof Error ? saveError.message : "保存に失敗しました");
      }
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [articleText, currentEditorState, loadingSession, projectTitle, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    if (!activeBatchId && activeHistoryCount === 0) return;
    const interval = window.setInterval(() => {
      void loadGenerationHistory(sessionId, activeBatchId);
    }, 2000);
    return () => window.clearInterval(interval);
  }, [activeBatchId, activeHistoryCount, loadGenerationHistory, sessionId]);

  function updateTargetLineFromTextarea() {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    setTargetLineIndex(getLineIndexAtSelection(articleText, textarea.selectionStart));
  }

  async function loadAssets() {
    setLoadingAssets(true);
    setError("");
    try {
      const semanticQuery = [
        problemCategory ? `悩みカテゴリ: ${problemCategory}` : null,
        imageCategory ? `画像カテゴリ: ${imageCategory}` : null,
        targetGenders.length ? `性別: ${targetGenders.join(", ")}` : null,
        targetAgeBands.length ? `年代: ${targetAgeBands.join(", ")}` : null,
        productName ? `商材: ${productName}` : null,
        query ? `自由記述: ${query}` : null,
        currentLineText ? `構成行: ${currentLineText}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const response = await fetch("/api/search/semantic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: semanticQuery || "記事LP画像素材",
          limit: 60,
          filters: {
            problemCategory: problemCategory || undefined,
            imageCategory: imageCategory || undefined,
            targetGenders,
            targetAgeBands,
            productName: productName || undefined,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "意味検索に失敗しました");
      setAssets(payload.assets ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "素材検索に失敗しました");
    } finally {
      setLoadingAssets(false);
    }
  }

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((current) => {
      if (current.includes(assetId)) {
        return current.filter((id) => id !== assetId);
      }
      if (current.length >= 4) {
        setError("参考素材は最大4枚まで選択できます");
        return current;
      }
      setError("");
      return [...current, assetId];
    });
  }

  function handleAdditionalImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 2);
    setAdditionalImages(files);
    if ((event.target.files?.length ?? 0) > 2) {
      setError("追加画像は最大2枚までアップロードできます");
    } else {
      setError("");
    }
  }

  function handleEditorKeyUp() {
    updateTargetLineFromTextarea();
  }

  async function startImageGeneration(lineIndex = targetLineIndex) {
    setQueueingGeneration(true);
    setError("");
    try {
      const formData = new FormData();
      if (sessionId) formData.set("sessionId", sessionId);
      formData.set("articleText", articleText);
      formData.append("targetLineIndexes", String(lineIndex));
      formData.set("additionalInstruction", additionalInstruction);
      formData.set("size", size);
      formData.set("quality", quality);
      selectedAssetIds.forEach((id) => formData.append("referenceAssetIds", id));
      additionalImages.forEach((file) => formData.append("additionalImages", file));

      const response = await fetch("/api/image-generation-batches", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ImageGenerationBatchResponse | { error?: string };
      if (!response.ok || !("batchId" in payload)) {
        throw new Error(("error" in payload ? payload.error : undefined) ?? "画像生成に失敗しました");
      }

      setSessionId(payload.sessionId);
      setActiveBatchId(payload.batchId);
      setBatchArticleTextSnapshot(articleText);
      const nextLineIndex = findNextGenerationLineIndex(articleText, lineIndex);
      setTargetLineIndex(nextLineIndex);
      setAdditionalImages([]);
      setEditorMode("edit");
      await loadGenerationHistory(payload.sessionId, payload.batchId);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "画像生成に失敗しました");
    } finally {
      setQueueingGeneration(false);
    }
  }

  function openRevisionPanel(item: ImageGenerationHistoryItem) {
    setRevisionTarget(item);
    setRevisionInstruction("");
    setRevisionAdditionalImages([]);
    setRevisionSize(item.generatedImage?.size ?? size);
    setRevisionQuality(item.generatedImage?.quality ?? quality);
    setRevisionDetailsOpen(true);
  }

  function handleRevisionAdditionalImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 2);
    setRevisionAdditionalImages(files);
    if ((event.target.files?.length ?? 0) > 2) {
      setError("修正用の追加画像は最大2枚までアップロードできます");
    } else {
      setError("");
    }
  }

  async function startRevisionGeneration() {
    if (!revisionTarget?.generatedImage) {
      setError("修正する生成画像を選択してください");
      return;
    }

    setQueueingRevision(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("articleText", articleText);
      formData.set("revisionInstruction", revisionInstruction);
      formData.set("size", revisionSize);
      formData.set("quality", revisionQuality);
      revisionAdditionalImages.forEach((file) => formData.append("additionalImages", file));

      const response = await fetch(`/api/image-generations/${revisionTarget.id}/revisions`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ImageGenerationBatchResponse | { error?: string };
      if (!response.ok || !("batchId" in payload)) {
        throw new Error(("error" in payload ? payload.error : undefined) ?? "修正生成に失敗しました");
      }

      setSessionId(payload.sessionId);
      setActiveBatchId(payload.batchId);
      setBatchArticleTextSnapshot(articleText);
      setRevisionInstruction("");
      setRevisionAdditionalImages([]);
      await loadGenerationHistory(payload.sessionId, payload.batchId);
    } catch (revisionError) {
      setError(revisionError instanceof Error ? revisionError.message : "修正生成に失敗しました");
    } finally {
      setQueueingRevision(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-slate-100">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-500">画像生成エディタ</p>
            <input
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              className="mt-1 w-full max-w-xl rounded-md border border-transparent bg-white px-0 text-xl font-semibold text-slate-950 outline-none focus:border-emerald-500 focus:px-2"
              placeholder="プロジェクトタイトル"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-1 ${
                  saveStatus === "error"
                    ? "bg-rose-50 text-rose-700"
                    : saveStatus === "saved"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                <Save size={12} />
                {saveStatusLabel(saveStatus)}
                {lastSavedAt && saveStatus === "saved" ? ` ${formatDateTime(lastSavedAt)}` : ""}
              </span>
              {loadingSession ? <span className="rounded bg-slate-100 px-2 py-1">読み込み中</span> : null}
              <span className="rounded bg-slate-100 px-2 py-1">現在 {targetLineIndex + 1}行目</span>
              <span className="rounded bg-slate-100 px-2 py-1">生成対象 {targetLineIndex + 1}行目</span>
              <span className="rounded bg-slate-100 px-2 py-1">参考素材 {selectedAssetIds.length}/4</span>
              <span className="rounded bg-slate-100 px-2 py-1">追加画像 {additionalImages.length}/2</span>
              {activeHistoryCount ? <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">生成中 {activeHistoryCount}件</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setProjectDrawerOpen(true);
                void loadProjectSummaries();
              }}
              className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FolderOpen size={16} />
              プロジェクト履歴
            </button>
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Search size={16} />
              素材一覧
            </Link>
          </div>
        </div>
      </section>

      {projectDrawerOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/20"
            aria-label="プロジェクト履歴を閉じる"
            onClick={() => setProjectDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-[min(420px,100vw)] flex-col border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">プロジェクト履歴</h2>
                <p className="mt-1 text-xs text-slate-500">タイトルを押すと再編集できます</p>
              </div>
              <button
                type="button"
                onClick={() => setProjectDrawerOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="閉じる"
              >
                <X size={16} />
              </button>
            </div>
            <div className="border-b border-slate-200 p-3">
              <button
                type="button"
                onClick={() => {
                  void createDraftSession().then(() => setProjectDrawerOpen(false));
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                <PencilLine size={15} />
                新規下書き
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {loadingProjects ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-slate-200 p-4 text-sm text-slate-500">
                  <Loader2 className="animate-spin" size={16} />
                  読み込み中
                </div>
              ) : null}
              {projectSummaries.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    setProjectDrawerOpen(false);
                    void loadEditorSession(project.id, "push");
                  }}
                  className={`grid w-full grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-md border p-2 text-left hover:border-emerald-500 hover:bg-emerald-50 ${
                    project.id === sessionId ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded bg-slate-100">
                    {project.latestImageUrl ? (
                      <img className="h-full w-full object-contain" src={project.latestImageUrl} alt="" />
                    ) : (
                      <FileImage size={18} className="text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{project.title}</p>
                    <p className="mt-1 text-xs text-slate-500">更新 {formatDateTime(project.updatedAt)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      完了 {project.completedImageCount}件
                      {project.activeGenerationCount ? ` / 生成中 ${project.activeGenerationCount}件` : ""}
                    </p>
                  </div>
                </button>
              ))}
              {!loadingProjects && projectSummaries.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  まだプロジェクトはありません
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      <section className="mx-auto grid max-w-[1840px] gap-4 px-4 py-4 xl:grid-cols-[460px_minmax(520px,1fr)_360px] 2xl:grid-cols-[500px_minmax(620px,1fr)_400px]">
        <section
          data-testid="editor-panel"
          className="min-w-0 rounded-lg border border-slate-200 bg-white xl:flex xl:h-[calc(100vh-180px)] xl:flex-col xl:overflow-hidden"
        >
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-950">記事構成案</h2>
              <p className="mt-1 max-w-4xl truncate text-xs text-slate-500">{currentLineText || "空行"}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-1">
                {(["edit", "preview"] as EditorMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setEditorMode(mode)}
                    className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold ${
                      editorMode === mode ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"
                    }`}
                  >
                    {mode === "edit" ? <PencilLine size={13} /> : <Eye size={13} />}
                    {mode === "edit" ? "編集" : "プレビュー"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditorMode("edit");
                    window.setTimeout(() => {
                      textAreaRef.current?.focus();
                      updateTargetLineFromTextarea();
                    }, 0);
                  }}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium whitespace-nowrap text-slate-700 hover:bg-slate-100"
                >
                  <MousePointer2 size={15} />
                  行を反映
                </button>
              </div>
            </div>
          </div>
          {editorMode === "edit" ? (
            <div className="grid min-h-[560px] min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[56px_minmax(0,1fr)] xl:min-h-0">
              <div className="hidden select-none border-r border-slate-200 bg-slate-50 px-2 py-4 text-right font-mono text-xs leading-7 text-slate-400 lg:block">
                {articleLines.map((_, index) => (
                  <button
                    key={`${index}-${articleLines.length}`}
                    type="button"
                    onClick={() => setTargetLineIndex(index)}
                    className={`block w-full text-right leading-7 ${
                      index === targetLineIndex ? "font-semibold text-emerald-700" : ""
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <textarea
                ref={textAreaRef}
                value={articleText}
                onChange={(event) => {
                  const nextText = event.target.value;
                  setArticleText(nextText);
                  const lineCount = nextText.split("\n").length;
                  const nextLineIndex = getLineIndexAtSelection(nextText, event.target.selectionStart);
                  setTargetLineIndex(Math.min(nextLineIndex, lineCount - 1));
                }}
                onClick={updateTargetLineFromTextarea}
                onKeyUp={handleEditorKeyUp}
                rows={Math.max(articleLines.length + 2, 20)}
                className="min-h-[560px] w-full min-w-0 resize-none overflow-hidden bg-white p-4 font-mono text-sm leading-7 text-slate-900 outline-none xl:min-h-full"
                spellCheck={false}
              />
            </div>
          ) : (
            <ArticlePreview
              blocks={previewBlocks}
              imageBlocks={imageBlocks}
              targetLineIndex={targetLineIndex}
              onSelectLine={setTargetLineIndex}
            />
          )}
          {editorMode === "edit" ? (
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-950">挿入済み画像</h3>
                <span className="text-xs text-slate-500">{imageBlocks.length}件</span>
              </div>
              <div className="mt-3 grid max-h-32 gap-3 overflow-y-auto">
                {imageBlocks.map((block) => (
                  <ResultPreview key={block.id} block={block} />
                ))}
                {imageBlocks.length === 0 ? <p className="text-sm text-slate-500">まだありません</p> : null}
              </div>
            </div>
          ) : null}
        </section>

        <section
          data-testid="search-panel"
          className="min-w-0 rounded-lg border border-slate-200 bg-white xl:flex xl:h-[calc(100vh-180px)] xl:flex-col xl:overflow-hidden"
        >
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-950">参考画像データベース</h2>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">意味検索</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-5">
                <select
                  value={problemCategory}
                  onChange={(event) => setProblemCategory(event.target.value)}
                  className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
                >
                  <option value="">悩みすべて</option>
                  {PROBLEM_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <select
                  value={imageCategory}
                  onChange={(event) => setImageCategory(event.target.value)}
                  className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
                >
                  <option value="">画像カテゴリすべて</option>
                  {IMAGE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <MultiSelectFilter label="性別" options={genderOptions} selectedValues={targetGenders} onChange={setTargetGenders} />
                <MultiSelectFilter label="年代" options={ageBandOptions} selectedValues={targetAgeBands} onChange={setTargetAgeBands} />
                <input
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600"
                  placeholder="商材名"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void loadAssets();
                  }}
                  className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600"
                  placeholder="自由記述で検索"
                />
                <button
                  type="button"
                  onClick={() => void loadAssets()}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {loadingAssets ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                  検索
                </button>
              </div>
            </div>

            <div className="min-h-[240px] overflow-y-auto p-3 xl:min-h-0 xl:flex-1">
              {error ? <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
              <div className="grid grid-cols-2 gap-3">
                {assets.map((asset) => {
                  const selected = selectedAssetIds.includes(asset.id);
                  const annotation = asset.asset_annotations;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => toggleAsset(asset.id)}
                      className={`overflow-hidden rounded-md border bg-white text-left transition ${
                        selected ? "border-emerald-600 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <div className="relative aspect-[4/3] bg-slate-100">
                        <AssetThumb asset={asset} />
                        {selected ? (
                          <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                            <Check size={14} />
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-2 p-2">
                        <p className="line-clamp-2 min-h-8 text-xs font-semibold leading-4 text-slate-950">
                          {annotation?.description || asset.product_name || "未分類素材"}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {[asset.problem_category, asset.target_gender, asset.target_age_band, ...assetImageLabels(asset), annotation?.lp_section_role]
                            .filter(Boolean)
                            .slice(0, 4)
                            .map((label) => (
                              <span key={label} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                                {label}
                              </span>
                            ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!loadingAssets && assets.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
                  素材が見つかりません
                </div>
              ) : null}
            </div>
        </section>

        <section
          data-testid="generate-panel"
          className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 xl:max-h-[calc(100vh-180px)] xl:self-start xl:overflow-y-auto"
        >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-950">画像生成</h2>
              <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">gpt-image-2</span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {selectedAssets.map((asset) => (
                <div key={asset.id} className="relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                  <AssetThumb asset={asset} />
                  <button
                    type="button"
                    onClick={() => toggleAsset(asset.id)}
                    className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-600 shadow"
                    aria-label="Remove selected asset"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {selectedAssets.length === 0 ? (
                <div className="col-span-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
                  参考画像未選択
                </div>
              ) : null}
            </div>

            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
              <Upload size={16} />
              追加画像を選択
              <input type="file" accept="image/*" multiple className="sr-only" onChange={handleAdditionalImages} />
            </label>
            {additionalImages.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {additionalImages.map((file) => (
                  <span key={`${file.name}-${file.size}`} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {file.name}
                  </span>
                ))}
              </div>
            ) : null}

            <label className="mt-4 block text-sm font-medium text-slate-700">
              追加指示
              <textarea
                value={additionalInstruction}
                onChange={(event) => setAdditionalInstruction(event.target.value)}
                className="mt-1 h-24 w-full resize-none rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-emerald-600"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={size}
                onChange={(event) => setSize(event.target.value)}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
              >
                {SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                value={quality}
                onChange={(event) => setQuality(event.target.value)}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
              >
                {QUALITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800">現在の生成対象</p>
                <span className="text-xs text-slate-500">{targetLineIndex + 1}行目</span>
              </div>
              <p className="mt-2 line-clamp-3 rounded bg-white px-2 py-2 text-xs leading-5 text-slate-600 ring-1 ring-slate-200">
                {currentLineText || "空行"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void startImageGeneration()}
              disabled={queueingGeneration || loadingSession || !sessionId}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {queueingGeneration ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
              バックグラウンド生成を開始
            </button>
            {error ? <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}

            <div className="mt-4 rounded-md border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <h3 className="text-sm font-semibold text-slate-950">画像生成履歴</h3>
                <button
                  type="button"
                  onClick={() => void loadGenerationHistory()}
                  disabled={!sessionId || loadingHistory}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  <RefreshCw className={loadingHistory ? "animate-spin" : ""} size={13} />
                  更新
                </button>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto p-3">
                {historyItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 bg-white p-2">
                    <div className="flex items-start gap-2">
                      <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                        {item.generatedImage ? (
                          <img className="h-full w-full object-contain" src={item.generatedImage.url} alt={item.generatedImage.alt} />
                        ) : ACTIVE_HISTORY_STATUSES.has(item.status) ? (
                          <Loader2 className="animate-spin text-slate-400" size={18} />
                        ) : (
                          <FileImage className="text-slate-400" size={18} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <p className="text-xs font-semibold text-slate-900">{item.targetLineIndex + 1}行目</p>
                            {item.generationKind === "revision" ? (
                              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">修正</span>
                            ) : null}
                          </div>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                              item.status === "completed"
                                ? "bg-emerald-50 text-emerald-700"
                                : item.status === "failed"
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {historyStatusLabel(item.status)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.targetLineText || item.progressStep || "対象行"}</p>
                        {item.progressStep ? <p className="mt-1 text-[11px] text-slate-400">{item.progressStep}</p> : null}
                        {item.errorMessage ? <p className="mt-1 line-clamp-2 text-xs text-rose-700">{item.errorMessage}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.generatedImage ? (
                            <button
                              type="button"
                              onClick={() => openRevisionPanel(item)}
                              className="text-xs font-medium text-slate-600 hover:text-slate-950"
                            >
                              詳細・修正
                            </button>
                          ) : null}
                          {item.status === "failed" ? (
                            <button
                              type="button"
                              onClick={() => void startImageGeneration(item.targetLineIndex)}
                              className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
                            >
                              再生成
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {historyItems.length === 0 ? <p className="text-sm text-slate-500">まだ生成履歴はありません</p> : null}
              </div>
            </div>

            {revisionTarget ? (
              <div data-testid="revision-panel" className="mt-4 rounded-md border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-950">履歴から修正</h3>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {revisionTarget.targetLineIndex + 1}行目 {revisionTarget.generatedImage?.promptSummary ?? ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRevisionTarget(null)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-white hover:text-slate-900"
                    aria-label="修正パネルを閉じる"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-4 p-3">
                  {revisionTarget.generatedImage ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">アウトプット画像</p>
                      <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white">
                        <img
                          className="max-h-72 w-full object-contain"
                          src={revisionTarget.generatedImage.url}
                          alt={revisionTarget.generatedImage.alt}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <p className="text-xs font-semibold text-slate-500">元画像・参考画像</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {revisionTarget.referenceAssets.map((asset) => (
                        <div key={asset.id} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                          <div className="aspect-square bg-slate-100">
                            <img className="h-full w-full object-contain p-1" src={asset.thumbnailUrl || asset.url} alt={asset.description} />
                          </div>
                          <p className="line-clamp-2 px-2 py-1 text-[11px] leading-4 text-slate-600">{asset.description}</p>
                        </div>
                      ))}
                      {revisionTarget.referenceAssets.length === 0 ? (
                        <div className="col-span-3 rounded-md border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
                          修正時はアウトプット画像を元画像として使用します。
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={() => setRevisionDetailsOpen((current) => !current)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-800"
                    >
                      詳細画像生成プロンプト
                      <ChevronDown className={revisionDetailsOpen ? "rotate-180 transition" : "transition"} size={16} />
                    </button>
                    {revisionDetailsOpen ? (
                      <div className="space-y-3 border-t border-slate-200 p-3">
                        {revisionTarget.promptPlan ? (
                          <div>
                            <p className="text-xs font-semibold text-slate-500">生成計画</p>
                            <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs leading-5 text-slate-700">
                              {JSON.stringify(revisionTarget.promptPlan, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                        {revisionTarget.finalPrompt ? (
                          <div>
                            <p className="text-xs font-semibold text-slate-500">最終プロンプト</p>
                            <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs leading-5 text-slate-700">
                              {revisionTarget.finalPrompt}
                            </pre>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">プロンプト詳細は生成完了後に表示されます。</p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <label className="block text-sm font-medium text-slate-700">
                    修正指示
                    <textarea
                      value={revisionInstruction}
                      onChange={(event) => setRevisionInstruction(event.target.value)}
                      className="mt-1 h-24 w-full resize-none rounded-md border border-slate-300 bg-white p-3 text-sm outline-none focus:border-emerald-600"
                      placeholder="例: 見出しをもっと大きく、人物を左に寄せて、赤い警告帯を残す"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    <Upload size={16} />
                    修正用の追加画像を選択
                    <input type="file" accept="image/*" multiple className="sr-only" onChange={handleRevisionAdditionalImages} />
                  </label>
                  {revisionAdditionalImages.length ? (
                    <div className="flex flex-wrap gap-2">
                      {revisionAdditionalImages.map((file) => (
                        <span key={`${file.name}-${file.size}`} className="rounded bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
                          {file.name}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={revisionSize}
                      onChange={(event) => setRevisionSize(event.target.value)}
                      className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
                    >
                      {SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={revisionQuality}
                      onChange={(event) => setRevisionQuality(event.target.value)}
                      className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
                    >
                      {QUALITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => void startRevisionGeneration()}
                    disabled={queueingRevision || loadingSession || !revisionInstruction.trim()}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {queueingRevision ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    修正生成を開始
                  </button>
                </div>
              </div>
            ) : null}
        </section>
      </section>
    </main>
  );
}
