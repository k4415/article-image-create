import type { EditorSessionSummary, EditorState } from "./sessions";

export type EditorImageBlock = {
  id: string;
  lineIndex: number;
  markdown: string;
  imageUrl: string;
  alt: string;
  referenceAssetIds: string[];
  createdAt: string;
};

export type EditorSession = {
  id: string;
  title: string;
  articleText: string;
  imageBlocks: EditorImageBlock[];
  editorState: EditorState;
  lastSavedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ImagePromptPlan = {
  articleSummary: string;
  targetLineRole: string;
  targetLineText: string;
  imageText: string;
  visualDirection: string;
  layoutDirection: string;
  referenceImageDirections: string[];
  referenceDesignBrief: ReferenceDesignBrief;
  safetyNotes: string[];
  promptSummary: string;
};

export type ReferenceDesignBrief = {
  canvasShape: string;
  aspectRatio: string;
  compositionGrid: string;
  textHierarchy: string;
  typography: string;
  colorPalette: string;
  visualDensity: string;
  imageTreatment: string;
  layoutConstraints: string[];
  referenceObservations: string[];
};

export type ImageGenerationRequest = {
  sessionId?: string;
  articleText: string;
  targetLineIndex: number;
  referenceAssetIds: string[];
  additionalInstruction: string;
  size: string;
  quality: string;
};

export type GeneratedImage = {
  id: string;
  sessionId: string;
  url: string;
  storagePath: string;
  alt: string;
  model: string;
  size: string;
  quality: string;
  referenceAssetIds: string[];
  additionalImageCount: number;
  additionalInstruction: string;
  promptSummary: string;
  status: "queued" | "planning" | "generating" | "uploading" | "completed" | "failed";
};

export type ImageGenerationResponse = {
  sessionId: string;
  generatedImage: GeneratedImage;
  insertedMarkdown: string;
  promptPlan: ImagePromptPlan;
  finalPrompt: string;
  usage?: Record<string, unknown> | null;
  revisedPrompt?: string | null;
  requestId?: string | null;
};

export type ImageGenerationBatchResponse = {
  batchId: string;
  sessionId: string;
  generationIds: string[];
  status: "queued";
  totalCount: number;
  queuedCount: number;
};

export type ImageGenerationReferenceAsset = {
  id: string;
  url: string;
  thumbnailUrl: string;
  description: string;
  problemCategory: string | null;
  imageCategory: string | null;
};

export type ImageGenerationHistoryItem = {
  id: string;
  batchId: string | null;
  sessionId: string;
  parentGenerationId: string | null;
  generationKind: "initial" | "revision";
  targetLineIndex: number;
  targetLineText: string;
  status: "queued" | "planning" | "generating" | "uploading" | "completed" | "failed";
  progressStep: string | null;
  generatedImage: GeneratedImage | null;
  insertedMarkdown: string | null;
  promptPlan: ImagePromptPlan | null;
  finalPrompt: string | null;
  revisionInstruction: string | null;
  referenceAssets: ImageGenerationReferenceAsset[];
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type ImageGenerationHistoryResponse = {
  items: ImageGenerationHistoryItem[];
  session: {
    id: string;
    title: string;
    articleText: string;
    imageBlocks: EditorImageBlock[];
    editorState: EditorState;
    lastSavedAt: string | null;
  } | null;
};

export type EditorSessionResponse = {
  session: EditorSession;
};

export type EditorSessionListResponse = {
  sessions: EditorSessionSummary[];
};
