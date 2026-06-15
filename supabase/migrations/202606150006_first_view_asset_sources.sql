alter table public.asset_sources
  add column if not exists is_first_view boolean not null default false;

update public.asset_sources
set is_first_view = false;

with ranked_sources as (
  select
    id,
    row_number() over (
      partition by source_article_url
      order by source_order asc, created_at asc, id asc
    ) as row_number
  from public.asset_sources
)
update public.asset_sources
set is_first_view = ranked_sources.row_number = 1
from ranked_sources
where asset_sources.id = ranked_sources.id;

update public.asset_annotations
set
  image_category = 'その他',
  updated_at = now()
where image_category = 'ファーストビュー';

create unique index if not exists asset_sources_one_first_view_per_article_idx
  on public.asset_sources (source_article_url)
  where is_first_view;
