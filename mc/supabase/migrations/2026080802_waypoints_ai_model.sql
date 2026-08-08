-- Which AI wrote this waypoint, in its own words.
--
-- Every stop in this table now arrives one of four ways: typed by a human, an
-- ESPN-style feed import, one of the pasted AI prompts on mc/data/waypoints.html
-- run through whatever chat model happened to be open, or the NFL Tour Builder
-- routine. Until now the row recorded none of that, so a bad address was a dead
-- end - you could see the claim was wrong and not what had made it.
--
-- That matters more here than it looks. These prompts are run against DIFFERENT
-- models on purpose (the manual paste is explicitly "ChatGPT, Gemini, whatever
-- is open"), and they do not fail the same way: one invents plausible street
-- numbers, another quietly returns eight stops when asked for ten, another is
-- fine on landmarks and hopeless on bars. Recording the make and model turns
-- "some of these addresses are wrong" into a question you can actually answer.
--
-- FREE TEXT, and deliberately not an enum or a lookup table. The value is the
-- model's own answer to "what are you", collected by the prompt - "Anthropic
-- Claude Opus 5", "OpenAI GPT-5 Thinking", "Google Gemini 3 Pro". A closed set
-- would be stale within a month, and a model that names itself in a way we did
-- not anticipate should still be recorded rather than rejected or coerced.
--
-- NULL IS THE NORMAL STATE for everything already in the table: 244 rows exist
-- before this column does, seeded and hand-entered and imported over months, and
-- there is no honest way to attribute them now. Null means "not recorded", never
-- "written by a human" - do not backfill it with a guess.

alter table public.waypoints add column if not exists ai_model text;

comment on column public.waypoints.ai_model is
  'The AI that produced this row, as the model named itself: make and model, e.g. "Anthropic Claude Opus 5" or "OpenAI GPT-5". Free text, collected by the import prompts. Null means not recorded - which includes every row written by a human, and everything predating 2026-08-08.';

-- Long enough for "Anthropic Claude Opus 5 (via the NFL Tour Builder routine)",
-- short enough that a paragraph of prose is obviously not what belongs here.
alter table public.waypoints drop constraint if exists waypoints_ai_model_len;
alter table public.waypoints add constraint waypoints_ai_model_len
  check (ai_model is null or length(ai_model) <= 120)
  not valid;
