export type MediaType = "image" | "video_frame";
export type IngestJobStatus = "queued" | "running" | "completed" | "failed";

export type MediaAsset = {
  id: string;
  media_type: MediaType;
  parent_asset_id: string | null;
  source_article_url: string;
  source_media_url: string;
  source_order: number;
  storage_bucket: string;
  storage_path: string;
  thumbnail_storage_path: string | null;
  file_hash: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  aspect_ratio: number | null;
  found_in: string | null;
  alt_text: string | null;
  product_name: string | null;
  target_gender: string | null;
  target_age_band: string | null;
  problem_category: string | null;
  created_at: string;
  updated_at: string;
};

export type AssetAnnotation = {
  id: string;
  asset_id: string;
  image_category: string | null;
  lp_section_role: string | null;
  appeal_role: string | null;
  description: string | null;
  visual_description: string | null;
  ocr_text: string | null;
  tags: string[];
  raw_ai_response: Record<string, unknown> | null;
  ai_confidence: number | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
};

export type AssetWithAnnotation = MediaAsset & {
  asset_annotations: AssetAnnotation | null;
  asset_sources?: AssetSource[];
  public_url?: string;
  thumbnail_url?: string;
  similarity?: number;
};

export type AssetSource = {
  id: string;
  asset_id: string;
  source_article_url: string;
  source_media_url: string;
  source_order: number;
  found_in: string | null;
  alt_text: string | null;
  is_first_view: boolean;
  created_at: string;
};

export type IngestJob = {
  id: string;
  urls: string[];
  status: IngestJobStatus;
  total_urls: number;
  total_candidates: number;
  processed_urls: number;
  processed_candidates: number;
  created_assets: number;
  skipped_assets: number;
  failed_assets: number;
  current_article_url: string | null;
  current_media_url: string | null;
  current_step: string | null;
  last_log_at: string | null;
  logs: Array<Record<string, unknown>>;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type EditorSession = {
  id: string;
  title: string;
  article_text: string;
  image_blocks: Array<Record<string, unknown>>;
  editor_state: Record<string, unknown>;
  last_saved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ImageGenerationBatchStatus = "queued" | "running" | "completed" | "failed";

export type ImageGenerationBatchRecord = {
  id: string;
  session_id: string;
  article_text_snapshot: string;
  target_line_indexes: number[];
  status: ImageGenerationBatchStatus;
  total_count: number;
  queued_count: number;
  running_count: number;
  completed_count: number;
  failed_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GeneratedImageStatus = "queued" | "planning" | "generating" | "uploading" | "completed" | "failed";
export type GeneratedImageKind = "initial" | "revision";

export type GeneratedImageRecord = {
  id: string;
  session_id: string;
  batch_id: string | null;
  parent_generation_id: string | null;
  generation_kind: GeneratedImageKind;
  target_line_index: number;
  target_line_text_snapshot: string | null;
  reference_asset_ids: string[];
  additional_image_paths: string[];
  additional_instruction: string | null;
  revision_instruction: string | null;
  model: string;
  prompt_model: string;
  size: string;
  quality: string;
  prompt_plan: Record<string, unknown> | null;
  final_prompt: string | null;
  storage_bucket: string;
  storage_path: string | null;
  status: GeneratedImageStatus;
  progress_step: string | null;
  inserted_markdown: string | null;
  error_message: string | null;
  usage: Record<string, unknown> | null;
  request_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
