-- Ensure gift_shop_items has all columns required by the admin and public UIs.
-- Safe to re-run: every statement uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Run in the Supabase SQL editor.

alter table public.gift_shop_items
  add column if not exists game_id text references public.games(id)
    on delete cascade on update cascade,
  add column if not exists kind text not null default 'amazon_link',
  add column if not exists title text,
  add column if not exists url text,
  add column if not exists image_url text,
  add column if not exists price_display text,
  add column if not exists description text,
  add column if not exists position integer not null default 0,
  add column if not exists archived boolean not null default false,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists gift_shop_items_game_id_idx
  on public.gift_shop_items (game_id);
