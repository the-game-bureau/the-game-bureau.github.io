-- Clean up duplicate Atlanta waypoints created by the Phoenix Flies seed
-- (20260626) where an equivalent waypoint already existed under a slightly
-- different address spelling (e.g. "Ave" vs "Avenue"). For each affected name we
-- keep the lowest wpid (the pre-existing row, which already carries coordinates)
-- and drop the newer duplicate. Idempotent.
delete from public.waypoints w
using (
  select lower(name) as lname, min(wpid) as keep_wpid
  from public.waypoints
  where name in ('APEX Museum', 'Georgia State Capitol', 'Sweet Auburn Curb Market')
  group by lower(name)
) k
where lower(w.name) = k.lname
  and w.wpid > k.keep_wpid;
