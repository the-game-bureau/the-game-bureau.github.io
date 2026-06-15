-- Normalize the repeatable game graph out of games.nodes / games.links.
--
-- Game-level metadata remains on public.games. The child tables below hold
-- directly editable node content and graph connections. The compatibility
-- view reconstructs nodes/links for the website while it uses an in-memory
-- graph.

create table public.game_nodes (
  game_id text not null references public.games(id) on update cascade on delete cascade,
  node_id text not null,
  node_type text not null,
  position_x double precision,
  position_y double precision,
  width double precision,
  height double precision,
  sort_order integer not null default 0,
  title text,
  body text,
  content_kind text,
  tags text[],
  primary_tag text,
  stop_group text,
  variable_name text,
  accepts_any_answer boolean not null default false,
  is_anytime boolean not null default false,
  anytime_pair_id text,
  answer_responses text[],
  link_url text,
  button_url text,
  tertiary_color text,
  quaternary_color text,
  minigame text,
  game_question text,
  game_answer text,
  legacy_how_to_play text,
  legacy_builder_notes text,
  legacy_players text,
  rotation integer not null default 0,
  primary key (game_id, node_id)
);

create index game_nodes_game_sort_order_idx
  on public.game_nodes (game_id, sort_order, node_id);

create table public.game_node_links (
  game_id text not null references public.games(id) on update cascade on delete cascade,
  link_id text not null,
  from_node_id text not null,
  to_node_id text not null,
  from_port text not null default 'out-right',
  sort_order integer not null default 0,
  primary key (game_id, link_id),
  foreign key (game_id, from_node_id)
    references public.game_nodes(game_id, node_id)
    on update cascade on delete cascade
    deferrable initially deferred,
  foreign key (game_id, to_node_id)
    references public.game_nodes(game_id, node_id)
    on update cascade on delete cascade
    deferrable initially deferred
);

create index game_node_links_game_sort_order_idx
  on public.game_node_links (game_id, sort_order, link_id);

comment on table public.game_nodes is
  'Directly editable nodes in a game graph. Game-level metadata stays on public.games.';
comment on column public.game_nodes.node_id is
  'Stable node identifier within the game, such as gm-01, st-01, gd-01, or pl-01.';
comment on column public.game_nodes.node_type is
  'Node role used by the builder/player, such as game, stop, bubble, reply, or button.';
comment on column public.game_nodes.content_kind is
  'Node-specific content format, such as text, image, video, audio, or photo.';
comment on column public.game_nodes.stop_group is
  'Rotation group for Stop nodes.';
comment on column public.game_nodes.variable_name is
  'Player reply variable populated by a Reply node.';
comment on column public.game_nodes.accepts_any_answer is
  'Whether a Reply node accepts any player response.';
comment on column public.game_nodes.legacy_how_to_play is
  'Retired node value preserved during normalization; not exposed by games_with_graph.';
comment on column public.game_nodes.legacy_builder_notes is
  'Retired internal node value preserved during normalization; not exposed by games_with_graph.';
comment on table public.game_node_links is
  'Directed connections between rows in public.game_nodes.';

create or replace function public.replace_game_graph(
  p_game_id text,
  p_nodes jsonb default '[]'::jsonb,
  p_links jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'Game % does not exist', p_game_id using errcode = '23503';
  end if;

  if jsonb_typeof(coalesce(p_nodes, '[]'::jsonb)) <> 'array' then
    raise exception 'p_nodes must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_links, '[]'::jsonb)) <> 'array' then
    raise exception 'p_links must be a JSON array' using errcode = '22023';
  end if;

  delete from public.game_node_links where game_id = p_game_id;

  insert into public.game_nodes (
    game_id,
    node_id,
    node_type,
    position_x,
    position_y,
    width,
    height,
    sort_order,
    title,
    body,
    content_kind,
    tags,
    primary_tag,
    stop_group,
    variable_name,
    accepts_any_answer,
    is_anytime,
    anytime_pair_id,
    answer_responses,
    link_url,
    button_url,
    tertiary_color,
    quaternary_color,
    minigame,
    game_question,
    game_answer,
    legacy_how_to_play,
    legacy_builder_notes,
    legacy_players,
    rotation
  )
  select
    p_game_id,
    node ->> 'id',
    coalesce(nullif(node ->> 'type', ''), 'stop'),
    nullif(node ->> 'x', '')::double precision,
    nullif(node ->> 'y', '')::double precision,
    nullif(node ->> 'width', '')::double precision,
    nullif(node ->> 'height', '')::double precision,
    coalesce(nullif(node ->> 'orderIndex', '')::integer, ordinal::integer * 100),
    nullif(node ->> 'title', ''),
    nullif(node ->> 'body', ''),
    nullif(node ->> 'kind', ''),
    case
      when jsonb_typeof(node -> 'tags') = 'array'
        then array(select jsonb_array_elements_text(node -> 'tags'))
      else null
    end,
    nullif(node ->> 'primaryTag', ''),
    nullif(coalesce(node ->> 'stopGroup', node ->> 'waypointGroup'), ''),
    nullif(node ->> 'varName', ''),
    lower(coalesce(node ->> 'acceptAny', 'false')) in ('true', 'yes', '1'),
    lower(coalesce(node ->> 'anytime', 'false')) in ('true', 'yes', '1'),
    nullif(node ->> 'anytimePairId', ''),
    case
      when jsonb_typeof(node -> 'answerResponses') = 'array'
        then array(select jsonb_array_elements_text(node -> 'answerResponses'))
      else null
    end,
    nullif(node ->> 'linkUrl', ''),
    nullif(node ->> 'buttonUrl', ''),
    nullif(node ->> 'tertiaryColor', ''),
    nullif(node ->> 'quaternaryColor', ''),
    nullif(node ->> 'minigame', ''),
    nullif(coalesce(node ->> 'gameQuestion', node ->> 'game_question'), ''),
    nullif(coalesce(node ->> 'gameAnswer', node ->> 'game_answer'), ''),
    nullif(node ->> 'howToPlay', ''),
    nullif(node ->> 'builderNotes', ''),
    nullif(node ->> 'players', ''),
    coalesce(nullif(node ->> 'rotation', '')::integer, 0)
  from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb))
    with ordinality as item(node, ordinal)
  where nullif(node ->> 'id', '') is not null
  on conflict (game_id, node_id) do update
  set
    node_type = excluded.node_type,
    position_x = excluded.position_x,
    position_y = excluded.position_y,
    width = excluded.width,
    height = excluded.height,
    sort_order = excluded.sort_order,
    title = excluded.title,
    body = excluded.body,
    content_kind = excluded.content_kind,
    tags = excluded.tags,
    primary_tag = excluded.primary_tag,
    stop_group = excluded.stop_group,
    variable_name = excluded.variable_name,
    accepts_any_answer = excluded.accepts_any_answer,
    is_anytime = excluded.is_anytime,
    anytime_pair_id = excluded.anytime_pair_id,
    answer_responses = excluded.answer_responses,
    link_url = excluded.link_url,
    button_url = excluded.button_url,
    tertiary_color = excluded.tertiary_color,
    quaternary_color = excluded.quaternary_color,
    minigame = excluded.minigame,
    game_question = excluded.game_question,
    game_answer = excluded.game_answer,
    legacy_how_to_play = coalesce(excluded.legacy_how_to_play, game_nodes.legacy_how_to_play),
    legacy_builder_notes = coalesce(excluded.legacy_builder_notes, game_nodes.legacy_builder_notes),
    legacy_players = coalesce(excluded.legacy_players, game_nodes.legacy_players),
    rotation = excluded.rotation;

  delete from public.game_nodes as existing
  where existing.game_id = p_game_id
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb)) as item(node)
      where node ->> 'id' = existing.node_id
    );

  insert into public.game_node_links (
    game_id,
    link_id,
    from_node_id,
    to_node_id,
    from_port,
    sort_order
  )
  select
    p_game_id,
    link ->> 'id',
    link ->> 'from',
    link ->> 'to',
    coalesce(nullif(link ->> 'fromPort', ''), 'out-right'),
    ordinal::integer
  from jsonb_array_elements(coalesce(p_links, '[]'::jsonb))
    with ordinality as item(link, ordinal)
  where nullif(link ->> 'id', '') is not null
    and nullif(link ->> 'from', '') is not null
    and nullif(link ->> 'to', '') is not null;
end;
$$;

comment on function public.replace_game_graph(text, jsonb, jsonb) is
  'Atomically replaces a game graph in normalized child tables.';

revoke all on function public.replace_game_graph(text, jsonb, jsonb) from public;

-- Preserve the only live game-node values that are populated while their
-- authoritative flat game columns are blank.
with source_game_nodes as (
  select game.id, item.node
  from public.games as game
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(game.nodes) = 'array' then game.nodes else '[]'::jsonb end
  ) as item(node)
  where item.node ->> 'type' = 'game'
)
update public.games as game
set
  city = coalesce(nullif(game.city, ''), nullif(game_node.node ->> 'city', '')),
  guide_background = coalesce(
    nullif(game.guide_background, ''),
    nullif(game_node.node ->> 'guideBackground', '')
  )
from source_game_nodes as game_node
where game_node.id = game.id
and ((
  nullif(game.city, '') is null
  and nullif(game_node.node ->> 'city', '') is not null
) or (
  nullif(game.guide_background, '') is null
  and nullif(game_node.node ->> 'guideBackground', '') is not null
));

do $$
declare
  game record;
begin
  for game in
    select id, nodes, links
    from public.games
  loop
    perform public.replace_game_graph(
      game.id,
      case when jsonb_typeof(game.nodes) = 'array' then game.nodes else '[]'::jsonb end,
      case when jsonb_typeof(game.links) = 'array' then game.links else '[]'::jsonb end
    );
  end loop;
end
$$;

do $$
declare
  expected_nodes bigint;
  expected_links bigint;
  actual_nodes bigint;
  actual_links bigint;
begin
  select coalesce(sum(jsonb_array_length(nodes)), 0)
    into expected_nodes
  from public.games
  where jsonb_typeof(nodes) = 'array';

  select coalesce(sum(jsonb_array_length(links)), 0)
    into expected_links
  from public.games
  where jsonb_typeof(links) = 'array';

  select count(*) into actual_nodes from public.game_nodes;
  select count(*) into actual_links from public.game_node_links;

  if actual_nodes <> expected_nodes or actual_links <> expected_links then
    raise exception
      'Game graph backfill count mismatch: nodes %/% links %/%',
      actual_nodes, expected_nodes, actual_links, expected_links;
  end if;
end
$$;

alter table public.games
  drop column nodes,
  drop column links;

create view public.games_with_graph as
select
  game.*,
  coalesce(
    (
      select jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', node.node_id,
            'type', node.node_type,
            'x', node.position_x,
            'y', node.position_y,
            'width', node.width,
            'height', node.height,
            'orderIndex', node.sort_order,
            'rotation', node.rotation,
            'title', case when node.node_type = 'game' then game.name else node.title end,
            'body', case when node.node_type = 'game' then game.body else node.body end,
            'kind', case when node.node_type = 'game' then game.kind else node.content_kind end,
            'tags', case when node.node_type = 'game' then to_jsonb(game.tags) else to_jsonb(node.tags) end,
            'primaryTag', case when node.node_type = 'game' then game.primary_tag else node.primary_tag end,
            'stopGroup', case when node.node_type = 'game' then game.stop_group else node.stop_group end,
            'varName', case when node.node_type = 'game' then game.var_name else node.variable_name end,
            'acceptAny', case when node.node_type = 'game' then game.accept_any else node.accepts_any_answer end,
            'anytime', case when node.node_type = 'game' then game.anytime else node.is_anytime end,
            'anytimePairId', case when node.node_type = 'game' then game.anytime_pair_id else node.anytime_pair_id end,
            'answerResponses', node.answer_responses,
            'linkUrl', case when node.node_type = 'game' then game.link_url else node.link_url end,
            'buttonUrl', case when node.node_type = 'game' then game.button_url else node.button_url end,
            'minigame', node.minigame,
            'gameQuestion', node.game_question,
            'gameAnswer', node.game_answer,
            'tagline', case when node.node_type = 'game' then game.tagline end,
            'city', case when node.node_type = 'game' then game.city end,
            'featured', case when node.node_type = 'game' then game.featured end,
            'locationBased', case when node.node_type = 'game' then game.location_based end,
            'fandomGame', case when node.node_type = 'game' then game.fandom_game end
          )
          ||
          jsonb_build_object(
            'startingLocation', case when node.node_type = 'game' then game.starting_location end,
            'startingLocationName', case when node.node_type = 'game' then game.starting_location_name end,
            'startingLocationAddress', case when node.node_type = 'game' then game.starting_location_address end,
            'startingLocationPlusCode', case when node.node_type = 'game' then game.starting_location_plus_code end,
            'startingLocationLat', case when node.node_type = 'game' then game.starting_location_lat end,
            'startingLocationLon', case when node.node_type = 'game' then game.starting_location_lon end,
            'guideName', case when node.node_type = 'game' then game.guide_name end,
            'guideBio', case when node.node_type = 'game' then game.guide_bio end,
            'guideBackground', case when node.node_type = 'game' then game.guide_background end,
            'guideImageUrl', case when node.node_type = 'game' then game.guide_image_url end,
            'logoUrl', case when node.node_type = 'game' then game.logo_url end,
            'price', case when node.node_type = 'game' then game.price end,
            'checkoutUrl', case when node.node_type = 'game' then game.checkout_url end,
            'tertiaryColor', case when node.node_type = 'game' then game.tertiary_color else node.tertiary_color end,
            'quaternaryColor', case when node.node_type = 'game' then game.quaternary_color else node.quaternary_color end,
            'defaultEmoji', case when node.node_type = 'game' then game.default_emoji end,
            'categoryIcon', case when node.node_type = 'game' then game.category_icon end,
            'teams', case when node.node_type = 'game' then game.teams end,
            'team01', case when node.node_type = 'game' then game.team01 end,
            'team02', case when node.node_type = 'game' then game.team02 end,
            'team03', case when node.node_type = 'game' then game.team03 end,
            'team04', case when node.node_type = 'game' then game.team04 end,
            'team05', case when node.node_type = 'game' then game.team05 end,
            'team06', case when node.node_type = 'game' then game.team06 end,
            'team07', case when node.node_type = 'game' then game.team07 end,
            'team08', case when node.node_type = 'game' then game.team08 end,
            'engine', case when node.node_type = 'game' then game.engine end,
            'gameDate', case when node.node_type = 'game' then game.game_date end,
            'startTime', case when node.node_type = 'game' then game.start_time end,
            'endTime', case when node.node_type = 'game' then game.end_time end,
            'homeTeamCity', case when node.node_type = 'game' then game.home_team_city end,
            'homeTeamMascot', case when node.node_type = 'game' then game.home_team_mascot end,
            'awayTeamCity', case when node.node_type = 'game' then game.away_team_city end,
            'awayTeamMascot', case when node.node_type = 'game' then game.away_team_mascot end,
            'venueName', case when node.node_type = 'game' then game.venue_name end,
            'venueCity', case when node.node_type = 'game' then game.venue_city end
          )
        )
        order by node.sort_order, node.node_id
      )
      from public.game_nodes as node
      where node.game_id = game.id
    ),
    '[]'::jsonb
  ) as nodes,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', link.link_id,
          'from', link.from_node_id,
          'to', link.to_node_id,
          'fromPort', link.from_port
        )
        order by link.sort_order, link.link_id
      )
      from public.game_node_links as link
      where link.game_id = game.id
    ),
    '[]'::jsonb
  ) as links
from public.games as game;

comment on view public.games_with_graph is
  'Read compatibility view that reconstructs nodes and links from normalized game graph tables.';

grant select on public.games_with_graph to anon, authenticated;
grant select, insert, update, delete on public.game_nodes to authenticated;
grant select, insert, update, delete on public.game_node_links to authenticated;
grant execute on function public.replace_game_graph(text, jsonb, jsonb) to anon, authenticated;
