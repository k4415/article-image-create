alter table public.editor_sessions
  add column if not exists title text not null default '無題プロジェクト',
  add column if not exists editor_state jsonb not null default '{}'::jsonb,
  add column if not exists last_saved_at timestamptz;

update public.editor_sessions
set
  title = coalesce(nullif(trim(title), ''), '無題プロジェクト'),
  last_saved_at = coalesce(last_saved_at, updated_at, now())
where title is null
  or trim(title) = ''
  or last_saved_at is null;

create index if not exists editor_sessions_updated_at_idx
  on public.editor_sessions (updated_at desc);

create index if not exists editor_sessions_last_saved_at_idx
  on public.editor_sessions (last_saved_at desc);
