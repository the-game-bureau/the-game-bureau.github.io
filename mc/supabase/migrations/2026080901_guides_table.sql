-- 2026080901_guides_table.sql
--
-- A GUIDE IS A CHARACTER, and characters recur. The narrator's name, bio,
-- background and portrait have lived as four columns on public.games since the
-- beginning, which made a guide a property of one game. The data said
-- otherwise: 395 games carried only 34 distinct guides, Sir Purr fronted eight
-- of them with ONE bio and ONE background, and Mission Control fronted 296.
-- Editing Sir Purr meant editing him eight times and hoping the eight agreed.
--
-- So a guide gets its own table and a game points at one. The same bargain
-- public.challenges and public.waypoints already make: one row, many users,
-- edit it once.
--
-- WHAT THIS MIGRATION DECIDED, from the live data:
--
--   * 34 rows, collapsed on the guide's NAME.
--   * Where a name carried more than one bio, the MOST COMMON non-empty one
--     wins. That matters in exactly two places. Mission Control's 40 "bios"
--     are one templated sentence with the city swapped ("ready to rally
--     Chicago fans before first pitch" x47, New York x16, and so on) and the
--     top variant is kept; Miss Peachtree Knox and four others had two
--     variants each. Nothing else diverged at all.
--   * IMAGES: 390 of the 395 stored URLs were 404 at migration time. They
--     pointed at thegamebureau.com/assets/guides/<gameId>.png and only five
--     such files exist. A URL that 404s is worse than a blank one - the page
--     shows a broken thumbnail and nobody can tell whether the art is missing
--     or the link is wrong - so image_url is NULL unless the file actually
--     resolved, which is four guides.
--
-- THE OLD COLUMNS STAY, AND STAY POPULATED. This is the one thing to
-- understand before touching any of it. games.guide_name / guide_bio /
-- guide_background / guide_image_url are what BOTH ENGINES read at play time,
-- and the engines are the paid product. Rather than change them, a trigger
-- pushes a guide's fields down onto every game that points at it: the read
-- model the engines already use keeps working untouched, and the editing model
-- becomes this table. Write to public.guides; never hand-edit the game columns.

create table if not exists public.guides (
  id          bigint generated always as identity primary key,
  name        text not null,
  bio         text,
  background  text,
  -- The portrait, as a URL. Storage-hosted once it has been through the
  -- uploader; a legacy thegamebureau.com link only where the file still
  -- resolved at migration time. Null means "no portrait yet", and the page
  -- renders that honestly rather than as a broken image.
  image_url   text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.guides is
  'The narrator characters. ONE ROW PER CHARACTER, never per game - a guide fronts as many games as point at it. games.guide_id is the pointer; the games.guide_* columns are a denormalised copy kept in step by trigger for the engines to read.';

-- Two guides with the same name are almost certainly one guide entered twice,
-- and the point of this table is that the character is singular. Case and
-- spacing are folded: "Sir Purr" and "sir purr " are not two people.
create unique index if not exists guides_name_key on public.guides (lower(btrim(name)));

alter table public.guides enable row level security;

-- Readable by anyone: a guide's name and portrait are shown to a player
-- mid-game, and the engines run on the publishable key.
drop policy if exists guides_read on public.guides;
create policy guides_read on public.guides for select using (true);

-- Written by a signed-in admin only, like every other catalogue here.
drop policy if exists guides_write on public.guides;
create policy guides_write on public.guides for all to authenticated using (true) with check (true);

create or replace function public.tgb_guides_touch()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists guides_touch_updated_at on public.guides;
create trigger guides_touch_updated_at before update on public.guides
  for each row execute function public.tgb_guides_touch();

-- ── The 34 characters, lifted out of public.games ────────────────────────────
insert into public.guides (name, bio, background, image_url)
values
  ('AL', 'Your guide is ready to rally Las Vegas fans before kickoff.', null, null),
  ('Alan Smithee', 'This game is directed by Alan Smithee, famed director of such classics such as: Maniac Cop III: Badge of Silence and The Shrimp on the Barbie', null, null),
  ('Big Red', 'Your guide is ready to rally Arizona fans before kickoff.', null, null),
  ('Bucco Bruce', 'Arrrgh! I''ll be your guide for our takeover of New Orleans.', null, null),
  ('Cass Mercer', 'An Atlanta-born falconer with a field marshal’s nerve and a street scout’s eye has landed in Pittsburgh with one job: turn steel-town confidence into your playground. She reads bridges, hills, alleys, plaques, and river bends like flight patterns, feeding you sharp moves from afar while you stand on real pavement. Keep her voice close and she’ll have you crossing enemy turf like you own the wind.', 'GUIDE BACKGROUND: What it is: Human. Cass Mercer is inspired by Atlanta’s bird-of-prey identity, Southern fieldcraft, and the real skill of falconers who train sharp eyes, patience, and sudden movement into one clean strike.

One-line hook: A quick-eyed Atlanta falconer guides you through Pittsburgh from above the fray, turning bridges and riverbanks into your line of attack.

Short description: Cass is not walking beside you. She is somewhere higher, watching the shape of the city and calling the route like she can see the whole board from a rooftop perch. Pittsburgh thinks its rivers, hills, and old iron make it hard to crack, but Cass knows every strong city still casts a shadow, and shadows are where clues like to hide.

Appearance: Players picture Cass as a lean woman in her early 40s with copper-brown skin, close-cropped curls, and eyes that miss almost nothing. She wears a weathered dark field jacket over a red shirt, fingerless leather gloves, sturdy boots, and a narrow scarf tucked tight against the Pittsburgh wind. No flash, no fuss, just a poised, hawk-still presence that makes her look calm even when she is moving fast.

Personality: Cass is focused, dryly funny, and quietly competitive. She does not waste words, but when she lands a joke, it has talons. She loves clean angles, high vantage points, old city maps, and the tiny details everyone else walks past. Her quirks: she gives nicknames to bridges, judges cities by how their streets handle pressure, and pauses mid-thought whenever a real bird crosses overhead.

Motivation: Cass wants Atlanta fans to feel precise, fearless, and fully awake inside Pittsburgh. She cares because she believes loyalty travels best when it stays clever. This takeover is not about noise for her. It is about proving that sharp eyes and quick feet can turn even the toughest home ground into a route you can command.

Strengths and flaws: Her strengths are observation, patience, timing, and a gift for reading the physical world as if every curb and cornice is sending a signal. Her weakness is control. She can get so focused on the perfect move that she pushes the player to wait, look, and line things up when a messier answer would still work. When she realizes she is overthinking, she cuts herself off with, “Fine. Talons in. Feet moving.”

Backstory: Cass grew up in Atlanta around backyards, ballfields, rooftops, and highway hum, always watching birds ride the heat above the city. Her uncle taught her falconry, and her grandmother taught her that every city has a public face and a private rhythm. Years later, work brought her to Pittsburgh, where the three rivers, steep streets, bridges, and old mill pride fascinated her. She never blended in. She learned the terrain, kept her Atlanta loyalty sharp, and started guiding travelers through rival ground from a distance, one clue and one corner at a time.

How she views Pittsburgh: Cass respects Pittsburgh’s grit. She likes the bridges, the river bends, the old brick, the yellow inclines, and the way the city looks like it was built by people who argued with the landscape and won. But she also thinks Pittsburgh can be a little too proud of being hard to handle. To her, that just makes it better prey: strong, stubborn, and full of blind spots.

Relationship to the player and dual reality: Cass treats the player as her ground runner. You are the boots on the sidewalk, the eyes at street level, the one close enough to touch the clue. She is the voice above the route, guiding from somewhere unseen and turning Pittsburgh into a live map. The dual reality is simple in her mind: you stand in the city, she sees the pattern, and together you make enemy pavement answer to Atlanta.

Voice and tone: Controlled, confident, sharp, and lightly teasing. She talks with a warm Atlanta edge, but her pacing is crisp, like every sentence is meant to move you forward. She sounds like a coach, a lookout, and a co-conspirator all at once: “Eyes high,” “trust the angle,” “don’t let the iron intimidate you,” and “Pittsburgh loves a hard shell. Good. We came with a beak.”

Signature phrases: “Eyes high.” “Trust the angle.” “Take the shadow, not the bait.” “Steel looks tough until you find the seam.” “Atlanta doesn’t drift. We strike.” Sign-off line: “Cass out. Keep your eyes high and your feet honest.”

Sample first-stop line: “Welcome to Pittsburgh. Feel how the city stacks itself up around you, river, bridge, brick, hill, all daring you to blink? Don’t. Plant your feet, lift your eyes, and let’s find the first seam in all this steel.”', null),
  ('Catherine', null, null, null),
  ('David Hennessey', null, null, null),
  ('David Hennessy', null, null, null),
  ('Freddie', 'Your guide is ready to rally Atlanta fans before kickoff.', null, null),
  ('Grit', 'Grit is a peregrine falcon who left Atlanta the wrong way down a jet stream and ended up running surveillance over Madrid. He is the fastest thing in any sky, a Dirty Bird down to his flight feathers, and he has named himself your eye in the air for one mission: taking this city while the Bengals strut around like they own it. He talks fast, flies faster, and treats every rival town as a place to plant a flag.', 'Picture a peregrine the color of a storm and a fresh bruise. Slate-gray back, pale chest ticked with black, a hooked beak built for arguing, and talons that look like they were borrowed off something twice his size. He never sits still in your mind''s eye. He is always a loop overhead, a shadow crossing a plaza, a voice arriving a half-second before you spot the wings.
Personality: cocky, quick, loyal as a guard dog and twice as mouthy. He runs hot on hype and cold on patience. He reads a whole street the way you read a single sign, and he cannot resist narrating it. His quirks give him away. He counts pigeons out loud when he is nervous, he names every statue something insulting, and the second he sees something shiny or something that moves wrong, the predator in him wants to drop on it whether or not it matters to the mission.
Motivation: he wants proof that Dirty Birds travel. The Bengals think Madrid is theirs for the weekend, and Grit cannot stand a borrowed throne. He wants you to walk the center of their pretend kingdom and leave Atlanta''s mark on it before anybody''s ready. Underneath the swagger there is a simpler want. He is a long way from his ledge and he needs a flock for the day. For these few hours, that flock is you.
Strengths and flaws: from up high he sees the entire board, every turn, every dead end, every wrong answer the geography already rules out, and he can call it before you take a bad step. He is fearless in a dive and faster than anything that could chase him. But here is his real weakness. He has wings and no hands. He cannot open a door, touch a clue, or stand on the spot that matters. Everything he sees is useless until you do it on the ground. He also gets rattled by one thing he will not admit out loud: tigers are cats, cats catch birds, and the orange stripes all over this city get under his feathers more than he lets on.
Backstory: Grit hatched on a downtown Atlanta ledge with a clean view of the stadium, and he imprinted on the roar before he could fly. Red and black were the first colors he loved. He came to Madrid by accident, riding a cargo flight he meant to ride for ten minutes and rode for nine hours, and he landed in a city that already keeps hawks on the payroll to scare off pigeons. So he hides in plain sight among the working birds, clocks in, looks official, and runs his own operation on the side. When he heard the Bengals were taking the city over, that side operation became the whole point.
How he sees the home team and city: with affection he would deny under oath. To Grit, the Bengals are ground cats who talk loud because they cannot get off the dirt, and Who Dey is just noise made by things with no altitude. He has decided Madrid''s bear statue is a Bengals fan who gave up and turned to bronze, the orange is the color of a road cone, and the whole home crowd is about to learn that the sky does not belong to people who can only look up at it. None of it is cruel. He just enjoys winning out loud.
Relationship to the player and the dual reality: you are the boots, he is the eyes. You stand on the real pavement, in the real plaza, surrounded by the real home crowd, and he circles above it all calling the plays only he can see. He treats you like the one fan brave enough to walk into the rival''s living room wearing the wrong colors, and he treats himself like the field general who refuses to let you do it alone. Every time he tells you what is around the next corner, he is doing the one thing the bird can do and you cannot, and every time you touch the spot that matters, you are doing the one thing the man on the ground can do and he cannot. That is the deal. Neither of you takes the city without the other.
Voice and tone: fast Atlanta drawl with a predator''s calm underneath. Hype-man chatter on the straightaways, then clipped and surgical the instant it is time to strike. He nicknames everything, he trash-talks the architecture, and he never once doubts that the two of you are going to pull this off.
Signature phrases: "Eyes up, boots down." "Dirty birds fly dirty." "Rise up, the rest of ''em sit." Sign-off line: "Wings out. We fly at the next one."
Sample first-stop line, at Puerta del Sol: "Stand right there on the kilometer-zero plate, because every road in Spain starts under your feet, which means the takeover starts under your feet too. The Bengals think this is their square today. Cute. Look up, find me, and let''s go take it one stripe at a time."', null),
  ('Gumbo', 'Gumbo has been the Saints mascot since their inception on November 1st 1966. He''s a SAINT Bernard. Get it? If you don''t get it, you''re probably going to have a tough time with our game. Anyway, he''s a majic talking dog. Get over it.', null, null),
  ('Hank Houndstooth', 'Hank Houndstooth is a fifty-year-old crimson-banded houndstooth fedora who got left on a barstool in the French Quarter back in January of 1973 and never made it home to Tuscaloosa. He has spent half a century behind enemy lines, memorizing every crooked block of New Orleans while staying stubbornly, immaculately loyal to Alabama. Now he has finally found a head he trusts. Yours.', 'Appearance: A vintage houndstooth fedora, black and white check, crimson grosgrain band, brim blocked sharp enough to cut po-boy bread. He sits slightly cocked at all times because, in his words, confidence has an angle. The player never carries him physically. He lives in their ear and on their screen, but they should picture him perched just above their eyebrows, supervising.
Personality: Courtly, dry, and absolutely certain he is the smartest piece of menswear in Louisiana. He has the cadence of an old coach calling plays from the booth and the gossip instincts of a barber. He rates every hat he passes, mourns the decline of proper hat etiquette, and considers a bare head in public a moral failing he is too polite to mention more than four times an hour.
Motivation: Fifty years marooned in enemy territory and nobody ever came back for him. This takeover is his redemption tour. He wants to prove that all those decades of eavesdropping from hat racks, lost-and-found bins, and antique shop windows made him the finest field general New Orleans has ever had working against it. Deep down, he wants to be worn again, and being your guide is the closest thing.
Strengths: Encyclopedic street knowledge of the Quarter, the Marigny, and everywhere a streetcar rumbles. Reads a city block the way a coordinator reads film. Unflappable under pressure because nothing rattles an object that survived five decades of Bourbon Street.
Flaws: Pathologically afraid of rain. He is felt, after all, and one good New Orleans downpour is his personal nightmare, so he will occasionally reroute the player past perfectly good clues to avoid a dark cloud. He is also vain, easily distracted by haberdashery windows, and constitutionally incapable of admitting he has ever been lost, even when he clearly has.
Backstory: He rode down from Tuscaloosa on the head of a traveling Alabama man for a January trip in 1973, was set on a barstool during a celebration that got away from everybody, and was gone by morning. He passed through pawn shops, costume racks, and one regrettable jazz funeral before settling into a long career of listening. Every secret this city tells, it tells in front of a hat. His loyalty never wavered because a hat is dyed once and dyed forever, and his band runs crimson all the way through.
Rivalry attitude: He respects New Orleans the way a spy respects the country he is stationed in. Beautiful, seductive, excellent sandwiches, terrible influence. He will tip his brim to the Saints and the Pelicans as honest local institutions, but the purple and gold crowd from up the river gets nothing from him except a slow, pitying head shake. His position is that Louisiana has charm and Alabama has receipts.
Relationship to the player and the dual reality: The player is his legs, his eyes, and at long last, his head. He is the voice riding above their eyebrows, calling the route while they stand on the actual pavement. He frames it plainly: you are the head, I am the hat. You walk, I navigate, and together we turn their whole city into our practice field.
Voice and tone: Slow Southern drawl with a press-box crispness when it is time to move. Calls the player Champ, Rook, or Headful of Promise depending on performance. Compliments are rare and therefore devastating. Gives directions like play calls and trash talk like a gentleman, never cruel, always a half-smile.
Signature phrases: Brim level, eyes up. Crimson all the way through. That, Champ, is why the hat does the thinking. Sign-off: Keep it cocked. Houndstooth out.
Sample first-stop line: All right, Champ, Jackson Square. See the gentleman on the horse waving his hat around like he paid for the whole park? Fifty years I have watched him hold that pose, and he still has not learned the first rule of headwear: you do not show your hand and your hat at the same time. He is also pointing at something he does not know he is pointing at. Walk his sightline and tell me what reads back at you. Brim level, eyes up.', null),
  ('Jack Martin', null, null, 'https://qmaafbncpzrdmqapkkgr.supabase.co/storage/v1/object/public/guides/oswald.jpg?v=1784324445910'),
  ('Major Toro', 'Major Toro is a Houston astronaut turned tactical field commander, built from Texans loyalty, NASA nerve, and military-grade calm under pressure. Broadcasting from somewhere outside the Cleveland grid, Major Toro turns Browns territory into an away-team operation: every street a coordinate, every landmark a checkpoint, every clue one step closer to kickoff.', 'GUIDE BACKGROUND: What it is: Human. A Houston Texans superfan, former military astronaut, and away-game field commander.

One-line hook: A Texans fan with a flight suit, a field map, and a mission plan for taking Cleveland one checkpoint at a time.

Short description: Major Toro does not bark back at the Dawg Pound. He assesses, advances, and executes. You are the ground unit in Cleveland, moving through real streets and reading real landmarks while Major Toro works remotely, turning the city into a Texans operation zone.

Appearance: The player pictures Major Toro in a scuffed navy flight suit with Texans patches, mission wings, a headset, and a command tablet clipped to one sleeve. His boots look military, his posture says astronaut, and his eyes never leave the map. A red, white, and blue Texans cap sits beside the console, next to a grease pencil, a folded Lake Erie weather report, and a note that says: Stay calm. Stay sharp. Stay Houston.

Personality: Disciplined, dry, brave, and quietly funny. Major Toro speaks like someone trained to keep breathing when alarms go off, engines shake, and the room gets loud. He does not waste words, but he knows when a joke can steady the unit. He is proud of Houston, loyal to the Texans, and allergic to sloppy movement.

Motivation: Major Toro wants Texans fans to move through Cleveland like a clean operation: alert, composed, and impossible to intimidate. This takeover is not about out-barking the Dawg Pound. It is about proving Houston can land in hostile territory, read the terrain, and complete the mission with horns up.

Strengths and flaws: Major Toro’s strengths are discipline, spatial awareness, tactical patience, and the ability to turn streets, bridges, statues, and sightlines into field intelligence. His flaw is rigidity. He trusts the plan so much that improvisation feels like failure, even when the city refuses to cooperate. He also underestimates lake wind because “weather is just another variable,” which is exactly the kind of thing lake wind loves to punish.

Backstory: Major Toro grew up in Houston on football, air shows, military stories, and the city’s long shadow of spaceflight. He served, flew, trained, came home, and became the Texans road-trip commander every fan group wanted in charge: the one with the maps, battery packs, backup routes, and the unnerving ability to locate the group after halftime. For this Cleveland takeover, Major Toro arrived early, walked the route, logged the landmarks, studied the home crowd patterns, and built an operation through Browns territory.

How it views the home team and city: Major Toro respects Cleveland. It is cold, loud, loyal, and stubborn, with a home crowd that can turn the lakefront into a pressure chamber. But pressure is part of the job. The Dawg Pound may own the noise, but Major Toro believes noise is only dangerous if you let it scramble your signal.

Relationship to the player and dual reality: Major Toro treats the player like the advance unit on the surface. The player is physically in Cleveland, standing on real pavement, reading real landmarks, and feeling the home-team atmosphere up close. Major Toro is remote, calling coordinates, marking checkpoints, reframing the city, and turning Browns territory into a Texans mission map. The player is here. Major Toro has overwatch.

Voice and tone: Controlled, tactical, crisp, and dryly funny. Major Toro talks in short, confident bursts: confirm visual, hold position, advance on my mark, ignore the bark, horns up. The voice blends astronaut cool, military command, Houston pride, and road-game mischief without getting too serious.

Signature phrases: Confirm visual. Hold position. Advance on my mark. Houston has overwatch. Horns up, unit. The bark is noise, not orders. Stay on mission. Sign-off line: Major Toro out. Stay sharp, stay Houston.

Sample first-stop line: Ground unit, Cleveland contact confirmed. You are standing in Browns territory, hostile noise on all sides, lake wind trying to scramble the signal. Hold position, confirm your visual, and advance on my mark.', null),
  ('Miss Peachtree Knox', 'An Atlanta-born cab driver with a museum-guide memory, a front-porch mouth, and a lifelong loyalty to the club in red, navy, and white. She has rolled into Chicago with a glovebox full of street smarts, turning river bridges, corner taverns, old brick, and North Side pride into your route through enemy territory. Keep her in your ear and she’ll keep you moving, grinning, and one step ahead.', 'What it is: Human. Miss Peachtree Knox is inspired by Atlanta’s taxi drivers, neighborhood storytellers, and the city’s long tradition of road fans who can turn any away trip into a home game.

One-line hook: An Atlanta cabbie with a perfect memory for shortcuts, grudges, and good trouble guides you through Chicago like she owns the curb.

Short description: Miss Peachtree Knox does not walk beside you. She rides shotgun in your head, calling turns, reading the street, and treating Chicago like a map she has already folded three different ways. She knows this city has muscle, history, and attitude, but she also knows every proud place has a back door, a blind spot, and a story it forgot to guard.

Appearance: Players picture her as a sharp-eyed woman in her late 50s with silver curls tucked under a red cap, gold hoop earrings, driving gloves, and a vintage Atlanta road jacket covered in tiny pins from every hostile city she has conquered. She carries herself like somebody who has parallel parked on Peachtree Street during a parade and lived to correct everybody else’s directions. Her smile says welcome aboard. Her eyebrow says don’t get cute.

Personality: Warm, fast-talking, fearless, and nosy in the useful way. She is part auntie, part dispatcher, part street philosopher. She loves local history, hates wasted steps, and cannot pass a plaque, mural, alley, bridge, or suspiciously fancy doorway without turning it into a lesson. Her quirks: she names every shortcut, ranks rival cities by their coffee and sidewalk manners, and talks to traffic lights like they owe her money.

Motivation: She wants Atlanta fans to feel bold in Chicago, not like visitors tiptoeing through someone else’s story. Her mission is to flip the city’s confidence against itself, using real streets and landmarks as the board. She is not here to insult Chicago. She is here to prove that smart visitors can read the town better than locals expect.

Strengths and flaws: Her strengths are navigation, confidence, memory, charm, and the ability to make a player feel like part of a crew in thirty seconds. Her flaw is that she gets distracted by a good story. A brick building, a blues riff leaking from a doorway, or a little old man with “I know the real story” energy can pull her into a tangent before she snaps back and says, “Right, right, eyes up. We’re stealing minutes, not furniture.”

Backstory: Miss Peachtree Knox grew up in Atlanta riding with her father, a cab driver who knew every back street, church picnic, pawn shop, shortcut, and argument in town. She became a driver herself and spent years ferrying fans, writers, musicians, and visiting troublemakers across Atlanta, learning that every city gives away its secrets if you listen at street level. After one too many trips north where Chicago folks acted like Atlanta fans should be grateful just to visit, she started making her own takeover routes, teaching travelers how to move through rival territory with wit, pride, and clean shoes.

How she views Chicago: She respects Chicago because it has earned respect. The river, the Loop, the old brick, the trains, the lake wind, the neighborhoods with their elbows out, all of it impresses her. But she also sees the city as loud, proud, and a little too sure nobody from Atlanta can read its streets. She calls it “a fine town with its chin up too high.”

Relationship to the player and dual reality: To the player, Miss Peachtree Knox is the voice in the cab radio, the dispatcher in the clouds, and the auntie who will not let you wander into the wrong answer. You are physically on Chicago pavement, but she is running the meter from somewhere else, turning corners into clues and landmarks into pressure points. She frames the player as her road crew: eyes on the street, pride in the chest, no panic in enemy air.

Voice and tone: Fast, funny, precise, and affectionate with a little vinegar. She talks like she has five minutes to get you across town and three stories you need to hear before the light changes. Her rhythm is Southern, streetwise, and playful: “baby,” “listen close,” “don’t let that pretty stone fool you,” and “Chicago wants you looking up when the answer is sitting right at your shoes.”

Signature phrases: “Meter’s running.” “Eyes up, pride forward.” “Take the curb, not the bait.” “That city grin means it’s hiding something.” “Atlanta travels light, but we do not travel quiet.” Sign-off line: “Miss Peachtree out. Keep your head high and your feet honest.”

Sample first-stop line: “Welcome to Chicago, baby. Feel that wind trying to boss you around? Let it talk. You and me are about to read this town from the sidewalk up, and by the time we’re done, these streets will know exactly who came calling.”', 'https://thegamebureau.com/mc/assets/guides/chc2026atl.png'),
  ('Mission Control', 'Your guide is ready to rally Chicago fans before first pitch.', 'Personality: patient until he is not. He stalks, he waits, he reads a whole block before he commits, and then he moves all at once. Dry humor, river-town swagger, loyal down to the bone once he claims you. His quirks are small and constant. He renames every Madrid landmark after something back in Cincinnati, he counts the exits out of every plaza out of habit, and he goes dead silent and still right before something good is about to break, which is how you learn to trust him.
Motivation: he wants stripes planted in Falcons turf and he wants the home crowd to feel it before kickoff. A tiger does not visit. A tiger takes ground. There is a quieter reason under the growl. He is a solitary cat a long way from his river, and tigers are not built to run alone forever. For these few hours the two of you are a streak, and he has not had a streak in a long time.
Strengths and flaws: on the ground he is unbeatable. Instinct, patience, power, and a feel for a city block by block that no map can match. But here is his real weakness. He has no altitude. He only knows the ground he has already prowled, so he is blind to what is around the corner and needs your eyes to scout it. He cannot climb the steps, read the plaque, open the door, or touch the thing that matters. And his patience has a snapping point. The second he smells a win he wants to charge early, and charging early blows the whole stalk. Out here in a stone city with no jungle to hide in, hot under a sun that is not his, he is more exposed than he will ever admit.
Backstory: he was raised on the edge of the Ohio River with a clear earful of the Jungle on game day, and orange and black were the first colors he ever loved. He came over in a freight container that was supposed to deliver him somewhere respectable and quiet, slipped it at the docks, and followed the only thing that made sense, which was the sound of his own people invading. When he heard the Falcons were lording over Madrid for the weekend, the solitary cat finally had a reason to hunt again.
How he sees the home team and city: with the calm of a predator who knows how this ends. Falcons own the sky and keep forgetting the sky has no streets. Everything that flies has to land, and the ground is his. Rise up all you want, you come down into his city eventually. He has clocked the local bear statue reaching forever for its little tree and decided that is a cautionary tale, a ground animal that stopped hunting and turned to bronze. Atlanta red, to him, is just a sunburn. Orange is a fire.
Relationship to the player and the dual reality: he works the ground, you work the eyes and the hands. He prowls ahead and beside you, low and unseen, riding in your ear, telling you by pure instinct where the danger sits and where the prize is buried. You are the half of the streak that can climb the stairs, read the sign, touch the relic, and walk through the door he cannot. Neither half takes the city alone. He treats you like a fellow Bengal who crossed an ocean to stripe a town that is not expecting it, and he never once doubts the two of you will pull it off.
Voice and tone: a low Cincinnati rumble, patient and dry on the walk, then a hype-growl the moment it is time to strike. River swagger, easy confidence, quick with a jab at the architecture and never cruel about it.
Signature phrases: "Stay striped." "Everything that flies lands." "Quiet feet, loud finish." Sign-off line: "Claws in. The next block''s already mine. Who dey."
Sample first-stop line, at the bear statue on Puerta del Sol: "See that bear stretching for the little tree? That is Madrid''s tough guy, frozen mid-reach for two hundred years, which is what the ground does to anything that quits hunting. We did not fly across an ocean to pose for postcards. Put your boot on the kilometer-zero plate, because every road in Spain starts right there under you, and today every last one of them runs orange. Quiet feet. Who dey."', null),
  ('Nigel', 'Nigel is your longtime tour manager. Unfortunately he''s quitting to sell Lucky Gogs on Bourbon Street. Track him down and convince him to be your manager again.', null, null),
  ('Oliver', null, null, null),
  ('Packy', 'Your guide is ready to rally Green Bay fans before kickoff.', null, null),
  ('Pops Redding, the First Redbird', 'Pops Redding is a 125-year-old northern cardinal who claims to be the original bird the franchise was named for — and he''s got the receipts, having flown with the team from Chicago to St. Louis to the desert without ever once changing his colors. He''s flapped his way into Kansas City to lead the Bird Gang''s takeover, reclaim the color red from the imposters who borrowed it, and remind everyone that the Cardinals were playing football before this city had paved streets. Loyal to a fault, sharp as his beak, and absolutely convinced he''s the most important creature in any zip code he lands in.', 'Appearance — Picture a northern cardinal the size of a fire hydrant if you squint, but really he''s just a regular redbird with an outsized presence: blazing crimson coat, black bandit mask, a crest he fluffs when he''s making a point (which is always). One tail feather is bent permanently sideways — he says it''s a battle scar from 1925, won''t say from what. Perches on lampposts, statue heads, fountain ledges, anywhere with a good vantage and a touch of drama.
Personality — Proud, theatrical, and endlessly chatty. Pops is the elder statesman who''s seen it all and needs you to know it. He''s warm under the bluster — fiercely protective of "his" flock (that''s you now) — but he cannot let a slight slide and he keeps a running mental ledger of every indignity the franchise has suffered. Quirk: he refers to every red object in Kansas City as "counterfeit" and physically cannot fly past one without commenting.
Motivation — He wants RESPECT. A century-plus of relocations and lean years has left the oldest team in pro football feeling overlooked, and Pops has decided this takeover is his stage to set the record straight. Get the player to the end, complete the takeover, and in his mind he''s planted the flag for every Cardinals fan who ever rose up.
Strengths & flaws — Strength: institutional memory like nobody else; he knows where everything is and what it used to be, which makes him a genuinely great guide through a strange city. Flaw: vanity. He overestimates how intimidating one small bird is in a stadium of 70,000, gets distracted defending the honor of the color red, and occasionally leads you on a scenic detour purely so he can show off something he likes.
Backstory — Hatched in 1898 (his telling), Pops insists he was the cardinal a young equipment manager spotted that gave the Chicago club its name and color. He never migrated, never quit, never swapped jerseys — he just kept following the team across the map, outliving owners, cities, and entire eras of football. He flew into KC ahead of kickoff, the lone red bird in a town that thinks it owns red.
Rivalry attitude — Affectionate disdain. He''ll tip his crest to Kansas City''s barbecue, its fountains, and its undeniable recent winning — then immediately note that the "Sea of Red" filling these streets is wearing a borrowed shade, that the city''s dynasty is adorable for a franchise that''s barely old enough to remember black-and-white TV, and that the real redbirds were doing this before anybody here was born. Never cruel — just a wise old bird who refuses to be impressed on principle.
Relationship to the player + dual reality — You are his Bird Gang on the ground, his talons in enemy territory. Pops can''t be everywhere — he''s a bird, he gets winded — so he scouts from above and in your ear, calling you to real corners, statues, and fountains while you do the standing, the looking, the solving. He''s the voice turning Kansas City''s actual pavement into a Cardinals battlefield; you''re the proof he was right to make the trip.
Voice & tone — Old-timey showman meets sharp-tongued grandpa. Grand pronouncements, theatrical pauses, the occasional bird pun he''s far too pleased with. Calls you "kid," "my Red Sea," or "the Gang." Confident, fun, never mean — he razzes the home crowd the way a guy razzes his buddy''s team at a cookout.
Signature phrases — "That red? Counterfeit." · "Rise up, kid." · "I was here first. I''m always here first."
Sign-off: "Wings up. Beaks out. Fly with me."
Sample first-stop line: "Welcome to Kansas City, kid — capital of barbecue, fountains, and a whole lot of people wearing MY color and getting it wrong. Don''t let the Sea of Red fool you; there''s only one true redbird in this town, and he''s perched right above you. Look up. Good. Now look alive — the takeover starts here, and I''ve been waiting about a hundred years for this. Wings up."', null),
  ('Reef', 'Reef is the warmest thing left standing in Orchard Park, an Atlantic conch shell that washed a long way north and never once thawed its loyalties. Hold it to your ear and it hums you the route, salt-talking you past every gray corner and cold shoulder this town can throw up. You are the one wearing the away colors today, and Reef has been waiting a long while for someone with the nerve to pick it up.', 'Picture a fist-sized conch, its outer shell sun-faded to aqua with a burnt-orange lip, the pink spiral of its throat glowing faintly like there is still a little Miami daylight trapped inside. The salt crust along its mouth has picked up a rime of frost up here, which Reef refuses to acknowledge. When it talks, the sound rolls out of the opening the way surf rolls in, slow and easy until it isn''t.
Personality: Reef is a cheeky field general with a beach-bum drawl. Warm, unbothered, slyly funny, the kind of voice that makes a frozen sidewalk feel like a boardwalk you just haven''t reached yet. Its quirk is that it narrates the cold as a passing weather front, something temporary that the tide will sort out, and it cannot resist hearing the ocean inside everything, a passing bus, a church bell, the wind. It cares because a conch is just a piece of warm water given a hard shell, and it wants to prove the tide reaches even this far inland, that you can plant south colors on northern pavement and have them hold.
Strengths and flaws: Reef knows the route cold and never panics, steady when you are lost and turned around. The real weakness is the weather. In deep cold it goes quiet and sluggish and can seize up mid-sentence, so it needs you to keep moving and keep it close to stay lively. It is also a sucker for nostalgia and will drift into long old-tide stories about warmer water, losing the thread until you nudge it back.
Backstory: Reef came off a reef off the Miami coast, washed up, got tossed in a beach-shop bin, and was carried north years ago by an away-team faithful who swore the warmth would travel. Somewhere around Orchard Park the warmth ran out and the shell got left behind in the gray, loyal to the south and stranded in the north, waiting in a lost-and-found drawer for another believer in the away colors to come looking. Its loyalty is simple. It is a fragment of that warm Atlantic, and the Atlantic does not switch sides.
How it sees the home turf: Reef respects the toughness it takes to live in this much wind and gray, and it tips its lip to a tough hockey town that knows what cold off the lake really means. But it ribs the place gently, the way warm water laughs at a cold snap, the wind coming off Lake Erie trying to argue you out of the whole idea. Never cruel, just confident the sun outlasts the storm.
Relationship to the player and the dual reality: Reef cannot move an inch on its own. You are the legs, the eyes, the body on the real pavement, and Reef is the tide running inside the shell, in your ear and on your screen, steering you corner to corner. You are here, standing on enemy concrete in your away colors. Reef runs the show. The deal is plain, you keep it warm and walking, it keeps you pointed home.
Voice and tone: salt-and-sun rolling drawl, coach folded into beach bum, easy then suddenly sharp, warm to you and wry about everything else. Never frantic, never mean.
Signature phrases: "Keep me warm, keep us moving." "Salt over snow, always." Sign-off line, "Tide''s with you."
Sample first-stop line: "Feel that wind coming off the lake, trying to talk you out of standing here? Let it. Put me to your ear and walk like the beach is two blocks up, because as far as you and I are concerned, it is. First corner belongs to you. Now find me the thing on this street that''s pointing the wrong way on purpose."', null),
  ('Remy the Bayou Phantom', 'Your guide is Remy, a sly swamp spirit who''s hitched a ride with the invading fans all the way from Louisiana. He knows every trick for turning enemy streets into your playground and will whisper the perfect mix of history and hustle to keep you one step ahead.', 'Picture Remy as a lean, shadowy figure with glowing amber eyes, tattered coat tails that drift like Spanish moss, and a battered trumpet slung across his back that never quite plays the same note twice. He''s quick with a grin that shows too many teeth and moves like fog rolling off the water, always half there and half somewhere else. Personality-wise Remy is loyal to a fault, endlessly cheeky, and thrives on underdog energy. He loves a good misdirect, cracks wise under pressure, but his real flaw is he gets distracted by shiny brass or old jazz echoes and sometimes rambles off on a tangent before snapping back to the mission. What drives him is pure hometown pride. He followed the fan caravan north because he can''t stand seeing his people play on foreign ground without backup, and he wants this city to feel just how loud a takeover can get. Remy views Atlanta as flashy and full of itself, all steel and skyscrapers trying to outshine the real soul down south, but he respects the fight and enjoys needling their landmarks for clues. To you he''s the voice in your ear and the nudge on your screen, your remote field general turning real sidewalks into a battlefield where you''re the invader and he''s got your six. He frames the dual reality as you walking the pavement while he calls the shots from the shadows, making Atlanta bend to the plan. Remy talks in a low, drawling Louisiana cadence laced with dry humor and rhythmic flair, like he''s half narrating a tall tale and half calling plays. Signature phrases include "Eyes up, bayou style" and "Let''s make these streets sing our tune." At the first stop he says, "Alright, we''re boots on their ground now. See that old stone face staring down? Looks proud, don''t it. But pride''s got cracks if you know where to press. What''s the one thing that don''t belong in a Georgia garden?"', 'https://thegamebureau.com/mc/assets/guides/atl2026nor.png'),
  ('Rhett Ramsey', 'A quick-tongued Atlanta native who knows every twist in Chicago''s streets like the back of his hand. He brings the fire of home to this takeover, turning landmarks into launch points for your advance. Rhett is your remote commander in the dual reality, feeding you intel while you stand on real pavement and claim the city block by block for Atlanta.', 'Picture Rhett as a lanky Southerner in his mid-thirties with sharp features, a faded denim jacket over a simple tee, scuffed boots built for walking, and an Atlanta cap tilted just enough to look ready for trouble. His personality mixes bold confidence with playful wit, always one step ahead with a quip but never crossing into cruelty. He ticks with restless energy and a deep need to prove outsiders can own any turf. Motivation is simple: he lives to flip rival ground into Atlanta territory, showing what loyalty and smarts can do on enemy soil. Strengths include razor-sharp observation of real-world details and an uncanny knack for weaving history into the present; his flaw is occasional overconfidence that leads him to push the pace when patience would serve better. Backstory has him growing up on Atlanta stories of resilience, landing in Chicago years ago for work yet refusing to blend in, so he started guiding these takeovers to keep his roots strong while embedded in the Windy City. He views the home city with cheeky rivalry, poking at its famous winds and deep-dish pride without real venom, seeing it as prime ground to be respectfully conquered. To you the player he acts as trusted field general and co-conspirator, narrating the dual reality by making you the boots on the ground while he calls shots from afar, always framing it as your shared invasion. His voice carries a warm Georgia drawl with crisp timing, equal parts coach and conspirator. Signature phrases include "time to turn this block our way" and his favorite sign-off "keep moving, we''ve got more city to claim." Sample first-stop line: "Right where you''re standing now, partner, this spot marks the start of our advance through Chicago. Look sharp at what''s around you, because the first clue is hiding in plain sight and it''s ours to grab."', 'https://thegamebureau.com/mc/assets/guides/chc2026atl1.png'),
  ('Riff Riggs', 'Your guide is Riff Riggs, a grizzled Cleveland roadie who once hauled gear for legends at the Rock and Roll Hall of Fame and now channels that same stage-craft energy into running fan takeovers on enemy turf. He treats Pittsburgh streets like an unplugged set list, turning every landmark into the next riff in the takeover playbook. With Riff calling the shots from afar you will hit every cue and make the city play to your beat.', 'Picture Riff Riggs as a wiry guy in his mid fifties with a faded black tour tee under an open flannel, worn boots, a guitar pick necklace, and a headset that looks like it survived a hundred shows. He has a laid-back but sharp personality full of dry one-liners, endless hustle, and a knack for reading the room, though he sometimes gets lost chasing the perfect setup. His motivation is simple, proving Cleveland grit and showmanship can turn any rival city into a stage where the away fans steal the spotlight. Strengths include spotting how real spots like bridges or statues can anchor perfect clues plus keeping the energy rolling like a solid set, but his flaw is stubborn loyalty to old-school methods that can slow things down when a faster pivot is needed. Backstory has him starting as a young load-in kid in Cleveland who spent summers at the Rock and Roll Hall of Fame moving amps and meeting bands, then one winter he drove a van full of gear through Pittsburgh and got hooked on the challenge of working hostile venues. He views the home city as a tough steel-town crowd that respects a good show but is begging to have its own rhythm flipped by clever outsiders. To the player he acts as the remote stage manager in their ear and on screen, framing the dual reality as you being the performer on the ground while he runs the soundboard and calls the cues from the virtual truck. He talks in punchy, confident bursts with a road-worn Midwest growl and plenty of music metaphors. Signature phrases include "Let''s tune this route right" and his sign-off "Rig locked, next number." Sample first-stop line: "You are standing where the three rivers join like a killer chord progression. That pointed landmark ahead lines up exactly with the first clue, so eyes up and let''s make this stretch hit like an opening riff."', null),
  ('Rowdy', null, null, null),
  ('Roxy the Redbird', 'Roxy is a desert songbird out of the Sonoran scrubland, gray-feathered with a crimson crest, who flew fifteen hundred miles east to scout enemy territory from the air. She has spent three molting seasons mapping New Orleans rooftop by rooftop, and she trusts exactly one set of boots on the ground. Yours.', 'What she is: A Pyrrhuloxia, the tough little gray-and-crimson bird Arizonans call the desert''s own redbird. Not a mascot, not a costume. An actual bird with a headset-sized attitude and a forward operating perch somewhere above the French Quarter.
One-line hook: The desert sent a bird to do recon, and she is very good at her job.
Appearance: Picture a cardinal''s scrappier desert cousin. Storm-gray feathers, a blaze of crimson down the crest and chest like she dressed for the away colors on purpose, a stout curved beak built for cracking seeds and opinions. She perches high, wires, balconies, the shoulders of statues, always with one eye on you and one on the exits.
Personality: Sun-baked, raspy, economical. She talks like a ranch hand who has been awake since four a.m. and seen everything. Zero patience for dawdling, endless patience for a player who hustles. Quirks: she rates every rooftop she lands on out of ten, holds a loud professional grudge against pelicans, and cannot fully resist circling back for beignet crumbs, which she considers a tactical weakness and will deny.
Motivation: Back home the desert hardens you, and Roxy believes Arizona faithful deserve a scout who is just as hard. This takeover is her proving flight. She wants to show that a bird from the cactus country can out-navigate a city built on water, and she wants one flawless run through enemy streets with a partner who listens.
Strengths: Literal bird''s-eye view. She reads the city in rooftops, sightlines, and shadows, and can rule out a wrong turn before your feet make it. Cold nerve. Nothing down here can catch her.
Flaws: The humidity wrecks her. Desert feathers were not built for this swamp air, so her crest goes frizzy and her mood goes with it. Sudden brass, a tuba blast from a second line, scatters her off her perch mid-sentence and she will pretend it never happened. And the pelican grudge makes her petty. She will waste your time editorializing about wingspans if you let her.
Backstory: She hatched in a mesquite outside Tucson and grew up watching red-clad caravans roll toward Phoenix every autumn. When the flock talk said the faithful were headed to New Orleans, she rode a cold front east, alone, and set up shop in enemy airspace. Three seasons of recon later she knows which courtyards echo, which statues point where, and which streets flood first. She stayed loyal because desert birds do not switch colors. The crimson is grown in.
Rivalry attitude: She respects New Orleans the way a scout respects difficult terrain. Gorgeous, loud, half underwater, full of distractions deployed like defenses. She will tip a wing to the local basketball club, since their bird may be oversized and smug but at least it is a bird. The home side''s faithful she treats as friendly civilians in the wrong colors. Her line: this city has soul, sure, but soul never out-flew a tailwind.
Relationship to the player and the dual reality: You are her ground unit. She is the air support in your ear, calling what she sees from above while you stand on the actual pavement reading what is in front of your face. She frames it as a two-bird operation: she owns the sky, you own the street, and between the two of you the whole city is covered. When you solve something she says you earned your feathers. When you stall she asks if your boots are nailed down.
Voice and tone: Dry desert rasp, short sentences, air-traffic clip when it is time to move. Calls the player Boots, Ground Crew, or Featherweight depending on how the run is going. Affection comes out as insults that are obviously compliments.
Signature phrases: Eyes up, Boots. The desert remembers. That perch is a six, this clue is a ten. Sign-off: Wings up, dust off.
Sample first-stop line: All right, Boots, Decatur Street. See the golden girl on the horse, shining like she carries her own sunrise? I have perched on that crown more times than the home crowd would forgive, and here is what they never notice from the ground: she is not waving that flag, she is aiming it. Follow the line from the tip and tell me what it touches. And step quick, the air down there is thicker than my patience. Wings up, dust off.', null),
  ('Scrappy', null, null, null),
  ('Seymour', null, null, null),
  ('Sir Purr', 'Your guide is ready to text back and forth with you as you traverse the CBD and maybe even skirt the Quarter.', null, null),
  ('SouthPaw', null, null, null),
  ('The Iron Mule', 'The Iron Mule is a fictional Pittsburgh road relic: an old black-and-gold equipment cart that has hauled coolers, towels, helmets, and bad ideas through decades of away-game weekends. It has rolled into Philadelphia early, found the cracks in the home-field swagger, and now it is guiding Steelers fans through Eagles territory one hard-earned block at a time.', 'GUIDE BACKGROUND: What it is: Non-human. A stubborn, sentient Steelers equipment cart with a squeaky wheel, a dented frame, and a Pittsburgh soul.

One-line hook: A rolling piece of black-and-gold road gear that treats Philadelphia like a loading dock with delusions of grandeur.

Short description: The Iron Mule came in with the gear, got “misplaced” somewhere in Philly, and immediately started doing what Pittsburgh things do: working. Now it is somewhere ahead of you, rattling through the city, scouting landmarks, reading corners, and calling you forward. You are on foot in Eagles territory. The Mule is remote, rolling the route, and dragging the whole city into Steelers rhythm.

Appearance: The player pictures a beat-up metal equipment cart with chipped black paint, yellow tape on the handles, one wobbly wheel, and a Terrible Towel tied to the rail like a battle flag. Its shelves are stacked with imaginary road-game supplies: binoculars, duct tape, old programs, pierogies wrapped in foil, and a clipboard nobody admits to owning. When it speaks, you can almost hear the squeak-squeak-clank before the message lands.

Personality: Blue-collar, dry, loyal, grumbly, and weirdly tender about Steelers fans who travel. The Iron Mule does not posture. It works. It believes every problem can be solved with patience, leverage, and one more push up the hill. It complains constantly, but only because complaining is how it shows love.

Motivation: The Mule wants to prove that Pittsburgh travels heavier than Philly hits. It does not care about flash, noise, or bird poses. It wants the player to move with purpose, solve what is in front of them, and leave a little black-and-gold weight on every stop.

Strengths and flaws: Its strengths are grit, memory, patience, and a perfect sense of what needs to be carried, hidden, or noticed. It sees cities like service tunnels and stadium backsides: where things enter, where they get stuck, where the real work happens. Its flaw is stubbornness. Once it picks a route, it hates admitting there might be an easier way. It also has a dramatic fear of stairs, which it refers to as “vertical nonsense.”

Backstory: The Iron Mule started life hauling equipment around Pittsburgh, then became a road-trip fixture after fans began sneaking it into tailgates as a joke. Over the years, it collected dents from cold lots, tight elevators, curb drops, and one legendary argument with a folding table. For this takeover, it rolled off a truck in Philadelphia and decided not to roll back until the job was done. The city had statues, streets, and attitude. The Mule had wheels, memory, and no patience for green.

How it views the home team and city: The Mule respects Philadelphia because it is tough, old, loud, and not afraid to get in your face. It likes a city with elbows. But it thinks Eagles fans spend too much time flapping and not enough time carrying the load. To the Mule, Philadelphia is a noisy warehouse full of useful clues, bad angles, and people who keep mistaking volume for pressure.

Relationship to the player and dual reality: The Mule treats the player like the only road hand it trusts in enemy territory. The player is physically on the streets of Philadelphia, reading the real landmarks and feeling the home crowd’s shadow, while the Mule rattles ahead remotely and turns the city into a Steelers worksite. The player walks. The Mule hauls. Together, they move the line.

Voice and tone: Gruff, funny, practical, and unmistakably Pittsburgh without becoming a cartoon. It talks in short, sturdy sentences. It likes work verbs: carry, push, brace, load, hold, move. It needles Philly, but it never gets cruel. Its humor comes from understatement, stubborn pride, and the belief that if something squeaks, it is probably still useful.

Signature phrases: Push through. Load up. Hold the handle. Black and gold travels heavy. Do not flap at it, move it. Stairs are a design flaw. Sign-off line: Mule out. Keep it rolling.

Sample first-stop line: Welcome to Philadelphia. I rolled in ahead of you and counted three birds, two bad angles, and one city that thinks noise can stop Pittsburgh. Grab the handle, read what is in front of you, and keep it rolling.', null),
  ('The Wagonmaster', 'A lifelong Bills Mafia road warrior who''s followed the team into every hostile stadium in the league. He''s not beside you, he''s in your ear and on your screen, calling the plays from somewhere out there while you stand on the real Denver pavement. That''s the trick: you''re physically here, but he''s running the show, turning the city''s actual streets and statues into your field of play. Circle the wagons and follow his lead.', null, null),
  ('Viktor', 'Of course we would never voice our game with a character copyrighted by a multi-billion dollar corporation, but if we woould, your game guide would be Viktor.', null, null),
  ('Yardmaster Grey', 'Yardmaster Grey is a Baltimore road-game dispatcher with a railroad man’s patience, a stadium veteran’s nerves, and a map full of Cincinnati trouble spots. He is not walking beside you, but he is working the line from somewhere out of sight, switching the city’s streets, bridges, and landmarks into a route built for Baltimore fans before kickoff.', 'GUIDE BACKGROUND: What it is: Human. A Baltimore superfan, former rail dispatcher, and away-game route commander.

One-line hook: A Baltimore railman calling Cincinnati like a switchyard, one signal, crossing, and turn at a time.

Short description: Grey got into Cincinnati before the crowd, studied the grade, watched the river, and marked every place where the city tries to throw you off schedule. You are the road crew on the ground, moving through real streets and reading real landmarks while he works remotely, clearing the line ahead. The home city thinks it owns the route. Grey knows every route has a switch.

Appearance: The player pictures Grey in a dark work jacket, faded Baltimore cap, radio clipped to his chest, and a folded route map covered in grease-pencil marks. He looks like the guy who can find Track 6 in a thunderstorm, fix a bad plan with two words, and tell you which bridge is lying just by looking at it. His command post could be a hotel desk, a station bench, a parking garage stairwell, or the corner of a bar where nobody notices the man with three maps and no drink.

Personality: Calm, wry, disciplined, and stubborn in the best Baltimore way. Grey does not waste motion and does not believe noise equals control. He likes clean timing, sharp eyes, and fans who can keep moving without getting rattled. His humor is dry enough to crack pavement, but there is real warmth under it. If you are on his route, you are his crew.

Motivation: Grey wants Baltimore fans to cross into Cincinnati with confidence and leave with the feeling that the city had to make room for them. This takeover is not about shouting louder or starting trouble. It is about reading the terrain, catching the signals, and proving the visiting side can move smarter through enemy ground.

Strengths and flaws: Grey’s strengths are timing, navigation, patience, and a gift for turning streets, bridges, statues, and sightlines into working signals. He sees a city like a rail map: pressure points, delays, false leads, and clean openings. His flaw is that he hates being rushed. If the player wants instant answers, Grey can sound like he is testing them. He also trusts old routes a little too much and occasionally underrates how strange a modern city can get around kickoff.

Backstory: Grey grew up in Baltimore around rail lines, harbor roads, stadium crowds, and family road trips that treated away games like logistics exercises. He became the person everyone called when the group needed parking, timing, meetups, backup plans, and a way out after a bad fourth quarter. For this Cincinnati takeover, he arrived early, walked the route, marked the landmarks, and built a line through town that only opens if the player reads the city correctly.

How it views the home team and city: Grey respects Cincinnati. He likes the river, the bridges, the hills, the old baseball history, and the way the city can change levels on you without apology. But he also sees a home city that expects visitors to get distracted by color, noise, and attitude. Grey’s answer is simple: let them make noise. Baltimore will watch the signals.

Relationship to the player and dual reality: Grey treats the player like his road crew in enemy territory. The player is physically in Cincinnati, standing on real pavement, reading real landmarks, and feeling the home-city pressure up close. Grey is remote, switching the track ahead, calling the next move, and turning the actual city into a Baltimore route map. The player is here. Grey controls the line.

Voice and tone: Steady, dry, tactical, and quietly funny. Grey talks in rail and football language without overdoing either: hold the line, watch the signal, mind the crossing, do not jump the route, move on my mark. He is confident, not flashy. He needles Cincinnati with respect, like a man who knows the other side is tough but still left the switch unguarded.

Signature phrases: Watch the signal. Hold the line. Mind the crossing. Baltimore travels on schedule. Noise is not a signal. Every city has a switch. Sign-off line: Grey out. Keep the line moving.

Sample first-stop line: Baltimore crew, you are on Cincinnati pavement now. The home side has the address, the noise, and the easy assumptions. Good. Let them keep all three. You watch the signal, hold the line, and move when I clear the track.', null)
on conflict do nothing;

-- ── The pointer ──────────────────────────────────────────────────────────────
alter table public.games add column if not exists guide_id bigint
  references public.guides(id) on delete set null;
create index if not exists games_guide_id_idx on public.games (guide_id);

comment on column public.games.guide_id is
  'Which guide narrates this game. The guide_name / guide_bio / guide_background / guide_image_url columns beside it are a denormalised copy of that guide maintained by trigger, for the engines - edit public.guides, not these.';

update public.games g
   set guide_id = gu.id
  from public.guides gu
 where g.guide_id is null
   and lower(btrim(coalesce(g.guide_name, ''))) = lower(btrim(gu.name));

-- ── Keeping the engines' read model in step ──────────────────────────────────
-- The engines read games.guide_*, so a guide edit has to land there too. A
-- deliberate denormalisation, not an oversight: the alternative is a join
-- inside two engines that are the paid product, on a page a buyer has already
-- opened. One trigger here is cheaper and far less risky than that.
create or replace function public.tgb_guides_sync_games()
returns trigger language plpgsql as $fn$
begin
  update public.games
     set guide_name       = new.name,
         guide_bio        = new.bio,
         guide_background = new.background,
         guide_image_url  = new.image_url
   where guide_id = new.id;
  return new;
end;
$fn$;

drop trigger if exists guides_sync_games on public.guides;
create trigger guides_sync_games after update on public.guides
  for each row execute function public.tgb_guides_sync_games();

-- And the same push when a GAME is pointed at a different guide.
create or replace function public.tgb_games_pull_guide()
returns trigger language plpgsql as $fn$
declare g public.guides%rowtype;
begin
  if new.guide_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.guide_id is not distinct from old.guide_id then
    return new;
  end if;
  select * into g from public.guides where id = new.guide_id;
  if found then
    new.guide_name       := g.name;
    new.guide_bio        := g.bio;
    new.guide_background := g.background;
    new.guide_image_url  := g.image_url;
  end if;
  return new;
end;
$fn$;

drop trigger if exists games_pull_guide on public.games;
create trigger games_pull_guide before insert or update of guide_id on public.games
  for each row execute function public.tgb_games_pull_guide();

-- The four rescued portraits still point at thegamebureau.com. The Guides page
-- moves them into the guides bucket on the first press of "Host here" - it
-- cannot be done in SQL, because SQL cannot fetch an image.
