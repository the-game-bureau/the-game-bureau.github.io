-- bureau-notes — TGB-wide notes & to-dos for Mission Control.
--
-- Two tables: bureau_todos (with `done`) and bureau_notes. Both have an
-- optional `url` + `url_label` so an item can link out to a Drive doc,
-- Notion page, Stripe dashboard URL, etc.
--
-- RLS reuses the existing public.is_photo_admin() helper from
-- photo-submissions.sql (case-insensitive email match against
-- public.admin_users, runs `security definer` so it bypasses the
-- admin_users self-read RLS).
--
-- Run in the Supabase SQL editor. Safe to re-run. Requires that
-- photo-submissions.sql has already been applied so is_photo_admin()
-- and admin_users exist.

-- ── bureau_todos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bureau_todos (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  body         text        NOT NULL,
  done         boolean     NOT NULL DEFAULT false,
  url          text,
  url_label    text,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bureau_todos_open_idx
  ON public.bureau_todos (done, sort_order, created_at DESC);

ALTER TABLE public.bureau_todos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bureau_todos TO authenticated;

DROP POLICY IF EXISTS "Admins read bureau_todos"   ON public.bureau_todos;
DROP POLICY IF EXISTS "Admins write bureau_todos"  ON public.bureau_todos;
DROP POLICY IF EXISTS "Admins insert bureau_todos" ON public.bureau_todos;
DROP POLICY IF EXISTS "Admins update bureau_todos" ON public.bureau_todos;
DROP POLICY IF EXISTS "Admins delete bureau_todos" ON public.bureau_todos;

CREATE POLICY "Admins read bureau_todos"
  ON public.bureau_todos FOR SELECT
  TO authenticated
  USING (public.is_photo_admin());

CREATE POLICY "Admins insert bureau_todos"
  ON public.bureau_todos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_photo_admin());

CREATE POLICY "Admins update bureau_todos"
  ON public.bureau_todos FOR UPDATE
  TO authenticated
  USING (public.is_photo_admin())
  WITH CHECK (public.is_photo_admin());

CREATE POLICY "Admins delete bureau_todos"
  ON public.bureau_todos FOR DELETE
  TO authenticated
  USING (public.is_photo_admin());

-- ── bureau_notes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bureau_notes (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  body         text        NOT NULL,
  url          text,
  url_label    text,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bureau_notes_sort_idx
  ON public.bureau_notes (sort_order, created_at DESC);

ALTER TABLE public.bureau_notes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bureau_notes TO authenticated;

DROP POLICY IF EXISTS "Admins read bureau_notes"   ON public.bureau_notes;
DROP POLICY IF EXISTS "Admins write bureau_notes"  ON public.bureau_notes;
DROP POLICY IF EXISTS "Admins insert bureau_notes" ON public.bureau_notes;
DROP POLICY IF EXISTS "Admins update bureau_notes" ON public.bureau_notes;
DROP POLICY IF EXISTS "Admins delete bureau_notes" ON public.bureau_notes;

CREATE POLICY "Admins read bureau_notes"
  ON public.bureau_notes FOR SELECT
  TO authenticated
  USING (public.is_photo_admin());

CREATE POLICY "Admins insert bureau_notes"
  ON public.bureau_notes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_photo_admin());

CREATE POLICY "Admins update bureau_notes"
  ON public.bureau_notes FOR UPDATE
  TO authenticated
  USING (public.is_photo_admin())
  WITH CHECK (public.is_photo_admin());

CREATE POLICY "Admins delete bureau_notes"
  ON public.bureau_notes FOR DELETE
  TO authenticated
  USING (public.is_photo_admin());

-- ── seed: first to-do (idempotent) ───────────────────────────────────────────
INSERT INTO public.bureau_todos (body)
SELECT 'Add Gift Cards to Gift Shop'
WHERE NOT EXISTS (
  SELECT 1 FROM public.bureau_todos WHERE body = 'Add Gift Cards to Gift Shop'
);
