update public.media_assets
set parent_asset_id = null,
    updated_at = now()
where media_type = 'video_frame'
  and parent_asset_id in (
    select id from public.media_assets where media_type = 'video'
  );

delete from public.media_assets
where media_type = 'video';

alter table public.ingest_jobs
  add column if not exists processed_urls integer not null default 0,
  add column if not exists processed_candidates integer not null default 0,
  add column if not exists current_article_url text,
  add column if not exists current_media_url text,
  add column if not exists current_step text,
  add column if not exists last_log_at timestamptz;

create table if not exists public.asset_sources (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  source_article_url text not null,
  source_media_url text not null,
  source_order integer not null default 0,
  found_in text,
  alt_text text,
  created_at timestamptz not null default now(),
  unique (asset_id, source_article_url, source_media_url)
);

insert into public.asset_sources (
  asset_id,
  source_article_url,
  source_media_url,
  source_order,
  found_in,
  alt_text
)
select
  id,
  source_article_url,
  source_media_url,
  source_order,
  found_in,
  alt_text
from public.media_assets
on conflict (asset_id, source_article_url, source_media_url) do nothing;

create index if not exists asset_sources_asset_id_idx on public.asset_sources (asset_id);
create index if not exists asset_sources_source_article_url_idx on public.asset_sources (source_article_url);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_assets_file_hash_unique'
      and conrelid = 'public.media_assets'::regclass
  ) then
    alter table public.media_assets
      add constraint media_assets_file_hash_unique unique (file_hash);
  end if;
end $$;

alter table public.media_assets
  drop constraint if exists media_assets_media_type_check;

alter table public.media_assets
  add constraint media_assets_media_type_check
  check (media_type in ('image', 'video_frame'));

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]
where id = 'lp-assets';
