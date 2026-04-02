/* â”€â”€ URL PARAMETERS â”€â”€ */
const urlParams = new URLSearchParams(window.location.search);
const GAME_ID = urlParams.get('id') || '';
const SB_CONFIG = {
  enabled: true,
  url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
  key: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3',
  table: 'games'
};

/* â”€â”€ SHUFFLE HELPERS â”€â”€ */
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function seededShuffle(array, prng) {
  let arr = [...array];
  let currentIndex = arr.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(prng() * currentIndex);
    currentIndex--;
    [arr[currentIndex], arr[randomIndex]] = [arr[randomIndex], arr[currentIndex]];
  }
  return arr;
}

/* â”€â”€ UTILITIES â”€â”€ */
const Utils = {
  showToast: (msg, isError = false) => {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show ${isError ? 'error' : ''}`;
    setTimeout(() => el.classList.remove('show'), 3000);
  },
  countVowels: (str) => (str.match(/[aeiou]/gi) || []).length,
  countConsonants: (str) => (str.match(/[^aeiou\s\W\d]/gi) || []).length,
  countLetters: (str) => str.replace(/[^a-zA-Z]/g, '').length,
  hasDoubleLetter: (str) => /([a-zA-Z])\1/i.test(str)
};

const DEFAULT_TEAM_NAMES = [
  "Team One", "Team Two", "Team Three", "Team Four",
  "Team Five", "Team Six", "Team Seven", "Team Eight"
];
const MAX_PLAYERS = 24;
const MAX_TEAMS = 8;

function normalizeTeamNames(names, count = DEFAULT_TEAM_NAMES.length) {
  const limit = Math.max(0, Math.min(DEFAULT_TEAM_NAMES.length, Number(count) || DEFAULT_TEAM_NAMES.length));
  const customNames = Array.isArray(names)
    ? names.map((name) => typeof name === 'string' ? name.trim() : '').filter(Boolean)
    : [];
  const nextNames = customNames.slice(0, limit);
  for (let i = nextNames.length; i < limit; i++) {
    nextNames.push(DEFAULT_TEAM_NAMES[i]);
  }
  return nextNames;
}

function applyConfiguredTheme(colors) {
  const nextColors = colors && typeof colors === 'object' ? colors : {};
  const root = document.documentElement;
  if (!root) return;
  if (nextColors.primary) root.style.setProperty('--primary', nextColors.primary);
  if (nextColors.accent) root.style.setProperty('--accent', nextColors.accent);
  if (nextColors.secondary) root.style.setProperty('--secondary', nextColors.secondary);
  if (nextColors.onSecondary) root.style.setProperty('--on-secondary', nextColors.onSecondary);
}

function applyBrandline(value) {
  const brand = String(value || '').trim() || 'THE GAME BUREAU';
  document.querySelectorAll('[data-brandline]').forEach((node) => {
    node.textContent = brand;
  });
}

async function fetchConfiguredGameSetup(gameId) {
  const targetId = String(gameId || '').trim();
  if (!targetId || !SB_CONFIG.enabled) {
    return { teamNames: [], colors: {} };
  }

  try {
    const requestUrl = new URL(`rest/v1/${SB_CONFIG.table}`, `${SB_CONFIG.url.replace(/\/+$/, '')}/`);
    requestUrl.searchParams.set('select', 'name,primary_color,secondary_color,nodes');
    requestUrl.searchParams.set('id', `eq.${targetId}`);
    requestUrl.searchParams.set('limit', '1');

    const response = await fetch(requestUrl.toString(), {
      cache: 'no-store',
      headers: {
        apikey: SB_CONFIG.key,
        Authorization: `Bearer ${SB_CONFIG.key}`,
        Accept: 'application/json'
      }
    });
    if (!response.ok) return { teamNames: [], colors: {} };

    const rows = await response.json();
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    const nodes = Array.isArray(row && row.nodes) ? row.nodes : [];
    const gameNode = nodes.find((node) => node && node.type === 'game') || null;
    return {
      teamNames: normalizeTeamNames(gameNode && gameNode.teams),
      brandName: gameNode && typeof gameNode.title === 'string' && gameNode.title.trim()
        ? gameNode.title.trim()
        : (row && typeof row.name === 'string' ? row.name.trim() : ''),
      colors: {
        primary: row && typeof row.primary_color === 'string' ? row.primary_color.trim() : '',
        accent: row && typeof row.primary_color === 'string' ? row.primary_color.trim() : '',
        secondary: row && typeof row.secondary_color === 'string' ? row.secondary_color.trim() : '',
        onSecondary: gameNode && typeof gameNode.tertiaryColor === 'string' ? gameNode.tertiaryColor.trim() : ''
      }
    };
  } catch (error) {
    return { teamNames: [], colors: {} };
  }
}

let configuredTeamNames = [];
const configuredTeamNamesPromise = fetchConfiguredGameSetup(GAME_ID).then((setup) => {
  configuredTeamNames = normalizeTeamNames(setup && setup.teamNames);
  applyBrandline(setup && setup.brandName ? setup.brandName : 'THE GAME BUREAU');
  applyConfiguredTheme(setup && setup.colors);
  return configuredTeamNames;
});

function getTeamNames(count) {
  return normalizeTeamNames(configuredTeamNames, count);
}

/* â”€â”€ CUSTOM DRAG & DROP FOR MOBILE/DESKTOP â”€â”€ */
const DND = (() => {
  let activeAvatar = null;
  let initialX, initialY;

  const init = () => {
    document.addEventListener('touchstart', handleStart, {passive: false});
    document.addEventListener('touchmove', handleMove, {passive: false});
    document.addEventListener('touchend', handleEnd);
    
    document.addEventListener('mousedown', handleStart);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
  };

  const getEventXY = (e) => {
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  };

  const handleStart = (e) => {
    if (!e.target.closest('.avatar')) return;
    e.preventDefault(); 
    
    activeAvatar = e.target.closest('.avatar');
    const pos = getEventXY(e);
    const rect = activeAvatar.getBoundingClientRect();
    
    initialX = pos.x - rect.left;
    initialY = pos.y - rect.top;

    activeAvatar.classList.add('is-dragging');
    activeAvatar.style.left = `${pos.x - initialX}px`;
    activeAvatar.style.top = `${pos.y - initialY}px`;
  };

  const handleMove = (e) => {
    if (!activeAvatar) return;
    e.preventDefault(); 
    
    const pos = getEventXY(e);
    activeAvatar.style.left = `${pos.x - initialX}px`;
    activeAvatar.style.top = `${pos.y - initialY}px`;

    document.querySelectorAll('.dropzone').forEach(dz => dz.classList.remove('drag-over'));
    const dropTarget = document.elementFromPoint(pos.x, pos.y);
    const dz = dropTarget ? dropTarget.closest('.dropzone') : null;
    if (dz) dz.classList.add('drag-over');
  };

  const handleEnd = (e) => {
    if (!activeAvatar) return;
    
    let pos;
    if (e.changedTouches && e.changedTouches.length > 0) {
      pos = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    } else {
      pos = { x: e.clientX, y: e.clientY };
    }

    activeAvatar.classList.remove('is-dragging');
    activeAvatar.style.left = '';
    activeAvatar.style.top = '';
    
    document.querySelectorAll('.dropzone').forEach(dz => dz.classList.remove('drag-over'));

    const dropTarget = document.elementFromPoint(pos.x, pos.y);
    const dropzone = dropTarget ? dropTarget.closest('.dropzone') : null;

    if (dropzone) {
      dropzone.appendChild(activeAvatar);
    } else {
      document.getElementById('avatar-pool').appendChild(activeAvatar);
    }

    activeAvatar = null;
    App.checkTeamsReady();
  };

  return { init };
})();

/* â”€â”€ APP STATE & FLOW â”€â”€ */
const App = (() => {
  let playersData = [];
  let playerInputsCount = 0;
  let currentTeamsData = [];
  const addPlayerBtn = document.getElementById('addPlayerBtn');

  const syncAddPlayerButton = () => {
    if (!addPlayerBtn) return;
    const atLimit = playerInputsCount >= MAX_PLAYERS;
    addPlayerBtn.disabled = atLimit;
    addPlayerBtn.textContent = atLimit ? `Player Limit Reached (${MAX_PLAYERS})` : '+ Add Another Player';
  };

  const init = () => {
    document.getElementById('player-inputs').innerHTML = '';
    playerInputsCount = 0;
    for(let i = 0; i < 4; i++) {
      addPlayerInput();
    }
    syncAddPlayerButton();
    DND.init(); 
  };

  const playGame = () => {
    const target = new URL('../play.html', window.location.href);
    if (GAME_ID) target.searchParams.set('id', GAME_ID);
    if (Array.isArray(currentTeamsData) && currentTeamsData.length) {
      target.searchParams.set('teams', JSON.stringify(currentTeamsData.map((team) => ({
        name: team && team.name ? String(team.name) : '',
        players: Array.isArray(team && team.members) ? team.members.map((member) => String(member)) : []
      }))));
    }
    window.location.href = target.toString();
  };

  const addPlayerInput = () => {
    if (playerInputsCount >= MAX_PLAYERS) {
      syncAddPlayerButton();
      Utils.showToast(`You can add up to ${MAX_PLAYERS} players.`, true);
      return;
    }
    playerInputsCount++;
    const div = document.createElement('div');
    div.className = 'input-group';
    div.innerHTML = `<input type="text" id="p-${playerInputsCount}" placeholder="First Last" autocomplete="off">`;
    document.getElementById('player-inputs').appendChild(div);
    syncAddPlayerButton();
  };

  const processPlayers = async () => {
    let players = [];
    let enteredNames = new Set();
    let hasError = false;

    for (let i = 1; i <= playerInputsCount; i++) {
      let inputEl = document.getElementById(`p-${i}`);
      if (!inputEl) continue;
      
      let val = inputEl.value.trim();
      if (!val) continue;

      let normalized = val.toLowerCase().replace(/\s+/g, ' ');
      if (val.indexOf(' ') === -1) {
        Utils.showToast("Names must include a space.", true);
        hasError = true; break;
      }
      if (enteredNames.has(normalized)) {
        Utils.showToast("All names must be unique.", true);
        hasError = true; break;
      }
      
      enteredNames.add(normalized);
      let parts = val.split(/\s+/);
      players.push({
        fullName: val,
        first: parts[0].toLowerCase(),
        last: parts.slice(1).join(' ').toLowerCase(),
        letters: Utils.countLetters(val),
        vowels: Utils.countVowels(val),
        cons: Utils.countConsonants(val),
        double: Utils.hasDoubleLetter(val)
      });
    }

    if (hasError) return;
    
    if (players.length < 1) {
      Utils.showToast("Please enter at least 1 player.", true);
      return;
    }

    playersData = players;
    await configuredTeamNamesPromise;

    // 1 PLAYER: SKIP EVERYTHING
    if (players.length === 1) {
      document.getElementById('view-players').classList.add('hidden');
      document.getElementById('view-results').classList.remove('hidden');
      document.getElementById('results-text').textContent = "Playing solo? We've generated a team name just for you.";

      let teamName = getTeamNames(1)[0];
      currentTeamsData = [{
        name: teamName,
        members: [playersData[0].fullName]
      }];

      let container = document.getElementById('results-container');
      container.innerHTML = `<div class="solved-row">${teamName} <span>${playersData[0].fullName}</span></div>`;
    } 
    // >= 2 PLAYERS: GO TO HEADCOUNTS
    else {
      setupTeamBuilder(players.length);
    }
  };

  const setupTeamBuilder = (count) => {
    document.getElementById('view-players').classList.add('hidden');
    document.getElementById('view-teams').classList.remove('hidden');

    const pool = document.getElementById('avatar-pool');
    pool.innerHTML = '';
    
    const meepleSVG = `<svg viewBox="0 0 24 24" style="width:100%; height:100%; fill:var(--secondary);"><path d="M12,2 A4,4 0 0,0 8,6 C8,8.2 9.8,10 12,10 C14.2,10 16,8.2 16,6 A4,4 0 0,0 12,2 M8.2,12 C5.4,13.5 4,15.6 4,18 L4,22 L20,22 L20,18 C20,15.6 18.6,13.5 15.8,12 C14.6,12.8 13.3,13.2 12,13.2 C10.7,13.2 9.4,12.8 8.2,12 Z"/></svg>`;
    
    for(let i=0; i<count; i++) {
      let avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.innerHTML = meepleSVG;
      pool.appendChild(avatar);
    }

    const zonesContainer = document.getElementById('team-dropzones');
    zonesContainer.innerHTML = '';
    
    const teamCount = Math.min(count, MAX_TEAMS);
    let teamNames = getTeamNames(teamCount);
    
    for(let i=0; i<teamCount; i++) {
      let name = teamNames[i] || DEFAULT_TEAM_NAMES[i] || `Team ${i+1}`;
      let dz = document.createElement('div');
      dz.className = 'dropzone';
      dz.dataset.team = name;
      dz.innerHTML = `<div class="team-box-title">${name}</div>`;
      zonesContainer.appendChild(dz);
    }
  };

  const checkTeamsReady = () => {
    const pool = document.getElementById('avatar-pool');
    const btn = document.getElementById('btn-start-cipher');
    if (pool.children.length === 0) {
      btn.disabled = false;
    } else {
      btn.disabled = true;
    }
  };

  const generateCipher = () => {
    let teamSizes = [];
    let teamNames = [];
    
    document.querySelectorAll('#team-dropzones .dropzone').forEach(dz => {
      let avatarsInZone = dz.querySelectorAll('.avatar').length;
      if (avatarsInZone > 0) {
        teamSizes.push(avatarsInZone);
        teamNames.push(dz.dataset.team);
      }
    });

    if (teamSizes.length === 0) return;

    let nameStrings = playersData.map(p => p.fullName.toLowerCase().replace(/\s/g, ''));
    nameStrings.sort();
    let sizeString = teamSizes.join('-');
    let cipherPrng = mulberry32(cyrb53(nameStrings.join('|') + '|' + sizeString));

    let shuffledPlayers = seededShuffle(playersData, cipherPrng);
    let teamsData = [];
    let pIndex = 0;

    const globals = {
      maxLen: Math.max(...playersData.map(p => p.letters)),
      minLen: Math.min(...playersData.map(p => p.letters)),
      maxVow: Math.max(...playersData.map(p => p.vowels)),
      maxCons: Math.max(...playersData.map(p => p.cons))
    };

    const tieCounts = {
      maxLen: playersData.filter(p => p.letters === globals.maxLen).length,
      minLen: playersData.filter(p => p.letters === globals.minLen).length,
      maxVow: playersData.filter(p => p.vowels === globals.maxVow).length
    };

    teamSizes.forEach((size, i) => {
      let teamMembers = shuffledPlayers.slice(pIndex, pIndex + size);
      pIndex += size;

      let totVowels = 0, totCons = 0;
      let groupTraits = [];
      let isSolo = size === 1;

      teamMembers.forEach(p => {
        totVowels += p.vowels;
        totCons += p.cons;
        
        if (p.letters === globals.maxLen) {
            if (isSolo) groupTraits.push(tieCounts.maxLen > 1 ? "is tied for the longest name" : "has the longest name");
            else groupTraits.push(tieCounts.maxLen > 1 ? "someone tied for the longest name" : "someone with the longest name");
        }
        if (p.letters === globals.minLen) {
            if (isSolo) groupTraits.push(tieCounts.minLen > 1 ? "is tied for the shortest name" : "has the shortest name");
            else groupTraits.push(tieCounts.minLen > 1 ? "someone tied for the shortest name" : "someone with the shortest name");
        }
        if (p.vowels === globals.maxVow) {
            if (isSolo) groupTraits.push(tieCounts.maxVow > 1 ? "is tied for the most vowels" : "has the most vowels");
            else groupTraits.push(tieCounts.maxVow > 1 ? "someone tied for the most vowels" : "someone with the most vowels");
        }
        if (p.double) {
            if (isSolo) groupTraits.push("has a double-letter in their name");
            else groupTraits.push("someone with a double-letter in their name");
        }
      });

      groupTraits = [...new Set(groupTraits)];
      
      let clueText = "";
      if (isSolo) {
          let traitStr = groupTraits.length > 0 ? `This person ${groupTraits.join(", and ")}. ` : "";
          clueText = `${traitStr}They have exactly ${totVowels} vowels and ${totCons} consonants in their name.`;
      } else {
          let traitStr = groupTraits.length > 0 ? `This group contains ${groupTraits.join(", and ")}. ` : "";
          clueText = `${traitStr}Combined, they have exactly ${totVowels} vowels and ${totCons} consonants in their names.`;
      }

      teamsData.push({
        id: `team-${i}`,
        name: teamNames[i],
        members: teamMembers.map(m => m.fullName),
        clue: clueText
      });
    });
    currentTeamsData = teamsData.map((team) => ({
      name: team.name,
      members: [...team.members]
    }));

    let maxTeamSize = Math.max(...teamSizes);
    if (maxTeamSize <= 1 || teamSizes.length === 1) {
      document.getElementById('view-teams').classList.add('hidden');
      document.getElementById('view-results').classList.remove('hidden');
      
      let skipMessage = teamSizes.length === 1 
        ? "Since everyone is on the same team, we've skipped the cipher. Here is your team!" 
        : "Since no team has more than one player, we've skipped the cipher. Here are your teams!";
        
      document.getElementById('results-text').textContent = skipMessage;
      
      let container = document.getElementById('results-container');
      container.innerHTML = teamsData.map(t => `
        <div class="solved-row">${t.name} <span>${t.members.join(' â€¢ ')}</span></div>
      `).join('');
      return;
    }

    document.getElementById('view-teams').classList.add('hidden');
    document.getElementById('view-game').classList.remove('hidden');
    Game.init(teamsData, playersData.map(p => p.fullName));
  };

  init();

  return { addPlayerInput, processPlayers, checkTeamsReady, generateCipher, playGame };
})();

/* â”€â”€ GAME LOGIC â”€â”€ */
const Game = (() => {
  let TEAMS = [], ALL_NAMES = [], selected = new Set(), solved = new Set();

  const init = (teamsData, namesList) => {
    TEAMS = teamsData;
    
    let nameStrings = namesList.map(n => n.toLowerCase().replace(/\s/g, ''));
    nameStrings.sort();
    let boardPrng = mulberry32(cyrb53(nameStrings.join('|') + '|board'));
    ALL_NAMES = seededShuffle(namesList, boardPrng);
    
    render();
  };

  const render = () => {
    document.getElementById('clues-container').innerHTML = TEAMS.map(t => `
      <div class="clue-block ${solved.has(t.id) ? 'solved' : ''}">
        <div class="clue-title">${t.name} (${t.members.length})</div>
        <div class="clue-text">${t.clue}</div>
      </div>
    `).join('');

    let remaining = ALL_NAMES.filter(n => !TEAMS.find(t => solved.has(t.id) && t.members.includes(n)));
    document.getElementById('names-grid').innerHTML = remaining.map(name => {
      let isSel = selected.has(name);
      return `
        <div class="card ${isSel ? 'selected' : ''}" onclick="Game.toggle('${name.replace(/'/g,"\\'")}')" id="card-${name.replace(/\s/g,'')}">
          ${name}
        </div>
      `;
    }).join('');

    let btn = document.getElementById('btn-submit');
    if (solved.size === TEAMS.length) {
      btn.textContent = "PLAY";
      btn.disabled = false;
      btn.onclick = () => App.playGame();
    } else {
      btn.textContent = "SUBMIT GUESS";
      btn.disabled = selected.size === 0;
      btn.onclick = () => Game.submit();
    }
  };

  const toggle = (name) => {
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    render();
  };

  const submit = () => {
    let guess = [...selected];
    
    let matchedTeam = TEAMS.find(t => !solved.has(t.id) && 
      t.members.length === guess.length && 
      t.members.every(m => guess.includes(m))
    );

    if (matchedTeam) {
      solved.add(matchedTeam.id);
      selected.clear();
      
      let row = document.createElement('div');
      row.className = 'solved-row';
      row.innerHTML = `${matchedTeam.name} <span>${matchedTeam.members.join(' â€¢ ')}</span>`;
      document.getElementById('solved-container').appendChild(row);
      
      render();
      if (solved.size === TEAMS.length) Utils.showToast("All groups found!");
      else Utils.showToast("Correct!");

    } else {
      guess.forEach(n => {
        let el = document.getElementById(`card-${n.replace(/\s/g,'')}`);
        if(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
      });
      Utils.showToast("Incorrect Grouping", true);
    }
  };

  return { init, toggle, submit };
})();
