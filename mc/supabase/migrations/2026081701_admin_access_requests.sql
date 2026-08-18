-- Mission Control JOIN: a request-access queue, approved by a human at /mc/.
--
-- Until now the only way onto the admin list was a row typed straight into
-- public.admin_users in the SQL editor, which meant somebody with dashboard
-- access had to be in the room. This adds the asking half, and nothing else:
-- a request is a request, and an approval is still a person pressing a button.
--
-- THE SHAPE IS THE ONE EVERY OTHER UNATTENDED WRITE IN THIS PROJECT USES.
-- The visitor holds only the public publishable key, so they cannot be given
-- INSERT on a table; they call a SECURITY DEFINER function that can only do the
-- one safe thing. Same constraint and same answer as tgb_pull_book_candidates,
-- tgb_pull_soundtrack_songs and tgb_pull_socials_candidates.
--
-- WHAT THIS DOES NOT DO: it does not create the Supabase Auth user. The visitor
-- does that themselves by signing up, because creating a user needs the service
-- role key and this project does not have one (see the Environment variables
-- section of CLAUDE.md). Approval therefore only ever adds an email to
-- public.admin_users, which is exactly the row a human would have typed.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.

create extension if not exists pgcrypto;

create table if not exists public.admin_access_requests (
  id           uuid primary key default gen_random_uuid(),
  email        text        not null,
  name         text        not null default '',
  note         text        not null default '',
  -- pending is the ONLY status this table is ever written with from outside.
  -- approved / denied are set by tgb_decide_admin_access, which checks the
  -- caller is already an admin first.
  status       text        not null default 'pending'
                 check (status in ('pending', 'approved', 'denied')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   text,
  constraint admin_access_requests_email_shape
    check (email = lower(email) and email like '_%@_%._%')
);

comment on table public.admin_access_requests is
  'Requests to join Mission Control. Filed by tgb_request_admin_access, decided at /mc/ by an existing admin. Not publicly readable.';
comment on column public.admin_access_requests.decided_by is
  'Email of the admin who approved or denied it. Set by tgb_decide_admin_access, never by a client.';

-- ONE OPEN REQUEST PER EMAIL, and only while it is open. A partial index rather
-- than a plain unique one: a denied request must not lock the address out
-- forever, since the usual reason for a second ask is that the first was denied
-- by mistake or the person's role changed.
create unique index if not exists admin_access_requests_pending_email_idx
  on public.admin_access_requests (email)
  where status = 'pending';

create index if not exists admin_access_requests_status_created_idx
  on public.admin_access_requests (status, created_at desc);

-- ── RLS: admins read and nothing else touches it ───────────────────────────
-- No anon policy at all. A pending list is a list of people who want in, which
-- is not public information, and the visitor never needs to read back what they
-- just filed. Writes go through the two functions below.
alter table public.admin_access_requests enable row level security;

drop policy if exists "Admins read access requests" on public.admin_access_requests;
create policy "Admins read access requests"
  on public.admin_access_requests for select to authenticated
  using (public.is_photo_admin());

-- ── Filing a request ───────────────────────────────────────────────────────
-- Insert-only, always status = 'pending'. DON'T ADD A status PARAMETER: that
-- constant is what makes this safe to expose to anon, exactly as with the pull
-- RPCs. Same reasoning for decided_by / decided_at, which it never writes.
create or replace function public.tgb_request_admin_access(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(payload->>'email', '')));
  v_name  text := btrim(coalesce(payload->>'name', ''));
  v_note  text := btrim(coalesce(payload->>'note', ''));
begin
  if v_email = '' or v_email not like '_%@_%._%' then
    raise exception 'A valid email address is required.';
  end if;

  -- Trimmed rather than rejected. A request refused because somebody pasted a
  -- paragraph is a request nobody sees, and the note is a courtesy field.
  v_name := left(v_name, 120);
  v_note := left(v_note, 600);

  -- THE SAME ANSWER EVERY TIME, whatever is already in the tables. Returning
  -- "you are already an admin" or "you already asked" to an unauthenticated
  -- caller turns this into an oracle for which addresses are on the admin list.
  -- The conflict below quietly does nothing in those cases.
  insert into public.admin_access_requests (email, name, note)
  values (v_email, v_name, v_note)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.tgb_request_admin_access(jsonb) from public;
grant execute on function public.tgb_request_admin_access(jsonb) to anon, authenticated;

-- ── Deciding a request ─────────────────────────────────────────────────────
-- SECURITY DEFINER because approving writes public.admin_users, which no client
-- may write directly. The FIRST thing it does is check the caller is already an
-- admin -- without that line this function hands the admin list to anybody.
create or replace function public.tgb_decide_admin_access(request_id uuid, approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := lower(coalesce(auth.jwt()->>'email', ''));
  v_email text;
begin
  if not public.is_photo_admin() then
    raise exception 'Only an admin can decide an access request.';
  end if;

  -- Locked, so two admins pressing Approve at once cannot both act on it.
  select email into v_email
  from public.admin_access_requests
  where id = request_id and status = 'pending'
  for update;

  if v_email is null then
    raise exception 'That request is not pending.';
  end if;

  if approve then
    insert into public.admin_users (email)
    values (v_email)
    on conflict do nothing;
  end if;

  update public.admin_access_requests
  set status     = case when approve then 'approved' else 'denied' end,
      decided_at = now(),
      decided_by = v_actor
  where id = request_id;

  return jsonb_build_object('ok', true, 'email', v_email,
                            'status', case when approve then 'approved' else 'denied' end);
end;
$$;

revoke all on function public.tgb_decide_admin_access(uuid, boolean) from public;
-- authenticated ONLY, and it re-checks is_photo_admin() inside. Two gates,
-- because the grant alone would let any signed-in Supabase user call it.
grant execute on function public.tgb_decide_admin_access(uuid, boolean) to authenticated;

-- REMOVING an admin is deliberately not here. It is a delete from
-- public.admin_users in the SQL editor, the same as it has always been: an
-- approve button that can also be a revoke button is one misclick away from
-- locking the last admin out of Mission Control.
