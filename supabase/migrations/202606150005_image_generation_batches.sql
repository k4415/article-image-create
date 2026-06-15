create table if not exists public.image_generation_batches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.editor_sessions(id) on delete cascade,
  article_text_snapshot text not null default '',
  target_line_indexes integer[] not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  total_count integer not null default 0,
  queued_count integer not null default 0,
  running_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.generated_images
  add column if not exists batch_id uuid references public.image_generation_batches(id) on delete set null,
  add column if not exists progress_step text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists inserted_markdown text,
  add column if not exists target_line_text_snapshot text;

update public.generated_images
set status = 'generating'
where status = 'running';

alter table public.generated_images
  drop constraint if exists generated_images_status_check;

alter table public.generated_images
  add constraint generated_images_status_check
  check (status in ('queued', 'planning', 'generating', 'uploading', 'completed', 'failed'));

create index if not exists image_generation_batches_session_id_idx on public.image_generation_batches (session_id);
create index if not exists image_generation_batches_status_idx on public.image_generation_batches (status);
create index if not exists image_generation_batches_created_at_idx on public.image_generation_batches (created_at desc);
create index if not exists generated_images_batch_id_idx on public.generated_images (batch_id);
