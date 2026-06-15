alter table public.generated_images
  add column if not exists parent_generation_id uuid references public.generated_images(id) on delete set null,
  add column if not exists revision_instruction text,
  add column if not exists generation_kind text not null default 'initial';

alter table public.generated_images
  drop constraint if exists generated_images_generation_kind_check;

alter table public.generated_images
  add constraint generated_images_generation_kind_check
  check (generation_kind in ('initial', 'revision'));

create index if not exists generated_images_parent_generation_id_idx
  on public.generated_images (parent_generation_id);

create index if not exists generated_images_generation_kind_idx
  on public.generated_images (generation_kind);
