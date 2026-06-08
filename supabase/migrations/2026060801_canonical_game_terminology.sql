-- Canonical hierarchy: Game -> Route -> Stop -> Place + Challenge.
-- Rename the legacy waypoint group storage without losing existing games.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'games'
      and column_name = 'waypoint_group'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'games'
      and column_name = 'stop_group'
  ) then
    alter table public.games rename column waypoint_group to stop_group;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'games'
      and column_name = 'waypoint_group'
  ) then
    update public.games
    set stop_group = coalesce(stop_group, waypoint_group)
    where stop_group is null;

    alter table public.games drop column waypoint_group;
  end if;
end
$$;

update public.games as game
set nodes = (
  select coalesce(
    jsonb_agg(
      case
        when node ? 'waypointGroup' and node ? 'stopGroup'
          then node - 'waypointGroup'
        when node ? 'waypointGroup'
          then jsonb_set(node - 'waypointGroup', '{stopGroup}', node -> 'waypointGroup', true)
        else node
      end
      order by position
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(game.nodes) with ordinality as item(node, position)
)
where jsonb_typeof(game.nodes) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(game.nodes) as item(node)
    where node ? 'waypointGroup'
  );

comment on column public.games.stop_group is
  'Legacy game-level grouping field retained under canonical Stop terminology. Stop nodes use stopGroup in games.nodes.';
