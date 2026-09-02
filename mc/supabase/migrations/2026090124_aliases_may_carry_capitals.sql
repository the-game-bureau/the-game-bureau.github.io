-- audience_aliases may carry capitals.
--
-- `audiences_aliases_lower` refused any value with one, so `Roll Tide` came
-- back as a refusal about a CHARACTER rather than a saved alias -- and the room
-- lowercased on the way in, which silently rewrote what somebody typed.
--
-- WHY IT WAS THERE, and what replaces it. Aliases are MATCHED, never printed,
-- so storing them lowercase meant a lookup needed no function around the
-- column. **That guarantee is gone**: anything matching an alias must now
-- lowercase BOTH sides.
--
--     where lower(x) = any(select lower(a) from unnest(audience_aliases) a)
--
-- NOTHING MATCHES ON THEM TODAY, checked rather than assumed: no function names
-- the column, and the only view that does is `destinations`, which passes it
-- straight through as `aliases`. So this costs nothing now and is a rule the
-- next matcher has to keep.
--
-- `audiences_aliases_not_blank` STAYS. An empty string in the array is a value
-- no lookup can ever match and no reader can interpret, which is a different
-- thing from a capital letter.

alter table public.audiences drop constraint if exists audiences_aliases_lower;

comment on column public.audiences.audience_aliases is
  'Other things people call this audience. MATCHED, NEVER PRINTED. Case is no '
  'longer normalised on write (2026090124), so a matcher must lowercase both '
  'sides. No empty members.';

-- Verify. Expect the lower check gone, not_blank still there, and a mixed-case
-- alias accepted -- which is the only thing that proves the constraint is off.
select conname from pg_constraint
 where conrelid = 'public.audiences'::regclass and conname like 'audiences_aliases%'
 order by conname;

do $$
begin
  update public.audiences
     set audience_aliases = array_append(audience_aliases, 'RollTideProbe')
   where id = 'alabama-crimson-tide';
  raise notice 'mixed case accepted';
  update public.audiences
     set audience_aliases = array_remove(audience_aliases, 'RollTideProbe')
   where id = 'alabama-crimson-tide';
end $$;
