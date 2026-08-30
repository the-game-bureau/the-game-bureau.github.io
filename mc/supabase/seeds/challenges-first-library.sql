-- A FIRST LIBRARY, written to show the shape rather than to fill a table.
--
-- Every portable row is one that can be used in EVERY fandom game we ever
-- build, which is the whole argument for the scope column. Every place bound
-- row points at a waypoint we actually hold in Chicago, because a challenge
-- about a place we do not have is a row nobody can ever use.
--
-- THE DESIGN RULE RUNNING THROUGH THEM: prefer a challenge answered by LOOKING
-- over one answered by KNOWING. A stop that rewards recall rewards whoever
-- reaches for a phone fastest. A stop that asks you to count, find, or do
-- something rewards being there, which is the entire product.

insert into public.challenges (name, kind, scope, prompt, answer, tags) values

-- ---- PORTABLE, ABOUT THE OPPONENT ----------------------------------------
-- The leverage. One row each, used in every fandom game forever.
('Sing for the away side', 'freeform', 'portable',
 'Stand where people can see you and sing the {{away_team_nickname}} fight song. All the way through. Somebody must look over.',
 null, '{sports,opponent,loud,combative}'),

('Where they come from', 'question', 'portable',
 'No phones. Which city do the {{away_team_nickname}} actually play in?',
 '{{away_team_geo}}', '{sports,opponent,quiz}'),

('Know your enemy', 'freeform', 'portable',
 'Name three {{away_team_nickname}} players between you. One point each. A name somebody has clearly invented costs you a point.',
 null, '{sports,opponent,quiz}'),

('Colours of the visiting side', 'photo', 'portable',
 'Find something on this street in {{away_team_nickname}} colours and photograph it. It must not be anything you brought with you.',
 null, '{sports,opponent,photo,observation}'),

('Teach a local the chant', 'freeform', 'portable',
 'Teach one willing stranger a {{away_team_nickname}} chant. You have two minutes. They have to do it once, unaided.',
 null, '{sports,opponent,loud,strangers}'),

('Home side, home league', 'question', 'portable',
 'Between you, and without looking: which league do the {{home_team_nickname}} play in?',
 '{{league}}', '{sports,quiz}'),

('The away end', 'photo', 'portable',
 'One photograph of the whole team looking as though you have just conceded. No smiling.',
 null, '{sports,opponent,photo,silly}'),

-- ---- PORTABLE, MINIGAMES THAT WORK ANYWHERE ------------------------------
-- No props, no local knowledge, nothing to set up. These are the rows that
-- make a walk playable in a city nobody has written anything for yet.
('Twenty paces', 'minigame', 'portable',
 'Everybody guesses how many paces it is from here to the far side of {{waypoint}}. Then walk it and count aloud. Closest guess wins.',
 null, '{minigame,estimation,movement}'),

('The stranger''s verdict', 'minigame', 'portable',
 'Ask one stranger which of you looks most like a tourist. Their answer is final and cannot be appealed.',
 null, '{minigame,strangers,silly}'),

('Hold that pose', 'photo', 'portable',
 'Find the nearest statue, sign, gargoyle or fixed object with a posture. Everybody copies it. One photograph.',
 null, '{minigame,photo,observation,silly}'),

('One quiet minute', 'minigame', 'portable',
 'Sixty seconds. Nobody speaks, nobody looks at a phone. The first to break it buys the first round at the end.',
 null, '{minigame,quiet}'),

('Rock paper scissors, for the walk', 'minigame', 'portable',
 'Best of three. The loser navigates to the next stop and may not be corrected until you arrive.',
 null, '{minigame,movement}'),

-- ---- PORTABLE, ABOUT WHEREVER YOU ARE STANDING ---------------------------
-- Observational rather than factual, so they need no research per waypoint and
-- still reward being in the street rather than reading about it.
('The oldest date in sight', 'freeform', 'portable',
 'Find the oldest date you can see from {{waypoint}}, carved, cast, painted or printed. It has to be visible from where you stand.',
 null, '{observation,quiet}'),

('Read the plaque', 'freeform', 'portable',
 'Find a plaque, sign or inscription within sight. One of you reads it aloud in the voice of a newsreader.',
 null, '{observation,loud,silly}'),

('Count the doors', 'minigame', 'portable',
 'How many doors can you see from this spot? Agree a number before anybody counts. Then count.',
 null, '{minigame,observation,estimation}'),

('Something older than the {{league}}', 'freeform', 'portable',
 'Point at something you can see that is older than the {{league}}. You must be able to say roughly how old, and be right.',
 null, '{observation,sports,quiet}'),

-- ---- PLACE BOUND, CHICAGO ------------------------------------------------
-- Real waypoints we already hold. Every one of these travels nowhere, which is
-- what `place` means, and each is answerable by looking or by knowing one
-- well-known thing about the spot.
('Cloud Gate, by its real name', 'question', 'place',
 'Nobody calls this Cloud Gate. What does everybody in Chicago call it?',
 'The Bean', '{chicago,trivia,quiz,landmark}'),

('Buckingham Fountain, four states', 'question', 'place',
 'Four pairs of sea horses stand around this fountain, one for each state that touches a certain lake. Which lake?',
 'Lake Michigan', '{chicago,trivia,quiz,landmark}'),

('Ceres, and what she lacks', 'question', 'place',
 'The aluminium figure on the roof of the Board of Trade is Ceres, goddess of grain. The sculptor left one thing off her, believing nothing would ever be built tall enough to look down on her. What?',
 'Her face', '{chicago,trivia,quiz,architecture}'),

('The Billy Goat, 1945', 'question', 'place',
 'A tavern owner was turned away from a World Series game here in 1945 because of the animal he brought with him. What animal, and what did he do about it?',
 'A goat, and he cursed the Cubs', '{chicago,trivia,quiz,sports}'),

('Marina City, count the floors', 'minigame', 'place',
 'The car park spirals up the bottom of each tower before the flats begin. Standing here, agree how many floors of parking there are, then check.',
 '19', '{chicago,observation,architecture,estimation}')

;
