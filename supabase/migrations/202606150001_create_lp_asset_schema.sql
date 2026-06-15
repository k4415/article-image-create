create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lp-assets',
  'lp-assets',
  true,
  524288000,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.problem_categories (
  id uuid primary key default gen_random_uuid(),
  major text not null,
  minor text,
  body_part text,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (major, minor)
);

create table if not exists public.ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  urls text[] not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  total_urls integer not null default 0,
  total_candidates integer not null default 0,
  created_assets integer not null default 0,
  skipped_assets integer not null default 0,
  failed_assets integer not null default 0,
  logs jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('image', 'video', 'video_frame')),
  parent_asset_id uuid references public.media_assets(id) on delete cascade,
  source_article_url text not null,
  source_media_url text not null,
  source_order integer not null default 0,
  storage_bucket text not null default 'lp-assets',
  storage_path text not null,
  thumbnail_storage_path text,
  file_hash text not null,
  mime_type text,
  file_size_bytes bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  aspect_ratio numeric,
  found_in text,
  alt_text text,
  product_name text,
  target_gender text,
  target_age_band text,
  problem_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_article_url, source_media_url, file_hash)
);

create table if not exists public.asset_annotations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  image_category text,
  lp_section_role text,
  appeal_role text,
  description text,
  visual_description text,
  ocr_text text,
  tags text[] not null default '{}',
  raw_ai_response jsonb,
  ai_confidence numeric,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_embeddings (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  search_text text not null,
  embedding extensions.vector(1536) not null,
  embedding_model text not null default 'text-embedding-3-small',
  created_at timestamptz not null default now()
);

create index if not exists media_assets_source_article_url_idx on public.media_assets (source_article_url);
create index if not exists media_assets_media_type_idx on public.media_assets (media_type);
create index if not exists media_assets_problem_category_idx on public.media_assets (problem_category);
create index if not exists asset_annotations_image_category_idx on public.asset_annotations (image_category);
create index if not exists asset_annotations_lp_section_role_idx on public.asset_annotations (lp_section_role);
create index if not exists asset_embeddings_embedding_hnsw_idx
  on public.asset_embeddings using hnsw (embedding extensions.vector_cosine_ops);

set search_path = public, extensions;

create or replace function public.match_assets (
  query_embedding extensions.vector(1536),
  match_threshold float default 0.2,
  match_count int default 20
)
returns table (
  asset_id uuid,
  similarity float
)
language sql stable
as $$
  select
    asset_embeddings.asset_id,
    1 - (asset_embeddings.embedding <=> query_embedding) as similarity
  from public.asset_embeddings
  where 1 - (asset_embeddings.embedding <=> query_embedding) > match_threshold
  order by asset_embeddings.embedding <=> query_embedding
  limit match_count;
$$;

insert into public.problem_categories (major, minor, body_part, keywords)
values
  ('血糖', '糖尿・高血糖', 'すい臓・血糖', array['糖尿', '血糖', '食事制限', '合併症']),
  ('薄毛', '女性薄毛', '髪・頭皮', array['薄毛', '抜け毛', '頭皮', '女性ホルモン']),
  ('頻尿', '夜間頻尿', '膀胱', array['頻尿', '夜間尿', 'トイレ', '膀胱']),
  ('尿漏れ', '男性尿漏れ', '尿道・腎臓', array['尿漏れ', '尿もれ', '腎臓', '尿道']),
  ('視力', '老眼・視力低下', '目', array['視力', '老眼', '眼圧', '運転']),
  ('肝臓', '肝機能・脂肪肝', '肝臓', array['肝臓', '脂肪肝', '肝機能', '毒素']),
  ('美容', 'シミ・シワ・毛穴・ニキビ', '肌', array['シミ', 'シワ', '毛穴', 'ニキビ']),
  ('痩身', 'ダイエット', '体型', array['痩身', '脂肪', 'ダイエット', '体重']),
  ('ひざ腰', '関節痛', '膝・腰', array['ひざ', '腰', '関節', '痛み']),
  ('フェムケア', '女性悩み', '女性特有悩み', array['フェムケア', '更年期', 'デリケート'])
on conflict (major, minor) do update set
  body_part = excluded.body_part,
  keywords = excluded.keywords;
