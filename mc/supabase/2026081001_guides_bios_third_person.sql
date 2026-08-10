-- 2026081001_guides_bios_third_person.sql
--
-- NOT A MIGRATION. Run this once, by hand, in the Supabase SQL editor. It is
-- filed here rather than in migrations/ deliberately: it edits CONTENT, not
-- schema, and it addresses rows by id. A database rebuilt from migrations/
-- alone holds only the 34 seeded guides, so half of these ids would not exist
-- and the statements would quietly update nothing. Applying it there would
-- look like it worked and would not have.
--
-- WHAT IT DOES, to all 39 rows in public.guides:
--
--   1. EVERY BIO IS THIRD PERSON. The table had three voices in it - 19 rows
--      in first person ("I am a third-generation dairy-equipment mechanic"),
--      13 in third, 7 in neither - which meant the same field read as a
--      different kind of writing depending on which guide a player drew.
--      Third person throughout, matching the 13 rows already written that way.
--
--   2. EVERY BIO NOW SAYS WHY THEY ARE GUIDING NOW, and no two say the same
--      thing. A retired bridge inspector and a retired auction caller are both
--      "retired", and if that is the whole reason then the catalogue has one
--      character in it wearing 39 hats. So each one has its own: a season that
--      goes quiet, a job that got automated out from under them, a surgery, a
--      daughter who took the shop, a bet, a habit they could not stop. The
--      reason is the part of a bio a player actually remembers, because it is
--      the only part that is about them rather than about their old job.
--
-- THE NAME STAYS OUT OF THE BIO. That is the standing rule for this field -
-- the player is told the guide's name by the game, and a bio that repeats it
-- reads as a caption. Each one therefore opens on the role, which is also what
-- the third-person rows already did.
--
-- Dollar quotes throughout: these are prose, prose has apostrophes, and one
-- unescaped one would take the whole script down.
--
-- updated_at is set explicitly rather than left to a trigger, so a row this
-- touched is distinguishable afterwards from one it did not.

begin;

-- #2 Alan Smithee | Los Angeles, California
update public.guides set bio = $g$The credited director of Maniac Cop III: Badge of Silence, The Shrimp on the Barbie, and every other picture nobody else would put their name on. The residuals stopped arriving in 1994, and a walking tour is the only production left where he cannot be replaced in the third week.$g$, updated_at = now() where id = 2;

-- #5 Cass Mercer | Atlanta, Georgia
update public.guides set bio = $g$An Atlanta falconer who reads bridges, alleys and river bends the way she reads a flight path, and calls the route from somewhere above the fray. She walks people through the moulting season, when the birds are grounded and she is not, and she has found she cannot go back to a quiet August.$g$, updated_at = now() where id = 5;

-- #8 David Hennessy | New Orleans, Louisiana
update public.guides set bio = $g$Police chief of New Orleans from 1888 until he was shot on his own street in 1890, and by some accounts still working the case. He has no other appointments and no intention of accepting any; he walks the route he was walking that night, and he would rather have company on it.$g$, updated_at = now() where id = 8;

-- #12 Hank Houndstooth | Tuscaloosa, Alabama
update public.guides set bio = $g$A fifty-year-old crimson-banded houndstooth fedora, left on a Tuscaloosa barstool in January of 1973 and never carried home the same way. Half a century of borrowed heads taught him every crooked block in town, and he agreed to this only because he has finally found a head he trusts.$g$, updated_at = now() where id = 12;

-- #17 Nigel Pritchard | Birmingham, United Kingdom
update public.guides set bio = $g$A failed rhythm guitarist from Birmingham who spent thirty years as a tour manager, rescuing musicians from missed trains, unpaid bar tabs and decisions made after midnight. He has quit all that to sell Lucky Dogs on Bourbon Street; the job is walking people around until somebody convinces him that managing them is still the least disastrous option available.$g$, updated_at = now() where id = 17;

-- #32 The Wagonmaster | Buffalo, New York
update public.guides set bio = $g$A lifelong Bills Mafia road warrior out of South Buffalo who has followed the team into every hostile stadium in the league. He first called a route for a friend's nephew who had never seen a strange city on foot, discovered he was better at it than at tailgating, and has not stopped since. Circle the wagons and follow his lead.$g$, updated_at = now() where id = 32;

-- #35 Papa Gris Gris | New Orleans, Louisiana
update public.guides set bio = $g$An old New Orleans piano man and root-worker who learned the city from second lines, river fog and back rooms where the real music still breathes. The room he played four nights a week closed and was reopened as something with a cocktail menu, so his evenings are free and his stories have nowhere else to go.$g$, updated_at = now() where id = 35;

-- #36 Lenora Vale | Chicago, Illinois
update public.guides set bio = $g$An overnight radio traffic reporter out of Chicago for twenty-two years, which taught her to find movement inside a mess and trouble before it arrives. Management replaced the local reporters with an automated feed; she still knows where the city is about to snarl, and she would rather say it to somebody than to nobody.$g$, updated_at = now() where id = 36;

-- #37 Imani Greaves | Miami, Florida
update public.guides set bio = $g$A Miami marine electrician, raised where saltwater gets into everything eventually, who can trace a hidden fault without tearing the whole vessel apart. Hurricane season empties the charter docks and the work with it, so from June she walks people around instead — and she takes the same approach to a city that she takes to a bad circuit.$g$, updated_at = now() where id = 37;

-- #38 Roxanne Tijerina | Dallas, Texas
update public.guides set bio = $g$A Dallas high-school drill-team director for thirty years, retired, who knows exactly how much ground one person covers when the count is right. Nobody has needed her cadence since the last squad graduated, and it turns out she is not built to keep a count to herself. Chin level, shoulders loose; spectacle is optional, precision is not.$g$, updated_at = now() where id = 38;

-- #39 Tamsin Rainier | Seattle, Washington
update public.guides set bio = $g$A former Seattle ferry dispatcher who does not confuse poor visibility with a lack of direction. A hearing injury moved her off the radio and into a back room repairing navigation instruments, and her audiologist's advice was to spend time in noise she chooses — so she chose streets, and people, and weather.$g$, updated_at = now() where id = 39;

-- #40 Arlo Vanden Berg | Green Bay, Wisconsin
update public.guides set bio = $g$A third-generation dairy-equipment mechanic out of Green Bay who has spent his life making stubborn machinery cooperate before sunrise. A milking schedule leaves a man free from nine until four with nowhere to be, and he decided that was a waste of a good part of the day.$g$, updated_at = now() where id = 40;

-- #41 Otis Bellweather | Baltimore, Maryland
update public.guides set bio = $g$A Baltimore courthouse clock keeper of forty years, who has learned that people reveal themselves by what they do when they think nobody is counting. A judge he had known most of that time asked him to show a visiting delegation the building; word travelled, and he has been walking strangers around the city ever since.$g$, updated_at = now() where id = 41;

-- #42 Marlene Krawczyk | Pittsburgh, Pennsylvania
update public.guides set bio = $g$A retired Pittsburgh bridge inspector of thirty-four years who trusts rivets, load limits and people who look where they are stepping. She never stopped walking the spans on her own time and photographing bad drainage nobody had asked her about, until somebody pointed out she could be paid to walk and talk at once.$g$, updated_at = now() where id = 42;

-- #43 Deacon Rusk | Kansas City, Missouri
update public.guides set bio = $g$A Kansas City livestock auction caller for forty years, which is forty years of separating real value from noise delivered at high speed. Vocal-cord surgery ended the calling and left him under orders to speak slowly for the first time in his life — and this is the only job he has found that suits the new voice.$g$, updated_at = now() where id = 43;

-- #44 Calvin Mordecai Pike | Cleveland, Ohio
update public.guides set bio = $g$A Cleveland funeral-home organist, for whom silence has paid the bills longer than music ever did. Most services play recordings now, which has left him with every weekday afternoon and an unusual willingness to stand still in a place until it says something.$g$, updated_at = now() where id = 44;

-- #45 Bernice "Birdie" LaFleur | Detroit, Michigan
update public.guides set bio = $g$A Detroit auto-upholstery cutter, retired, who can tell cheap construction by the way it puckers at the corners. Her hands gave out before her eyes did, and pointing at what is well made turns out to pay better than complaining about what is not. Anything made well leaves evidence.$g$, updated_at = now() where id = 45;

-- #46 Rosalie Quattrone | Philadelphia, Pennsylvania
update public.guides set bio = $g$Thirty-one years in a Philadelphia token booth, making change for people who never once said thank you, and raised over her aunt's bakery before that. The booths were abolished and she took the buyout, and what she missed was not the work but the window — six inches of scratched plexiglass with the whole city going past it. Walk on her left; she hears better on that side.$g$, updated_at = now() where id = 46;

-- #47 Isaiah Tolliver | Cincinnati, Ohio
update public.guides set bio = $g$A bridge painter, twenty-nine years old and four hundred feet up over the Ohio River in a harness, unreasonably happy about it. Nobody paints steel in a Cincinnati winter, so from November he is on the ground and looking for something to do with his mouth. If he gets loud, that is just the job talking.$g$, updated_at = now() where id = 47;

-- #48 Yusra Warsame | Minneapolis, Minnesota
update public.guides set bio = $g$A Minneapolis bicycle mechanic who owns her shop and has somehow never been busier in a city that spends five months frozen. This is the January-to-March job that keeps the lights on in the shop, and she is not remotely embarrassed about it. Tell her if you get cold and she will pretend to be sympathetic.$g$, updated_at = now() where id = 48;

-- #49 Hollis Yarrow | Denver, Colorado
update public.guides set bio = $g$An avalanche forecaster in the mountains above Denver, which mostly means digging holes and staring at layers of ice deciding what they intend to do. There is no snowpack to read between May and October, and a summer of her own company was an experiment she does not care to repeat. If she stops talking and looks at the sky, give her a second.$g$, updated_at = now() where id = 49;

-- #50 Verna Sligh | Las Vegas, Nevada
update public.guides set bio = $g$Born in Las Vegas in 1950, in a hospital, to two parents who worked there — which apparently makes her a rumour — and twenty-nine years carrying drinks and running keno on graveyard shifts. Everyone she came up with has died or moved to Henderson, and she does this because somebody who was actually there should be saying it out loud. Nothing you do today will surprise her, and she means that as a comfort.$g$, updated_at = now() where id = 50;

-- #51 Osvaldo Rendon-Pena | Tampa, Florida
update public.guides set bio = $g$A Tampa harbour tug and salvage captain, descended from a great-grandmother who rolled cigars in Ybor City and a father who pushed boats around the bay for thirty years. His crew has heard every story he owns twice, and he has reached the age where an audience is worth going out of his way for. He gossips like it is a paid position, which it now technically is.$g$, updated_at = now() where id = 51;

-- #52 Curtis Vandiver Boyle | Nashville, Tennessee
update public.guides set bio = $g$Thirty-one years reading water meters in Nashville, which means standing in the backyard of about half that city and being barked at by most of the dogs. The meters transmit by radio now and the route he walked for three decades is read from an office, so he walks it for people instead. No, he does not play anything, and he has never written a song.$g$, updated_at = now() where id = 52;

-- #53 Nadia Farrokhzad | Houston, Texas
update public.guides set bio = $g$A Houston petroleum engineer who went to law school at night out of pure spite and now argues about pipelines for a living. She does this on Saturdays because a week of adversarial email leaves her wanting to talk about something she actually loves, and her parents arrived in that city in 1979 and never once considered leaving. Interrupt her freely; she does not lose her place.$g$, updated_at = now() where id = 53;

-- #54 Teddy Kavanagh | Boston, Massachusetts
update public.guides set bio = $g$Twenty-two years working underwater for the Boston water system, in tunnels where you cannot see your own glove in front of your face. His ears ended the diving early, and walking is the only way left to show anybody the city he actually knows — the one underneath the postcard. Ask him anything twice if you need to; he does not mind repeating himself.$g$, updated_at = now() where id = 54;

-- #55 Ephraim Doggett | Charlotte, North Carolina
update public.guides set bio = $g$Nineteen seasons changing right-side tires on a Charlotte race team, where the whole job came down to about thirteen seconds at a time, then twenty more running a brake shop off a service road. He sold the shop, retired properly, and lasted four months before he came looking for something with a clock in it. He counts things; a man who does not count gets run over.$g$, updated_at = now() where id = 55;

-- #56 Gideon "Gid" Finch | Portland, Maine
update public.guides set bio = $g$A former tugboat deckhand and third-generation wooden boat builder out of Portland, thirty years of reading tides and fixing diesel injectors with copper wire. Nobody has commissioned a wooden hull from him in two years, so the shop time goes into this now — walking with people who want to notice how a place is actually put together.$g$, updated_at = now() where id = 56;

-- #57 Marcus "Mac" Thorne | Washington, D.C.
update public.guides set bio = $g$A transit bus operator out of Anacostia for thirty-two years, who knew every pothole, corner and regular rider by name. The pension arrived and the route did not go anywhere — he still drives it in his head every morning — so he took to walking it at street level with anybody willing to hear how the city really runs.$g$, updated_at = now() where id = 57;

-- #58 Dwight "Ironhead" Miller | Oakland, California
update public.guides set bio = $g$A retired longshoreman out of East Oakland, thirty-five years loading container ships on the estuary docks and running youth sports on the side. The team left town and took his Sundays with it, so he found another way to spend them and another set of people to be loud in front of. He values hard labour and straight talk, in that order.$g$, updated_at = now() where id = 58;

-- #59 Darrell "Tank" Vance | Indianapolis, Indiana
update public.guides set bio = $g$A diesel mechanic from the west side of Indianapolis, thirty years over an engine pit at a freight terminal before turning to custom metal fabrication. The fabrication work dries up once race season ends, and a man with a quiet autumn and a loud opinion about how things are built may as well be paid for both.$g$, updated_at = now() where id = 59;

-- #60 Delores "Dee" Pickens | Jacksonville, Florida
update public.guides set bio = $g$A shrimp boat captain out of Mayport for twenty-five years, now running a dockside bait shack where the St. Johns meets the Atlantic. She sold the trawler and found the bait trade leaves the middle of the day empty, which is more free time than a person like her should be given. Tides and cities both shift when you least expect it.$g$, updated_at = now() where id = 60;

-- #61 Harry "Cap" Compagno | San Francisco, California
update public.guides set bio = $g$A dockyard crane operator who spent twenty-eight years lifting the heavy iron of the Port of San Francisco, third generation out of the Mission. She corrected a tour guide out loud on Embarcadero, at volume, in front of his whole group — and was offered the work on the spot. She has been calling out phony veneer professionally ever since.$g$, updated_at = now() where id = 61;

-- #62 Roy "Big Tex" Sterling | San Antonio, Texas
update public.guides set bio = $g$Thirty-six years hauling cattle rigs across the Southwest out of San Antonio, and a backyard smoker pit since. His back retired from the long hauls before the rest of him was ready, and he found he still needed the miles — so he takes them a few at a time, on foot, at a talking pace.$g$, updated_at = now() where id = 62;

-- #63 Hector "El Martillo" Valenzuela | San Diego, California
update public.guides set bio = $g$Thirty years running a custom auto paint and collision shop in Barrio Logan, famous for metalflake finishes you could read a newspaper in. He signed the shop over to his daughter, who told him plainly to get out from under the Coronado Bridge and go find something else to look at closely. He points out the care and craft hidden in plain sight.$g$, updated_at = now() where id = 63;

-- #64 Ray "Cobalt" Mendoza | Phoenix, Arizona
update public.guides set bio = $g$A commercial electrician out of South Phoenix, thirty-five years wiring high-rises and stadium lighting rigs across the Valley. Nobody sane works a Phoenix afternoon between June and September, and a man whose whole trade is finished by ten in the morning has to put the rest of the day somewhere. He guides with an electrician's ear for hidden spark and strain.$g$, updated_at = now() where id = 64;

-- #65 Clint "Mule" Callahan | St. Louis, Missouri
update public.guides set bio = $g$Thirty-two years on the copper kettles and high-pressure steam lines at a South St. Louis brewery. The crew was cut to a third, the severance ran out well before the pension starts, and it turns out a man who can read a brick wall the way he reads a weld is worth something on a sidewalk. He will show you what lasts and what is only painted over.$g$, updated_at = now() where id = 65;

-- #66 Sal "The Wrench" DeMarco | New York, New York
update public.guides set bio = $g$Thirty-four years of night shifts for the Department of Sanitation out of Howard Beach, Queens, ending as a garage supervisor. He took this up for one reason, and it is daylight — three decades of going to work at eleven at night left him owed a few afternoons. He will tell you unvarnished truths about how city systems actually run.$g$, updated_at = now() where id = 66;

-- #67 Joanie "Switch" Kaczmarek | Chicago, Illinois
update public.guides set bio = $g$Thirty-one years working the night shift in Chicago railroad switch towers, where hesitation freezes faster than sidewalk slush. Three decades of nights left her unable to sleep when normal people do, and she decided a city at odd hours is more interesting than a ceiling. Keep your eyes up and stay close enough to hear her when something is about to change tracks.$g$, updated_at = now() where id = 67;

commit;

-- Check afterwards. Every row should come back stamped today, and no bio
-- should open with "I ".
--
--   select count(*) filter (where updated_at::date = current_date) as touched,
--          count(*) filter (where bio ~ '^\s*I[ '']')             as still_first_person,
--          count(*)                                               as rows
--   from public.guides;
