const fs = require('fs');
const path = require('path');

const additions = {
  "atlanta": [
    { title: "No Hands", artist: "Waka Flocka Flame", blurb: "Atlanta party-rap chaos with Roscoe Dash and Wale", explicit: true },
    { title: "Laffy Taffy", artist: "D4L", blurb: "Snap-music hit from Atlanta's mid-2000s club wave", explicit: true }
  ],
  "austin": [
    { title: "Texas Flood", artist: "Stevie Ray Vaughan & Double Trouble", blurb: "Austin blues fire from SRV's breakout debut" },
    { title: "If I Had a Boat", artist: "Lyle Lovett", blurb: "Texas songwriter wit with Hill Country dust on it" }
  ],
  "baltimore": [
    { title: "Dance My Pain Away", artist: "Rod Lee", blurb: "Baltimore club's hometown heartbeat" },
    { title: "Wham City", artist: "Dan Deacon", blurb: "DIY Baltimore maximalism turned communal anthem" }
  ],
  "baton-rouge": [
    { title: "Set It Off", artist: "Boosie Badazz", blurb: "Baton Rouge street-rap staple from Boosie's rise", explicit: true },
    { title: "Independent", artist: "Webbie", blurb: "Trill Entertainment's Baton Rouge hit with Lil Boosie", explicit: true }
  ],
  "biloxi": [
    { title: "Ode To Billie Joe", artist: "Bobbie Gentry", blurb: "Mississippi-born storyteller's Southern gothic classic" },
    { title: "Down in Mississippi (Up to No Good)", artist: "Sugarland", blurb: "A mischievous country nod to Mississippi nights" }
  ],
  "boston": [
    { title: "Roadrunner", artist: "The Modern Lovers", blurb: "Jonathan Richman's Massachusetts highway hymn" },
    { title: "The Impression That I Get", artist: "The Mighty Mighty Bosstones", blurb: "Boston ska-core's biggest brass-blasted singalong" }
  ],
  "buffalo": [
    { title: "Because the Night", artist: "10,000 Maniacs", blurb: "Western New York college-rock warmth from Natalie Merchant" },
    { title: "Napoleon", artist: "Ani DiFranco", blurb: "Buffalo folk-punk bite from Righteous Babe Records" }
  ],
  "charlotte": [
    { title: "Carolina Girls", artist: "General Johnson & The Chairmen of the Board", blurb: "Beach-music love letter to the Carolinas" },
    { title: "She Knows", artist: "J. Cole", blurb: "North Carolina rap star with a dark, glossy hit", explicit: true }
  ],
  "chicago": [
    { title: "Lake Shore Drive", artist: "Aliotta Haynes Jeremiah", blurb: "The unofficial cruise-control anthem for Chicago's lakefront" },
    { title: "Hard to Say I'm Sorry", artist: "Chicago", blurb: "Second helping from the band named for the city" }
  ],
  "cincinnati": [
    { title: "Cincinnati, Ohio", artist: "Connie Smith", blurb: "Country postcard carrying the city's name" },
    { title: "Fire", artist: "Ohio Players", blurb: "Ohio funk inferno from just up the road in Dayton" }
  ],
  "cleveland": [
    { title: "Cleveland Is the City", artist: "Bone Thugs-N-Harmony", blurb: "Bone Thugs spelling out hometown pride", explicit: true },
    { title: "Pursuit Of Happiness", artist: "Kid Cudi", blurb: "Cleveland-raised Cudi's lonely-night anthem", explicit: true }
  ],
  "corpus-christi": [
    { title: "No Me Queda Más", artist: "Selena", blurb: "Corpus Christi's queen of Tejano at her most heartbreaking" },
    { title: "Before the Next Teardrop Falls", artist: "Freddy Fender", blurb: "South Texas country-soul crossover from Freddy Fender" }
  ],
  "dallas": [
    { title: "Dallas", artist: "Alan Jackson", blurb: "Country hit name-checking Big D straight from the title" },
    { title: "Possum Kingdom", artist: "Toadies", blurb: "North Texas alt-rock menace from Fort Worth" }
  ],
  "dearborn": [
    { title: "The Tears Of A Clown", artist: "Smokey Robinson & The Miracles", blurb: "Motown genius from the Detroit orbit" },
    { title: "Dancing In The Street", artist: "Martha Reeves & The Vandellas", blurb: "Detroit soul made for a summer city block" }
  ],
  "denver": [
    { title: "Sweet Surrender", artist: "John Denver", blurb: "Another Rocky Mountain-hearted song from the city's namesake" },
    { title: "Ophelia", artist: "The Lumineers", blurb: "Denver folk-pop with a stadium-sized stomp" }
  ],
  "glendale": [
    { title: "Mesa Town", artist: "Authority Zero", blurb: "Arizona punk energy from nearby Mesa" },
    { title: "Pain", artist: "Jimmy Eat World", blurb: "Mesa emo-rock muscle from Arizona favorites" }
  ],
  "green-bay": [
    { title: "Beer Barrel Polka (Roll Out The Barrel)", artist: "Frankie Yankovic", blurb: "Upper Midwest polka spirit for a Wisconsin tailgate" },
    { title: "Jump Around", artist: "House Of Pain", blurb: "Wisconsin sports ritual that belongs in the stadium bag" }
  ],
  "houston": [
    { title: "Savage Remix", artist: "Megan Thee Stallion", blurb: "Houston's Megan links with Beyonce for a hometown flex", explicit: true },
    { title: "25 Lighters", artist: "DJ DMD", blurb: "Houston rap classic with Lil' Keke and Fat Pat", explicit: true }
  ],
  "indianapolis": [
    { title: "Indianapolis", artist: "The Bottle Rockets", blurb: "Alt-country road song stranded right in the title city" },
    { title: "Indiana Wants Me", artist: "R. Dean Taylor", blurb: "Motown-era drama wrapped around Indiana lore" }
  ],
  "jacksonville": [
    { title: "Caught Up In You", artist: ".38 Special", blurb: "Jacksonville southern-rock hooks from Donnie Van Zant's crew" },
    { title: "Fly From The Inside", artist: "Shinedown", blurb: "Jacksonville rock radio grit from Shinedown's debut" }
  ],
  "kansas-city": [
    { title: "Kansas City Stomp", artist: "Jelly Roll Morton", blurb: "Early jazz stride with Kansas City in the title" },
    { title: "Kansas City", artist: "The New Basement Tapes", blurb: "Modern roots-rock spin on the city's musical myth" }
  ],
  "las-vegas": [
    { title: "Vegas Lights", artist: "Panic! At The Disco", blurb: "Local pop-rock flash under casino neon" },
    { title: "Heaven or Las Vegas", artist: "Cocteau Twins", blurb: "Dream-pop shimmer with Vegas right in the clouds" }
  ],
  "london": [
    { title: "London Girl", artist: "The Pogues", blurb: "Pub-rattling London character sketch from the Pogues" },
    { title: "West End Girls", artist: "Pet Shop Boys", blurb: "London synth-pop cool from the West End streets" }
  ],
  "los-angeles": [
    { title: "To Live & Die In L.A.", artist: "2Pac", blurb: "West Coast love letter riding through Los Angeles", explicit: true },
    { title: "Under the Bridge", artist: "Red Hot Chili Peppers", blurb: "L.A. loneliness from one of the city's signature bands" }
  ],
  "madrid": [
    { title: "Madrid", artist: "Leiva", blurb: "Modern Spanish rock with the capital in its bloodstream" },
    { title: "La Puerta de Alcalá", artist: "Ana Belén", blurb: "Classic Madrid landmark anthem from the Movida era" }
  ],
  "melbourne": [
    { title: "Treaty", artist: "Yothu Yindi", blurb: "Australian landmark protest groove for the national mix" },
    { title: "Into My Arms", artist: "Nick Cave & The Bad Seeds", blurb: "Melbourne's dark bard at candlelit piano" }
  ],
  "mexico-city": [
    { title: "México Lindo y Querido", artist: "Vicente Fernández", blurb: "The mariachi standard every Mexican city knows by heart" },
    { title: "El Rey", artist: "José Alfredo Jiménez", blurb: "Ranchera royalty from a songwriter Mexico City embraced" }
  ],
  "milwaukee": [
    { title: "Blister In The Sun", artist: "Violent Femmes", blurb: "Milwaukee's acoustic-punk calling card" },
    { title: "The Finer Things", artist: "Steve Miller Band", blurb: "Milwaukee-born Steve Miller in polished rock form" }
  ],
  "minneapolis": [
    { title: "When Doves Cry", artist: "Prince", blurb: "Minneapolis genius at his starkest and strangest" },
    { title: "Unsatisfied", artist: "The Replacements", blurb: "Twin Cities heartbreak from the Mats" }
  ],
  "mobile": [
    { title: "Sweet Home Alabama", artist: "Lynyrd Skynyrd", blurb: "The state anthem every Alabama mix eventually needs" },
    { title: "Fancy Like", artist: "Walker Hayes", blurb: "Mobile-born country-pop made for a drive-through singalong" }
  ],
  "munich": [
    { title: "Chase", artist: "Giorgio Moroder", blurb: "Munich disco futurism from the synth maestro" },
    { title: "Major Tom", artist: "Peter Schilling", blurb: "German new-wave space drama for the Bavarian tape deck" }
  ],
  "nashville": [
    { title: "Friends In Low Places", artist: "Garth Brooks", blurb: "Nashville singalong royalty from the honky-tonk canon" },
    { title: "I Will Always Love You", artist: "Dolly Parton", blurb: "Dolly's Nashville-written farewell that became immortal" }
  ],
  "new-york": [
    { title: "Walk On the Wild Side", artist: "Lou Reed", blurb: "Downtown New York characters in Lou Reed's deadpan stroll" },
    { title: "Juicy", artist: "The Notorious B.I.G.", blurb: "Brooklyn rise-from-nothing anthem from Biggie", explicit: true }
  ],
  "orchard-park": [
    { title: "Seven Nation Army", artist: "The White Stripes", blurb: "Modern stadium chant fuel for the Orchard Park crowd" },
    { title: "Mr. Brightside", artist: "The Killers", blurb: "A stadium-wide release valve for late-game nerves" }
  ],
  "paris": [
    { title: "Paris", artist: "The Chainsmokers", blurb: "Pop postcard carrying the city name worldwide" },
    { title: "Lisztomania", artist: "Phoenix", blurb: "Parisian indie-pop rush from Versailles-born Phoenix" }
  ],
  "philadelphia": [
    { title: "TSOP (The Sound of Philadelphia)", artist: "MFSB", blurb: "The Philly soul instrumental that says it outright" },
    { title: "Expressway to Your Heart", artist: "The Soul Survivors", blurb: "Blue-eyed Philly soul from the city's sixties scene" }
  ],
  "phoenix": [
    { title: "The Authority Song", artist: "Jimmy Eat World", blurb: "Arizona emo-pop snap from the Mesa mainstays" },
    { title: "Until I Fall Away", artist: "Gin Blossoms", blurb: "Tempe jangle-rock for the desert radio dial" }
  ],
  "pittsburgh": [
    { title: "Mr. Smiley", artist: "The Clarks", blurb: "Pittsburgh bar-band staple with local roots" },
    { title: "Send Me On My Way", artist: "Rusted Root", blurb: "Pittsburgh folk-rock joy that traveled everywhere" }
  ],
  "raleigh": [
    { title: "To Be Young (Is to Be Sad, Is to Be High)", artist: "Ryan Adams", blurb: "North Carolina alt-country restlessness from Ryan Adams" },
    { title: "Me & You & Jackie Mittoo", artist: "Superchunk", blurb: "Chapel Hill indie-rock charge from Merge Records heroes" }
  ],
  "richmond": [
    { title: "Sweet Virginia Breeze", artist: "Robbin Thompson", blurb: "Virginia anthem from Richmond's own Robbin Thompson" },
    { title: "Bottoms Up", artist: "Trey Songz", blurb: "Virginia R&B club hit from Petersburg's Trey Songz", explicit: true }
  ],
  "rio-de-janeiro": [
    { title: "Aquarela do Brasil", artist: "Gal Costa", blurb: "Brazilian standard glowing with Rio-scale grandeur" },
    { title: "Rio de Janeiro Blue", artist: "Randy Crawford", blurb: "Late-night jazz-soul view of Rio's blue horizon" }
  ],
  "sacramento": [
    { title: "Digital Bath", artist: "Deftones", blurb: "Sacramento heaviness turned sleek and hypnotic" },
    { title: "Guillotine", artist: "Death Grips", blurb: "Sacramento noise-rap pressure from Death Grips", explicit: true }
  ],
  "saint-denis": [
    { title: "Seine-Saint-Denis Style", artist: "Suprême NTM", blurb: "93 pride from Saint-Denis-adjacent rap legends", explicit: true },
    { title: "Solaar pleure", artist: "MC Solaar", blurb: "French rap poetics from a master of the Paris banlieues" }
  ],
  "san-antonio": [
    { title: "Wasted Days and Wasted Nights", artist: "Freddy Fender", blurb: "South Texas border-country soul from Freddy Fender" },
    { title: "Mendocino", artist: "Sir Douglas Quintet", blurb: "Doug Sahm's San Antonio-rooted Tex-Mex rock" }
  ],
  "san-diego": [
    { title: "San Diego", artist: "blink-182", blurb: "A direct hometown callback from San Diego's pop-punk kings" },
    { title: "Dare You To Move", artist: "Switchfoot", blurb: "San Diego earnestness built for a sunset drive" }
  ],
  "san-francisco": [
    { title: "San Francisco Days", artist: "Chris Isaak", blurb: "Chris Isaak's moody ode to fog and memory" },
    { title: "White Rabbit", artist: "Jefferson Airplane", blurb: "Haight-Ashbury psychedelia in two-and-a-half minutes" }
  ],
  "san-jose": [
    { title: "Long Train Runnin'", artist: "The Doobie Brothers", blurb: "San Jose band riding a classic rock groove" },
    { title: "La Jaula de Oro", artist: "Los Tigres Del Norte", blurb: "San Jose's norteño giants telling immigrant stories" }
  ],
  "santa-clara": [
    { title: "Tell Me When To Go", artist: "E-40", blurb: "Bay Area hyphy energy for the South Bay mix", explicit: true },
    { title: "Good Riddance (Time of Your Life)", artist: "Green Day", blurb: "East Bay farewell anthem that travels the whole Bay" }
  ],
  "savannah": [
    { title: "Statesboro Blues", artist: "The Allman Brothers Band", blurb: "Georgia blues-rock standard from the Allmans' orbit" },
    { title: "Autumn Leaves", artist: "Nat King Cole", blurb: "Johnny Mercer lyric turned autumn standard" }
  ],
  "seattle": [
    { title: "Jeremy", artist: "Pearl Jam", blurb: "Seattle grunge drama from Pearl Jam's debut" },
    { title: "Man In The Box", artist: "Alice In Chains", blurb: "Another dark Seattle pillar from Alice in Chains" }
  ],
  "shreveport": [
    { title: "Polk Salad Annie", artist: "Tony Joe White", blurb: "Louisiana swamp-rock grit for the Shreveport tape" },
    { title: "Sea of Love", artist: "Phil Phillips", blurb: "Louisiana-born doo-wop romance from the Gulf South" }
  ],
  "st-louis": [
    { title: "St. Louis Blues", artist: "Bessie Smith", blurb: "The immortal blues standard named for the city" },
    { title: "Maybellene", artist: "Chuck Berry", blurb: "More St. Louis rock-and-roll spark from Chuck Berry" }
  ],
  "tampa": [
    { title: "I Won't Back Down", artist: "Tom Petty", blurb: "Florida-born Tom Petty with pure defiant clarity" },
    { title: "Immortal Rites", artist: "Morbid Angel", blurb: "Tampa death-metal roots in their raw early form", explicit: true }
  ],
  "toronto": [
    { title: "Hotline Bling", artist: "Drake", blurb: "Toronto's global superstar in neon late-night mode" },
    { title: "Working Man", artist: "Rush", blurb: "Toronto prog-rock muscle from Rush's early days" }
  ],
  "tucson": [
    { title: "Tucson Train", artist: "Bruce Springsteen", blurb: "A literal Tucson rail song from the Boss" },
    { title: "Across the Wire", artist: "Calexico", blurb: "Borderland desert-noir from Tucson's Calexico" }
  ],
  "tuscaloosa": [
    { title: "Decoration Day", artist: "Drive-By Truckers", blurb: "Alabama-rooted Southern rock storytelling" },
    { title: "Cover Me Up", artist: "Jason Isbell", blurb: "Alabama songwriter grace from Jason Isbell" }
  ],
  "washington-dc": [
    { title: "Chocolate City", artist: "Parliament", blurb: "D.C.'s nickname turned funk-state address" },
    { title: "Pump Me Up", artist: "Trouble Funk", blurb: "Essential go-go drive from a D.C. institution" }
  ],
  "youngstown": [
    { title: "Ohio", artist: "Crosby, Stills, Nash & Young", blurb: "Rust-belt state history in protest-song form" },
    { title: "Gold on the Ceiling", artist: "The Black Keys", blurb: "Akron blues-rock gloss from the Ohio duo" }
  ]
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bthe\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 soundtrack-id-resolver/1.0'
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchTextWithBackoff(url) {
  const waits = [0, 5000, 15000, 30000];
  let lastError = null;
  for (const wait of waits) {
    if (wait) await sleep(wait);
    try {
      return await fetchText(url);
    } catch (error) {
      lastError = error;
      const text = String(error && error.message ? error.message : error);
      if (!/403|429|timeout|fetch failed/i.test(text)) break;
    }
  }
  throw lastError;
}

function parseDdgResults(html) {
  if (!html.includes('<div class="result ')) {
    const markdownBlocks = html.split(/\n##\s+/);
    const markdownResults = [];
    for (const block of markdownBlocks) {
      const ids = [
        ...[...block.matchAll(/open\.spotify\.com%2Ftrack%2F([A-Za-z0-9]{22})/g)].map(match => match[1]),
        ...[...block.matchAll(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/g)].map(match => match[1])
      ];
      for (const id of new Set(ids)) {
        markdownResults.push({ id, text: decodeEntities(block.replace(/\*\*/g, '').replace(/\[[^\]]*\]\([^)]+\)/g, ' ')) });
      }
    }
    return markdownResults;
  }

  const blocks = html.split('<div class="result ');
  const results = [];
  for (const block of blocks) {
    const ids = [...block.matchAll(/open\.spotify\.com%2Ftrack%2F([A-Za-z0-9]{22})/g)].map(match => match[1]);
    if (!ids.length) continue;
    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const text = decodeEntities(`${titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '') : ''} ${snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '') : ''}`);
    for (const id of ids) {
      results.push({ id, text });
    }
  }
  return results;
}

async function resolveTrack(addition) {
  const queries = [
    `Spotify track "${addition.title}" "${addition.artist}"`,
    `site:open.spotify.com/track "${addition.title}" "${addition.artist}"`,
    `Spotify song ${addition.title} ${addition.artist}`
  ];
  const wantedTitle = normalize(addition.title);
  const wantedArtist = normalize(addition.artist);
  const seenIds = new Set();
  const candidates = [];

  for (const query of queries) {
    const url = `https://r.jina.ai/http://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
    const html = await fetchTextWithBackoff(url);
    for (const result of parseDdgResults(html)) {
      if (seenIds.has(result.id)) continue;
      seenIds.add(result.id);
      const normalized = normalize(result.text);
      const titleHit = normalized.includes(wantedTitle) || wantedTitle.includes(normalized.split(' spotify')[0] || 'NOPE');
      const artistHit = normalized.includes(wantedArtist) || wantedArtist.split(' ').every(part => part.length <= 2 || normalized.includes(part));
      candidates.push({ ...result, titleHit, artistHit });
      if (titleHit && artistHit) return { id: result.id, confidence: 'matched-ddg', text: result.text, candidates };
    }
    await sleep(350);
  }

  if (candidates.length) {
    return { id: candidates[0].id, confidence: 'first-result', text: candidates[0].text, candidates };
  }
  return { id: '', confidence: 'unresolved', text: '', candidates };
}

async function verifyOembed(id) {
  if (!id) return null;
  const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${id}`)}`;
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 soundtrack-id-resolver/1.0'
    }
  });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, ...(await response.json()) };
}

async function main() {
  const outputPath = path.join('.codex-artifacts', 'soundtrack-additions-resolved.json');
  const issuesPath = path.join('.codex-artifacts', 'soundtrack-additions-issues.json');
  const resolved = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : {};
  const issues = [];
  let count = 0;
  const total = Object.values(additions).reduce((sum, rows) => sum + rows.length, 0);

  for (const [slug, rows] of Object.entries(additions)) {
    resolved[slug] = resolved[slug] || [];
    for (const row of rows) {
      count += 1;
      const cached = resolved[slug].find(entry => entry.title === row.title && entry.artist === row.artist && entry.spotifyId);
      if (cached) {
        process.stderr.write(`[${count}/${total}] cached ${slug}: ${row.artist} - ${row.title}\n`);
        if (cached.resolveConfidence !== 'matched-ddg') {
          issues.push({ slug, title: row.title, artist: row.artist, spotifyId: cached.spotifyId, confidence: cached.resolveConfidence, spotifyTitle: cached.spotifyTitle, resolvedText: cached.resolvedText });
        }
        continue;
      }
      process.stderr.write(`[${count}/${total}] ${slug}: ${row.artist} - ${row.title}\n`);
      const result = await resolveTrack(row);
      const verify = await verifyOembed(result.id);
      const spotifyTitle = verify && verify.ok ? verify.title : '';
      const titleVerified = spotifyTitle ? normalize(spotifyTitle).includes(normalize(row.title)) || normalize(row.title).includes(normalize(spotifyTitle)) : false;
      const entry = { ...row, spotifyId: result.id, resolveConfidence: result.confidence, resolvedText: result.text, spotifyTitle };
      resolved[slug].push(entry);
      fs.writeFileSync(outputPath, JSON.stringify(resolved, null, 2) + '\n', 'utf8');
      if (!result.id || !verify?.ok || !titleVerified || result.confidence !== 'matched-ddg') {
        issues.push({ slug, title: row.title, artist: row.artist, spotifyId: result.id, confidence: result.confidence, spotifyTitle, resolvedText: result.text });
      }
      await sleep(1800);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(resolved, null, 2) + '\n', 'utf8');
  fs.writeFileSync(issuesPath, JSON.stringify(issues, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ outputPath, issuesPath, total, issueCount: issues.length }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
