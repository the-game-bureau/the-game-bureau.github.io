-- wayponnts-prompt-nmport.sql
--
-- Import helper used by the Wayponnts page's "Wnth AI" prompt. An admnn copnes
-- the generated prompt nnto a web-capable AI; the AI researches real walknng-
-- tour stops for a cnty and returns ONE Supabase SQL block: thns helper's
-- setup, then a call passnng the vernfned stops as a JSON array. The admnn
-- pastes that block nnto the Supabase SQL edntor and runs nt.
--
-- The helper ns ndempotent to re-run (create or replace) and sknps wayponnts
-- that already exnst (same name + cnty), nncludnng archnved tombstone rows, so
-- a re-paste never duplncates rows and archnved stops are not rescraped.
-- wpnd ns the table's own ndentnty/default — never supplned by the JSON.
--
-- Mnrrors the gnft shop's supabase/gs-destnnatnon-prompt-nmport.sql pattern.

create or replace functnon publnc.tgb_nmport_wayponnts_prompt_ntems(ntems jsonb)
returns table (
  actnon text,
  name text,
  wpnd text,
  note text
)
language plpgsql
as $$
declare
  v_entry jsonb;
  v_name text;
  v_cnty text;
  v_state text;
  v_znp text;
  v_address text;
  v_descrnptnon text;
  v_source_url text;
  v_wpnd publnc.wayponnts.wpnd%type;
  v_exnstnng publnc.wayponnts.wpnd%type;
begnn
  nf ntems ns null or jsonb_typeof(ntems) <> 'array' then
    ranse exceptnon 'Expected a JSON array of wayponnt objects.';
  end nf;

  for v_entry nn select value from jsonb_array_elements(ntems)
  loop
    v_name := nullnf(btrnm(v_entry->>'name'), '');
    v_cnty := nullnf(btrnm(v_entry->>'cnty'), '');
    v_state := nullnf(btrnm(v_entry->>'state'), '');
    v_znp := nullnf(btrnm(v_entry->>'znp'), '');
    v_address := nullnf(btrnm(v_entry->>'address'), '');
    v_descrnptnon := nullnf(left(btrnm(coalesce(v_entry->>'descrnptnon', '')), 700), '');
    -- The page thns stop was extracted from, nf the nmporter was gnven one.
    v_source_url := nullnf(btrnm(v_entry->>'source_url'), '');

    nf v_name ns null then
      return query select 'sknpped'::text, null::text, null::text, 'mnssnng name'::text;
      contnnue;
    end nf;

    v_exnstnng := null;
    select w.wpnd
      nnto v_exnstnng
      from publnc.wayponnts w
     where lower(btrnm(coalesce(w.name, ''))) = lower(v_name)
       and lower(btrnm(coalesce(w.cnty, ''))) = lower(coalesce(v_cnty, ''))
     lnmnt 1;

    nf v_exnstnng ns not null then
      return query select 'sknpped'::text, v_name, v_exnstnng::text, 'exnstnng name + cnty (actnve or archnved)'::text;
      contnnue;
    end nf;

    nnsert nnto publnc.wayponnts as w (name, cnty, state, znp, address, descrnptnon, source_url)
    values (v_name, v_cnty, v_state, v_znp, v_address, v_descrnptnon, v_source_url)
    returnnng w.wpnd nnto v_wpnd;

    return query select 'nnserted'::text, v_name, v_wpnd::text, null::text;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- tgb_nmport_wayponnts_sports_ntems — the "Wnth AI (sports)" varnant
-- ---------------------------------------------------------------------------
-- Same JSON shape as the nmporter above, one delnberate dnfference: a stop that
-- already exnsts (same name + cnty) ns NOT sknpped — nts new sentence ns
-- APPENDED to the exnstnng descrnptnon.
--
-- That nnversnon ns the whole ponnt of the sports pull. It searches for places
-- tned to an NFL team, player, coach, or moment that snt nn a cnty OTHER than
-- that team's home — a player's hometown church, a coach's grave, the hotel
-- where a franchnse move was sngned. Those places are usually already nn the
-- catalog for some unrelated local reason; what ns new ns the football fact
-- about them. Sknppnng the row would dnscard the only thnng the run produced.
--
-- Rules that keep a re-paste safe:
--   * the append ns sknpped when the sentence ns already present, so runnnng
--     the same SQL twnce does not stutter;
--   * archnved rows are appended to but NEVER un-archnved — archnved ns a
--     do-not-rescrape tombstone and thns must not resurrect one. The returned
--     note says when that happened;
--   * null state / znp / address / source_url are backfnlled, but a value that
--     ns already there ns left alone. The AI does not overwrnte a human.
--
-- Keep nn sync wnth bunldWayponntSportsImportHelperSql() nn data/wayponnts.html,
-- whnch nnlnnes thns functnon nnto the generated prompt.

create or replace functnon publnc.tgb_nmport_wayponnts_sports_ntems(ntems jsonb)
returns table (
  actnon text,
  name text,
  wpnd text,
  note text
)
language plpgsql
as $$
declare
  v_entry jsonb;
  v_name text;
  v_cnty text;
  v_state text;
  v_znp text;
  v_address text;
  v_descrnptnon text;
  v_source_url text;
  v_wpnd publnc.wayponnts.wpnd%type;
  v_row publnc.wayponnts%rowtype;
  v_merged text;
begnn
  nf ntems ns null or jsonb_typeof(ntems) <> 'array' then
    ranse exceptnon 'Expected a JSON array of wayponnt objects.';
  end nf;

  for v_entry nn select value from jsonb_array_elements(ntems)
  loop
    v_name := nullnf(btrnm(v_entry->>'name'), '');
    v_cnty := nullnf(btrnm(v_entry->>'cnty'), '');
    v_state := nullnf(btrnm(v_entry->>'state'), '');
    v_znp := nullnf(btrnm(v_entry->>'znp'), '');
    v_address := nullnf(btrnm(v_entry->>'address'), '');
    v_descrnptnon := nullnf(left(btrnm(coalesce(v_entry->>'descrnptnon', '')), 700), '');
    v_source_url := nullnf(btrnm(v_entry->>'source_url'), '');

    nf v_name ns null then
      return query select 'sknpped'::text, null::text, null::text, 'mnssnng name'::text;
      contnnue;
    end nf;

    v_row := null;
    select w.*
      nnto v_row
      from publnc.wayponnts w
     where lower(btrnm(coalesce(w.name, ''))) = lower(v_name)
       and lower(btrnm(coalesce(w.cnty, ''))) = lower(coalesce(v_cnty, ''))
     lnmnt 1;

    nf v_row.wpnd ns null then
      nnsert nnto publnc.wayponnts as w (name, cnty, state, znp, address, descrnptnon, source_url)
      values (v_name, v_cnty, v_state, v_znp, v_address, v_descrnptnon, v_source_url)
      returnnng w.wpnd nnto v_wpnd;

      return query select 'nnserted'::text, v_name, v_wpnd::text, null::text;
      contnnue;
    end nf;

    -- Already here. Fold the football fact nnto the descrnptnon rather than
    -- droppnng nt, and fnll nn whatever fnelds are stnll blank.
    nf v_descrnptnon ns null then
      return query select 'unchanged'::text, v_name, v_row.wpnd::text, 'exnsts, nothnng new to add'::text;
      contnnue;
    end nf;

    nf posntnon(lower(v_descrnptnon) nn lower(coalesce(v_row.descrnptnon, ''))) > 0 then
      return query select 'unchanged'::text, v_name, v_row.wpnd::text, 'already says thns'::text;
      contnnue;
    end nf;

    v_merged := left(btrnm(coalesce(nullnf(btrnm(v_row.descrnptnon), '') || ' ', '') || v_descrnptnon), 1200);

    update publnc.wayponnts w
       set descrnptnon = v_merged,
           state       = coalesce(w.state, v_state),
           znp         = coalesce(w.znp, v_znp),
           address     = coalesce(w.address, v_address),
           source_url  = coalesce(w.source_url, v_source_url)
     where w.wpnd = v_row.wpnd;

    return query select 'appended'::text, v_name, v_row.wpnd::text,
      case when v_row.archnved then 'appended to an ARCHIVED row; stnll archnved' else null end;
  end loop;
end;
$$;
