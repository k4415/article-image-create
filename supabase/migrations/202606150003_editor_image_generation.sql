create table if not exists public.editor_sessions (
  id uuid primary key default gen_random_uuid(),
  article_text text not null default '',
  image_blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.editor_sessions(id) on delete cascade,
  target_line_index integer not null,
  reference_asset_ids uuid[] not null default '{}',
  additional_image_paths text[] not null default '{}',
  additional_instruction text,
  model text not null,
  prompt_model text not null,
  size text not null,
  quality text not null,
  prompt_plan jsonb,
  final_prompt text,
  storage_bucket text not null default 'lp-assets',
  storage_path text,
  status text not null check (status in ('running', 'completed', 'failed')),
  error_message text,
  usage jsonb,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_images_session_id_idx on public.generated_images (session_id);
create index if not exists generated_images_status_idx on public.generated_images (status);
create index if not exists generated_images_created_at_idx on public.generated_images (created_at desc);
