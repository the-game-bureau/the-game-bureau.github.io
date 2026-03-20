
// ══════════════════════════════════════════════════════════════════════════════
// THE GAME BUREAU — GAME BUILDER
// ══════════════════════════════════════════════════════════════════════════════
//
// What this file is:
//   A local-only admin tool for building SMS-based scavenger hunt / walking tour
//   games on The Game Bureau platform.
//
// How it works:
//   This page is served from the /games/private/ directory and requires a local
//   Node.js server (server.js, typically at localhost:3000) to be running.
//   The server exposes POST /games and POST /stops endpoints that write directly
//   to games.json and stops.json in the repository.  The "Publish" button calls
//   POST /publish which runs a git commit + push to deploy to GitHub Pages.
//
// How it fits into the project:
//   - games.json   — catalog of all game metadata (name, id, tags, images, etc.)
//   - stops.json   — all stops across all games (messages, reply logic, routing)
//   - go.html      — the public player page, reads from the JSON files at runtime
//   - play.html    — alternate player entry point
//
// Panels (left → right):
//   1. Games        — list of all games; click to select, right-click for actions
//   2. Game Details — edit metadata for the selected game
//   3. Game Stop Order (Map) — drag-and-drop stop ordering within a game route
//   4. Stops        — master list of all stops; drag to reorder or into the route
//   5. Stop Details — bubble editor for the selected stop's messages and replies
//
// NOTE: This file should NOT be opened directly via the filesystem (file://).
//   Always open it through the local dev server so API calls succeed.
// ══════════════════════════════════════════════════════════════════════════════

// Detect whether we are running locally so we can show/enable the API and Publish button.
// When deployed to GitHub Pages IS_LOCAL will be false and the builder is inaccessible.
const IS_LOCAL = ['localhost','127.0.0.1'].includes(location.hostname);
const API = IS_LOCAL ? 'http://localhost:3000' : null;
// Base URL for shareable player links shown in the Game Details panel
const SHARE_BASE       = 'https://the-game-bureau.github.io/the-game-bureau/play/game.html?id=';
const SHARE_BASE_LOCAL = 'http://localhost:3000/play/game.html?id=';
// Preset genre/category tags that appear as pills in the game details form
const ALL_TAGS = ['Mystery','Puzzle','SMS','Walking Tour','Sports','History','Food','Adventure','Family','Conspiracy','Trivia','Horror','Romance','Comedy','Music','Culture','Night Life','City Tour','Scavenger Hunt','New Orleans'];

// ══ STATE VARIABLES ══════════════════════════════════════════════════════════
let games = [];            // Full array of game objects loaded from /games (games.json)
let selectedIndex = -1;   // Index into `games` of the currently selected game (-1 = none)
let selectedStopIndex = -1; // Index into `state.stops` of the currently selected stop (-1 = none)
let selectedTags = new Set(); // Tags that are toggled ON for the currently selected game
let isNew = false;         // True when a new game form is open but not yet saved
let allTags = [...ALL_TAGS]; // Working tag list — extended when the user adds a custom tag
let gamesDirty = false;    // True when game route data changed outside the active game form and still needs saving

// ══════════════════════════════════════════════
// BUBBLE EDITOR — DATA / CONSTANTS
// ══════════════════════════════════════════════

// Skeleton structure written to stops.json when none exists yet
const DEFAULT_DOC = {
  _comment:'File: stops.json | Purpose: Source-of-truth game stops data.',
  header:{title:'Scavenger Hunt',subtitle:'Mission Control',logoUrl:'logo.png',logoAlt:'Game Logo',faviconUrl:'index.ico',pageTitle:'WALKING TOUR'},
  variables:[],routes:[],stops:[]
};
// Random reply suggestions auto-filled into new correct/incorrect reply bubbles
const CORRECT_BUBBLE_SUGGESTIONS=['Correct. Nice work.','Great answer. Moving on.','You got it.','Perfect. Next clue unlocked.','Exactly right.','Right on target.','Nice catch. Continue.','That is correct.','Excellent. Proceed.','Yes. Keep going.'];
const INCORRECT_BUBBLE_SUGGESTIONS=['Not quite. Try again.','Close, but not correct.','Incorrect. Give it another shot.','That answer does not match.','Nope. Try a different answer.','Almost. Re-read the clue.','Not yet. Check your spelling.','That is not the one.','Incorrect. One more try.','Try again before moving on.'];
// Attach builder runtime options to the default doc header so they persist in stops.json
DEFAULT_DOC.header.builderOptions={typingDelay:600,bubblePause:150,defaultPlaceholder:'Type here...',correctReplies:CORRECT_BUBBLE_SUGGESTIONS.slice(),incorrectReplies:INCORRECT_BUBBLE_SUGGESTIONS.slice()};

let bubbleIdCounter = 1;          // Monotonic counter used when creating stable bubble IDs
let state = Object.assign({}, DEFAULT_DOC, { stops: [] }); // Live in-memory document — mirrors what will be written to stops.json
let loadedStopsSnapshot = null;   // Deep-clone of state at last save; compared against current state to detect unsaved changes
let copiedStop = null;            // Holds a deep-cloned stop object for copy/paste (currently unused in UI but wired up)
let undoDeleteTimer = null, deletedStopUndo = null; // Timer handle and saved stop object for the 5-second undo toast
let isNewStop = false;            // True while a stop has been created locally but not yet saved to the server

// ══ STATUS BAR HELPERS ════════════════════════════════════════════════════════

// Sets the stop-details status bar text and color class (ok / warn / err)
function setStatus(msg, type) {
  const el = document.getElementById('sd-status');
  if(!el) return;
  el.textContent = msg;
  // Normalise 'error' → 'err' to match the CSS class names
  el.className = 'status-bar' + (type ? ' ' + (type === 'error' ? 'err' : type) : '');
}
let _flashTimer = null;
// Displays a status message that automatically clears after `ms` milliseconds
function flashStatus(msg, type, ms) {
  if(_flashTimer) clearTimeout(_flashTimer);
  setStatus(msg, type || 'ok');
  _flashTimer = setTimeout(() => { setStatus(''); _flashTimer = null; }, ms || 2000);
}
// Returns an array of stop IDs that appear more than once (case-insensitive)
function findDuplicates(values){const seen=new Set(),dupes=new Set();values.forEach(v=>{if(seen.has(v))dupes.add(v);else seen.add(v);});return Array.from(dupes);}
// Collects all data-integrity warnings for the current stop set (duplicate IDs, multiple CTAs)
function getValidationWarnings(){const warnings=[];const snp=state.stops.map(s=>String((s&&s.id)||'').trim()).filter(Boolean).map(name=>({raw:name,key:name.toLowerCase()}));const dupKeys=findDuplicates(snp.map(p=>p.key));if(dupKeys.length){const dn=dupKeys.map(k=>{const f=snp.find(p=>p.key===k);return f?f.raw:k;});warnings.push('Two stops cannot have the same name: '+dn.join(', '));}state.stops.forEach(stop=>{const cc=Array.isArray(stop.messages)?stop.messages.filter(b=>b&&b.callToAction).length:0;if(cc>1)warnings.push('Stop \u201c'+stop.id+'\u201d has '+cc+' call-to-action bubbles \u2014 only one is allowed per stop.');});return warnings;}
// Re-renders the yellow warning banner above the stop detail panel; hides it when there are no warnings
function renderWarnings(){const el=document.getElementById('s-warnings');if(!el)return[];const w=getValidationWarnings();if(!w.length){el.style.display='none';el.innerHTML='';return w;}el.style.display='';el.innerHTML='<strong>Validation Warnings</strong><ul>'+w.map(x=>'<li>'+x+'</li>').join('')+'</ul>';return w;}

// ══════════════════════════════════════════════
// BUBBLE EDITOR — UTILITIES
// ══════════════════════════════════════════════

// Simple deep-clone via JSON round-trip (safe for plain data objects with no functions/Date)
function deepClone(v) { return JSON.parse(JSON.stringify(v)); }
// Splits a textarea value into an array of answers, accepting newline, comma, or semicolon separators
function parseAnswers(text) { return String(text||'').split(/\n|,|;/g).map(s=>s.trim()).filter(Boolean); }
// Normalises a string for loose answer matching (lowercase, strip punctuation and whitespace)
function norm(s) { return String(s||'').toLowerCase().replace(/[$,.\s]/g,''); }
// Converts an answers array back to a newline-separated string for textarea display
function answersToText(arr) { return Array.isArray(arr) ? arr.join('\n') : ''; }
// Picks a random item from a suggestion list; returns empty string if the list is empty
function pickRandomSuggestion(list) { if(!Array.isArray(list)||!list.length)return''; return list[Math.floor(Math.random()*list.length)]; }
// Resizes a textarea to fit its content, respecting any CSS min-height
function autoSizeTextarea(el) { if(!el)return; const m=parseInt((window.getComputedStyle(el).minHeight||'0').replace('px',''),10)||0; el.style.height='auto'; el.style.height=Math.max(el.scrollHeight,m)+'px'; }
// Wires up auto-resize on input events and performs an initial resize after the next paint
function bindAutoSizeTextarea(el) { if(!el)return; el.addEventListener('input',()=>autoSizeTextarea(el)); requestAnimationFrame(()=>autoSizeTextarea(el)); }
// Generates a stable, unique bubble ID using timestamp + monotonic counter
function createBubbleId() { return 'bubble_'+Date.now().toString(36)+'_'+(bubbleIdCounter++); }
// Ensures a bubble object has a bubbleId, creating one if missing; returns the ID string
function ensureBubbleId(bubble) { if(!bubble||typeof bubble!=='object')return''; if(!String(bubble.bubbleId||'').trim())bubble.bubbleId=createBubbleId(); return String(bubble.bubbleId); }
// Strips HTML tags from bubble content for use in plain-text previews
function stripHtmlPreview(text) { return String(text||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
// Replaces all bubbleIds in a stop's messages array with fresh IDs (used after copy/paste)
function reseedStopBubbleIds(stop) { if(!stop||!Array.isArray(stop.messages))return; stop.messages.forEach(b=>{if(!b||typeof b!=='object')return; b.bubbleId=createBubbleId();}); }
// WeakMap-based UID for DOM key tracking — avoids mutating bubble objects with transient display IDs
const bubbleUidMap=new WeakMap(); let bubbleUidCounter=1;
// Returns a stable render-time UID for a bubble object without touching the object's own properties
function getBubbleUid(bubble) { if(!bubble||typeof bubble!=='object')return'bubble-0'; let id=bubbleUidMap.get(bubble); if(!id){id='bubble-'+(bubbleUidCounter++);bubbleUidMap.set(bubble,id);} return id; }
// Converts arbitrary text into a safe JS variable key name, falling back to `fallback`
function toVarKey(text,fallback) { const c=String(text||'').replace(/[^\w]+/g,'_').replace(/^_+|_+$/g,''); return c||String(fallback||'playerAnswer'); }
// Ensures state.header.builderOptions is present and fully populated with defaults
function ensureBuilderOptionsHeader(h) { if(!h||typeof h!=='object')return DEFAULT_DOC.header.builderOptions; if(!h.builderOptions||typeof h.builderOptions!=='object')h.builderOptions={}; const bo=h.builderOptions; if(typeof bo.typingDelay!=='number')bo.typingDelay=600; if(typeof bo.bubblePause!=='number')bo.bubblePause=150; if(typeof bo.defaultPlaceholder!=='string')bo.defaultPlaceholder='Type here...'; if(!Array.isArray(bo.correctReplies))bo.correctReplies=CORRECT_BUBBLE_SUGGESTIONS.slice(); if(!Array.isArray(bo.incorrectReplies))bo.incorrectReplies=INCORRECT_BUBBLE_SUGGESTIONS.slice(); return bo; }
// Returns the configured correct-reply suggestion list, falling back to the built-in defaults
function getCorrectReplySuggestions() { const opts=ensureBuilderOptionsHeader(state.header),list=(opts.correctReplies||[]).map(x=>String(x).trim()).filter(Boolean); return list.length?list:CORRECT_BUBBLE_SUGGESTIONS; }
// Returns the configured incorrect-reply suggestion list, falling back to the built-in defaults
function getIncorrectReplySuggestions() { const opts=ensureBuilderOptionsHeader(state.header),list=(opts.incorrectReplies||[]).map(x=>String(x).trim()).filter(Boolean); return list.length?list:INCORRECT_BUBBLE_SUGGESTIONS; }
// Scans all stops and bubbles for storesAs values and returns a deduplicated list of variable names
function getCurrentVariableNames() { const nv=raw=>{const s=String(raw||'').trim(),w=s.match(/^\{\{\s*([A-Za-z_]\w*)\s*\}\}$|^\{\s*([A-Za-z_]\w*)\s*\}$/);return w?(w[1]||w[2]):s;}; const names=[]; (state.stops||[]).forEach(stop=>{const key=nv((stop&&stop.playerReply&&stop.playerReply.storesAs)||''); if(key)names.push(key); (Array.isArray(stop&&stop.messages)?stop.messages:[]).forEach(b=>{const bk=nv((b&&b.storesAs)||''); if(bk)names.push(bk);}); }); return Array.from(new Set(names)); }
// (no-op — variable hints removed)
function getHtmlVariableHintText() { return ''; }
function updateHtmlVariableHints() {}
function createHtmlVariableHint() { return document.createDocumentFragment(); }

// ══════════════════════════════════════════════
// BUBBLE EDITOR — ENSURE FUNCTIONS
// ══════════════════════════════════════════════
// These functions normalise raw JSON data into the exact shape the editor expects,
// filling in defaults and coercing stale field names from older stops.json formats.

// Normalises a single bubble object, coercing unknown replyExpected / msgType values to safe defaults.
// Also back-fills callToAction=true whenever a bubble expects a reply (covers the legacy `red`/`cmd` fields).
function ensureBubble(b) {
  if(!b||typeof b!=='object')return{bubbleId:createBubbleId(),html:'',callToAction:false,forAnswer:'',placeholder:'',bottomAdded:false,msgType:'text',src:'',alt:'',label:'',href:'',replyExpected:'no',answers:[],replyCorrect:'',replyIncorrect:'',storesAs:'',replyResponse:'',fromPlayer:false};
  const re=['no','word','any','multi'].includes(String(b.replyExpected||'no').toLowerCase())?String(b.replyExpected||'no').toLowerCase():'no';
  const mt=['text','image','video','button','pay'].includes(String(b.msgType||'text').toLowerCase())?String(b.msgType||'text').toLowerCase():'text';
  return{bubbleId:String(b.bubbleId||createBubbleId()),html:String(b.html??b.text??''),callToAction:re!=='no'?true:!!(b.callToAction||b.red||b.cmd),forAnswer:String(b.forAnswer||''),placeholder:String(b.placeholder||''),bottomAdded:!!b.bottomAdded,msgType:mt,src:String(b.src||''),alt:String(b.alt||''),label:String(b.label||''),href:String(b.href||''),replyExpected:re,answers:Array.isArray(b.answers)?b.answers.map(String):[],replyCorrect:String(b.replyCorrect||''),replyIncorrect:String(b.replyIncorrect||''),storesAs:String(b.storesAs||''),replyResponse:String(b.replyResponse||''),fromPlayer:!!(b.fromPlayer||b.direction==='fromPlayer')};
}
// Normalises a playerReply object; also handles the legacy `action` field name.
// For 'any' reply type, preserves storesAs so the player's answer can be used in later bubbles.
function ensurePlayerReply(r) {
  if(!r||typeof r!=='object')return{type:'text',placeholder:'',answers:[],setsTeam:false,goTo:'',correct:[],incorrect:[]};
  const allBubbles=arr=>Array.isArray(arr)?arr.map(ensureBubble):[];
  const type=r.type==='any'?'any':'text';
  const base={type,correct:allBubbles(r.correct),incorrect:allBubbles(r.incorrect)};
  if(type==='any'){base.placeholder=String(r.placeholder||'');base.storesAs=String(r.storesAs||'');return base;}
  base.placeholder=String(r.placeholder||'');base.answers=Array.isArray(r.answers)?r.answers.map(x=>String(x)):[];base.setsTeam=!!r.setsTeam;base.anytime=!!r.anytime;base.goTo=String(r.goTo||'');return base;
}
function isPlayerBubble(bubble) {
  return !!(bubble && (bubble.fromPlayer || bubble.direction === 'fromPlayer'));
}
function createSimpleMessageBubble(src, fromPlayer) {
  const bubble=ensureBubble(src||null);
  bubble.html=String((src&&(src.html??src.text))??bubble.html??'');
  bubble.callToAction=false;
  bubble.forAnswer='';
  bubble.placeholder='';
  bubble.bottomAdded=false;
  bubble.msgType='text';
  bubble.src='';
  bubble.alt='';
  bubble.label='';
  bubble.href='';
  bubble.replyExpected='no';
  bubble.answers=[];
  bubble.replyCorrect='';
  bubble.replyIncorrect='';
  bubble.storesAs='';
  bubble.replyResponse='';
  bubble.fromPlayer=!!fromPlayer;
  delete bubble.direction;
  return bubble;
}
function deriveOutgoingBubble(stop) {
  const pr=(stop&&stop.playerReply)||(stop&&stop.action)||null;
  const prompt=(Array.isArray(stop&&stop.messages)?stop.messages:Array.isArray(stop&&stop.reveal)?stop.reveal:[]).find(b=>b&&!isPlayerBubble(b)&&['word','any','branch'].includes(String(b.replyExpected||'').toLowerCase()));
  if(prompt&&String(prompt.html??prompt.text??'').trim())return prompt;
  if(pr&&Array.isArray(pr.correct)&&pr.correct.length)return pr.correct[0];
  if(prompt&&typeof prompt.replyResponse==='string'&&prompt.replyResponse.trim())return { html:prompt.replyResponse };
  if(prompt&&typeof prompt.replyCorrect==='string'&&prompt.replyCorrect.trim())return { html:prompt.replyCorrect };
  return null;
}
function deriveIncomingBubble(stop) {
  const pr=(stop&&stop.playerReply)||(stop&&stop.action)||null;
  if(pr&&Array.isArray(pr.answers)&&pr.answers.length)return { html:String(pr.answers[0]||''), fromPlayer:true };
  if(pr&&typeof pr.playerText==='string'&&pr.playerText.trim())return { html:String(pr.playerText), fromPlayer:true };
  if(pr&&pr.type==='button'&&typeof pr.text==='string'&&pr.text.trim())return { html:String(pr.playerText||pr.text), fromPlayer:true };
  const prompt=(Array.isArray(stop&&stop.messages)?stop.messages:Array.isArray(stop&&stop.reveal)?stop.reveal:[]).find(b=>b&&['word','any','branch'].includes(String(b.replyExpected||'').toLowerCase()));
  if(prompt&&Array.isArray(prompt.answers)&&prompt.answers.length)return { html:String(prompt.answers[0]||''), fromPlayer:true };
  return null;
}
function finalizeSimpleMessageGroup(group) {
  const firstRole=(group&&Array.isArray(group.order)&&group.order[0]==='trigger')?'trigger':'outgoing';
  const outgoingBubble=createSimpleMessageBubble(group&&group.outgoing,false);
  const triggerBubble=createSimpleMessageBubble(group&&group.trigger,true);
  return firstRole==='trigger'?[triggerBubble,outgoingBubble]:[outgoingBubble,triggerBubble];
}
function createEmptySimpleMessageGroup(triggerFirst) {
  return finalizeSimpleMessageGroup({order:[triggerFirst?'trigger':'outgoing'],outgoing:null,trigger:null});
}
function flattenSimpleMessageGroups(groups) {
  return Array.isArray(groups)?groups.reduce((all,group)=>all.concat(Array.isArray(group)?group:[]),[]):[];
}
function buildSimpleStopMessageGroups(stop) {
  const msgs=Array.isArray(stop&&stop.messages)?stop.messages:Array.isArray(stop&&stop.reveal)?stop.reveal:[];
  const groups=[];
  let pending=null;
  const flushPending=()=>{if(!pending)return;groups.push(finalizeSimpleMessageGroup(pending));pending=null;};
  msgs.forEach(src=>{
    if(!src||typeof src!=='object')return;
    const role=isPlayerBubble(src)?'trigger':'outgoing';
    if(!pending){
      pending={order:[role],outgoing:null,trigger:null};
      pending[role]=src;
      return;
    }
    if(!pending[role]){
      pending[role]=src;
      pending.order.push(role);
      flushPending();
      return;
    }
    flushPending();
    pending={order:[role],outgoing:null,trigger:null};
    pending[role]=src;
  });
  flushPending();
  if(!groups.length){
    const derivedOutgoing=deriveOutgoingBubble(stop);
    const derivedTrigger=deriveIncomingBubble(stop);
    groups.push(finalizeSimpleMessageGroup({
      order:[derivedTrigger&&!derivedOutgoing?'trigger':'outgoing'],
      outgoing:derivedOutgoing,
      trigger:derivedTrigger
    }));
  }
  return groups.length?groups:[createEmptySimpleMessageGroup(false)];
}
function normalizeSimpleStopMessages(stop) {
  const groups=buildSimpleStopMessageGroups(stop);
  stop.messages=flattenSimpleMessageGroups(groups);
  stop.playerReply=ensurePlayerReply(null);
  return groups;
}
// Normalises a stop; also supports the legacy `reveal` field (old name for `messages`)
function ensureStop(s,i) {
  const stop={id:String((s&&s.id)||('stop-'+(i+1))),name:String((s&&s.name)||''),messages:Array.isArray(s&&s.messages)?s.messages.map(ensureBubble):Array.isArray(s&&s.reveal)?s.reveal.map(ensureBubble):[],playerReply:ensurePlayerReply((s&&s.playerReply)||(s&&s.action)||null),archived:!!(s&&s.archived),createdAt:(s&&s.createdAt)||null,updatedAt:(s&&s.updatedAt)||null};
  normalizeSimpleStopMessages(stop);
  return stop;
}
// Validates and normalises a full stops.json document object into the shape the editor requires
function ensureDoc(doc) {
  if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new Error('Top-level JSON must be an object.');
  const out=deepClone(DEFAULT_DOC);
  if(doc.header&&typeof doc.header==='object')out.header=Object.assign({},out.header,doc.header);
  if(!Array.isArray(doc.stops))throw new Error('Missing "stops" array.');
  out.stops=doc.stops.map(ensureStop);
  if(Array.isArray(doc.variables))out.variables=deepClone(doc.variables);
  if(Array.isArray(doc.routes))out.routes=deepClone(doc.routes);
  if(typeof doc._comment==='string')out._comment=doc._comment;
  return out;
}

// ══════════════════════════════════════════════
// BUBBLE EDITOR — STOP HELPERS
// ══════════════════════════════════════════════

// Finds the next available auto-increment number for a NEW-N stop ID (skips over any already in use)
function nextStopNumber() { const ex=new Set(state.stops.map(s=>String(s.id||'').toUpperCase())); let n=state.stops.length+1; while(ex.has('NEW-'+n))n++; return n; }
// Creates a blank stop with one MSG GROUP.
function createEmptyStop() { const now=new Date().toISOString(); return{id:'NEW-'+nextStopNumber(),name:'',messages:flattenSimpleMessageGroups([createEmptySimpleMessageGroup(false)]),playerReply:ensurePlayerReply(null),createdAt:now,updatedAt:now}; }
// Returns the reply-type label and CSS class for a stop's colored badge in the stops list
function getReplyTag(stop) {
  const pr=stop&&stop.playerReply;
  if(!pr)return{label:'NOREPLY',cls:'reply-tag-noreply'};
  if(pr.anytime)return{label:'ANYTIME',cls:'reply-tag-anytime'};
  if(pr.type==='any')return{label:'ANYREPLY',cls:'reply-tag-anyreply'};
  if(pr.type==='multi')return{label:'CHOICEREPLY',cls:'reply-tag-choicereply'};
  if(pr.type==='text'&&Array.isArray(pr.answers)&&pr.answers.length)return{label:'WORDREPLY',cls:'reply-tag-wordreply'};
  return{label:'NOREPLY',cls:'reply-tag-noreply'};
}
// True if the stop has at least one bubble marked as a call-to-action (red outline)
function hasCallToActionBubble(stop){return!!(stop&&Array.isArray(stop.messages)&&stop.messages.some(b=>b&&b.callToAction));}
// True if the stop has any bubble sent from the player direction (legacy data check)
function hasFromPlayerBubble(stop){return!!(stop&&Array.isArray(stop.messages)&&stop.messages.some(b=>b&&b.direction==='fromPlayer'));}
// Sets the playerReply type on a stop, initialising all required sub-arrays; for 'any' type,
// auto-generates a storesAs variable name from the stop ID if one hasn't been set yet
function setPlayerReplyType(stop,nextType){if(!stop)return;if(!stop.playerReply||typeof stop.playerReply!=='object')stop.playerReply=ensurePlayerReply(null);stop.playerReply.type=nextType==='any'?'any':'text';if(!Array.isArray(stop.playerReply.answers))stop.playerReply.answers=[];if(!Array.isArray(stop.playerReply.correct))stop.playerReply.correct=[];if(!Array.isArray(stop.playerReply.incorrect))stop.playerReply.incorrect=[];if(typeof stop.playerReply.storesAs!=='string')stop.playerReply.storesAs='';if(typeof stop.playerReply.placeholder!=='string')stop.playerReply.placeholder='';if(stop.playerReply.type==='any'&&!String(stop.playerReply.storesAs||'').trim())stop.playerReply.storesAs=toVarKey(stop.id+'_incoming','playerAnswer');}
// Ensures a stop has at least one correct and (optionally) one incorrect reply bubble,
// seeding them with random suggestion text if the arrays are empty
function ensureReplyScaffoldForCallToAction(stop,options){const opts=options||{},inc=opts.includeIncorrect!==false;if(!stop||!stop.playerReply||typeof stop.playerReply!=='object')stop.playerReply={type:'text',placeholder:'',answers:[],setsTeam:false,goTo:'',correct:[],incorrect:[]};if(!Array.isArray(stop.playerReply.correct))stop.playerReply.correct=[];if(!Array.isArray(stop.playerReply.incorrect))stop.playerReply.incorrect=[];if(!stop.playerReply.correct.length)stop.playerReply.correct.push({html:pickRandomSuggestion(getCorrectReplySuggestions()),callToAction:false,forAnswer:''});if(inc&&!stop.playerReply.incorrect.length)stop.playerReply.incorrect.push({html:pickRandomSuggestion(getIncorrectReplySuggestions()),callToAction:true,forAnswer:''});}

// ══════════════════════════════════════════════
// BUBBLE EDITOR — toDoc / dirty
// ══════════════════════════════════════════════

// Serialises the current in-memory `state` into the exact JSON shape written to stops.json.
// Only includes variables/routes arrays when they are non-empty to keep the file clean.
function toDoc() {
  const doc={_comment:state._comment||DEFAULT_DOC._comment,header:Object.assign({},DEFAULT_DOC.header,state.header||{}),stops:state.stops.map((s,i)=>{const n=ensureStop(s,i);const out={id:n.id,messages:n.messages,playerReply:n.playerReply,archived:n.archived};if(n.name)out.name=n.name;if(n.createdAt)out.createdAt=n.createdAt;if(n.updatedAt)out.updatedAt=n.updatedAt;return out;})};
  if(Array.isArray(state.variables)&&state.variables.length)doc.variables=deepClone(state.variables);
  if(Array.isArray(state.routes)&&state.routes.length)doc.routes=deepClone(state.routes);
  // Keep pageTitle in sync with the header title so the player tab reads correctly
  doc.header.pageTitle=doc.header.title||'';
  return doc;
}
// Compares two document objects by their JSON representation (order-sensitive)
function docsEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
// Returns true if the current state differs from the last-saved snapshot.
// `loadedStopsSnapshot` is null on first load, so we treat that as clean until the user edits.
function isDirty(){if(!loadedStopsSnapshot)return false;return!docsEqual(toDoc(),loadedStopsSnapshot);}
// Called after any edit to re-evaluate and show/hide the UNSAVED badge
function markDirty(){renderDirtyBadge();}
// Toggles the UNSAVED badge visibility based on whether isDirty() is true
function renderDirtyBadge(){const badge=document.getElementById('s-dirtyBadge');if(!badge)return;badge.classList.toggle('visible',isDirty());}

// ══════════════════════════════════════════════
// BUBBLE EDITOR — UNDO TOAST
// ══════════════════════════════════════════════

// Shows the "Stop deleted. Undo" toast and stores the deleted stop so it can be restored.
// Auto-dismisses after 5 seconds if the user does not click Undo.
function showUndoToast(stopObj,index){deletedStopUndo={stop:stopObj,index};if(undoDeleteTimer)clearTimeout(undoDeleteTimer);const toast=document.getElementById('s-undoToast');if(toast)toast.style.display='flex';undoDeleteTimer=setTimeout(dismissUndoToast,5000);}
// Clears the undo state and hides the toast (called on dismiss or after the timer fires)
function dismissUndoToast(){if(undoDeleteTimer){clearTimeout(undoDeleteTimer);undoDeleteTimer=null;}deletedStopUndo=null;const toast=document.getElementById('s-undoToast');if(toast)toast.style.display='none';}

document.getElementById('s-undoDeleteBtn').addEventListener('click', () => {
  if(!deletedStopUndo) return;
  const {stop, index} = deletedStopUndo;
  // Re-insert the stop at its original position so the list order is preserved
  state.stops.splice(index, 0, stop);
  selectedStopIndex = index;
  dismissUndoToast();
  s_renderAll();
});

// ══════════════════════════════════════════════
// BUBBLE EDITOR — RENDER BUBBLES
// ══════════════════════════════════════════════

// Converts a YouTube watch/short/embed URL into a canonical embed URL; returns null for non-YouTube URLs
function getYouTubeEmbedUrl(src){const s=String(src||'').trim(),short=s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);if(short)return'https://www.youtube.com/embed/'+short[1];const watch=s.match(/[?&]v=([A-Za-z0-9_-]{11})/);if(watch)return'https://www.youtube.com/embed/'+watch[1];const embed=s.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/);if(embed)return'https://www.youtube.com/embed/'+embed[1];return null;}
// Generates the HTML string stored in bubble.html based on the bubble's msgType and media fields.
// Called whenever a media field changes so the stored HTML stays in sync with the form inputs.
function generateBubbleHtml(bubble){const t=bubble.msgType||'text';if(t==='image')return'<img src="'+(bubble.src||'').replace(/"/g,'&quot;')+'" alt="'+(bubble.alt||'').replace(/"/g,'&quot;')+'" style="max-width:100%;">';if(t==='video'){const yt=getYouTubeEmbedUrl(bubble.src||'');if(yt)return'<iframe src="'+yt.replace(/"/g,'&quot;')+'" frameborder="0" allowfullscreen style="width:100%;aspect-ratio:16/9;display:block;"></iframe>';return'<video src="'+(bubble.src||'').replace(/"/g,'&quot;')+'" controls style="max-width:100%;"></video>';}if(t==='button')return'<a href="'+(bubble.href||'#').replace(/"/g,'&quot;')+'" class="action-btn">'+(bubble.label||'Button')+'</a>';if(t==='pay')return'<a href="'+(bubble.href||'#').replace(/"/g,'&quot;')+'" class="action-btn pay-btn">'+(bubble.label||'CLICK HERE TO BUY')+'</a>';return bubble.html||'';}

// Renders an array of bubble objects into `container` as interactive editor cards.
// `listKey` controls which suggestion set to use ('messages', 'correct', or 'incorrect').
// `stopRef` is the parent stop object, needed so remove buttons can splice from the right array.
function renderBubbles(container, bubbles, listKey, stopRef) {
  container.innerHTML=''; container.classList.add('bubble-list');
  bubbles.forEach((bubble, idx) => {
    const bubbleId=ensureBubbleId(bubble);
    if(!String(bubble.html||'').trim()){const sugg=listKey==='correct'?getCorrectReplySuggestions():listKey==='incorrect'?getIncorrectReplySuggestions():null;if(sugg&&sugg.length)bubble.html=pickRandomSuggestion(sugg);}
    const wrap=document.createElement('div');
    const isMessages=listKey==='messages',msgType=isMessages?(bubble.msgType||'text'):null;
    const replyMode=String((bubble&&bubble.replyExpected)||'no').toLowerCase(),bubbleNeedsReply=replyMode==='word'||replyMode==='any';
    wrap.className='bubble'+(isMessages&&bubbleNeedsReply?' cta-bubble':''); wrap.dataset.bubbleId=bubbleId;
    if(isMessages){const dl=document.createElement('div');dl.className='bubble-details-label';dl.textContent='BUBBLE DETAILS';wrap.appendChild(dl);}
    const topRow=document.createElement('div'); topRow.className='bubble-top';
    const removeBtn=document.createElement('button'); removeBtn.type='button'; removeBtn.className='stop-action stop-delete bubble-remove'; removeBtn.title='REMOVE';
    removeBtn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><rect x="6" y="6" width="12" height="14" rx="2" ry="2"/><path d="M10 10v7"/><path d="M14 10v7"/></svg>';
    topRow.appendChild(removeBtn); wrap.appendChild(topRow);
    if(isMessages){
      const typeRow=document.createElement('div'); typeRow.className='bubble-type-row';
      const bubbleUid=bubbleId||getBubbleUid(bubble),radioName='msgtype-'+bubbleUid;
      ['text','image','video','button','pay'].forEach(t=>{const rid=radioName+'-'+t;const radio=document.createElement('input');radio.type='radio';radio.name=radioName;radio.value=t;radio.id=rid;radio.checked=t===msgType;const rl=document.createElement('label');rl.htmlFor=rid;rl.textContent=t;const p=document.createElement('span');p.className='type-pair';p.appendChild(radio);p.appendChild(rl);typeRow.appendChild(p);});
      wrap.appendChild(typeRow);
      const sections={
        text:(()=>{const d=document.createElement('div');d.className='msg-type-section';d.dataset.type='text';if(msgType!=='text')d.style.display='none';const ta=document.createElement('textarea');ta.className='bubble-html-input';ta.value=String(bubble.html||'');const shell=document.createElement('div');shell.className='bubble-html-shell';shell.appendChild(ta);d.appendChild(shell);d.appendChild(createHtmlVariableHint());bindAutoSizeTextarea(ta);return d;})(),
        image:(()=>{const d=document.createElement('div');d.className='msg-type-section';d.dataset.type='image';if(msgType!=='image')d.style.display='none';d.innerHTML='<label>Image URL</label><input type="text" class="bubble-src-input" placeholder="https://..." value="'+String(bubble.src||'').replace(/"/g,'&quot;')+'"><label>Alt text</label><input type="text" class="bubble-alt-input" placeholder="description" value="'+String(bubble.alt||'').replace(/"/g,'&quot;')+'">';return d;})(),
        video:(()=>{const d=document.createElement('div');d.className='msg-type-section';d.dataset.type='video';if(msgType!=='video')d.style.display='none';d.innerHTML='<label>Video URL</label><input type="text" class="bubble-src-input" placeholder="https://www.youtube.com/watch?v=..." value="'+String(bubble.src||'').replace(/"/g,'&quot;')+'">';return d;})(),
        button:(()=>{const d=document.createElement('div');d.className='msg-type-section';d.dataset.type='button';if(msgType!=='button')d.style.display='none';d.innerHTML='<label>Button label</label><input type="text" class="bubble-label-input" placeholder="Click here" value="'+String(bubble.label||'').replace(/"/g,'&quot;')+'"><label>Link (href)</label><input type="text" class="bubble-href-input" placeholder="https://..." value="'+String(bubble.href||'').replace(/"/g,'&quot;')+'">';return d;})(),
        pay:(()=>{const d=document.createElement('div');d.className='msg-type-section';d.dataset.type='pay';if(msgType!=='pay')d.style.display='none';d.innerHTML='<label>Pay button label</label><input type="text" class="bubble-label-input" placeholder="CLICK HERE TO BUY" value="'+String(bubble.label||'').replace(/"/g,'&quot;')+'"><label>Product link</label><input type="text" class="bubble-href-input" placeholder="https://..." value="'+String(bubble.href||'').replace(/"/g,'&quot;')+'">';return d;})()
      };
      Object.values(sections).forEach(s=>wrap.appendChild(s));
      const applyVisualType=()=>{wrap.classList.toggle('photo-bubble',(bubble.msgType||'text')==='image');wrap.classList.toggle('cta-bubble',(bubble.replyExpected||'no')!=='no');};
      applyVisualType();
      typeRow.querySelectorAll('input[type="radio"]').forEach(radio=>{radio.addEventListener('change',e=>{bubble.msgType=e.target.value;wrap.querySelectorAll('.msg-type-section').forEach(s=>s.style.display=s.dataset.type===e.target.value?'':'none');bubble.html=generateBubbleHtml(bubble);applyVisualType();});});
      const replyExpected=bubble.replyExpected||'no',replySection=document.createElement('div');replySection.className='bubble-reply-section';
      const replyLbl=document.createElement('div');replyLbl.className='bubble-details-label bubble-reply-label';replyLbl.textContent='REPLY EXPECTED';replySection.appendChild(replyLbl);
      const replyRow=document.createElement('div');replyRow.className='bubble-type-row';const rName='reply-'+bubbleUid;
      ['no','word','any','multi'].forEach(val=>{const rid=rName+'-'+val;const r=document.createElement('input');r.type='radio';r.name=rName;r.value=val;r.id=rid;r.checked=replyExpected===val;const rl=document.createElement('label');rl.htmlFor=rid;rl.textContent=val.toUpperCase();const p=document.createElement('span');p.className='type-pair';p.appendChild(r);p.appendChild(rl);replyRow.appendChild(p);});
      replySection.appendChild(replyRow);
      const mkLbl=t=>{const l=document.createElement('label');l.textContent=t;return l;};
      const mkTA=(val,onChange)=>{const ta=document.createElement('textarea');ta.value=val;ta.addEventListener('input',e=>onChange(e.target.value));return ta;};
      const mkInput=(val,ph,onChange)=>{const inp=document.createElement('input');inp.type='text';inp.value=val;inp.placeholder=ph;inp.addEventListener('input',e=>onChange(e.target.value));return inp;};
      const wordFields=document.createElement('div');wordFields.className='reply-fields';wordFields.style.display=replyExpected==='word'?'':'none';
      const wPh=mkInput(bubble.placeholder||'',ensureBuilderOptionsHeader(state.header).defaultPlaceholder||'Type here...',v=>{bubble.placeholder=v;});
      const wAnswers=mkTA(answersToText(bubble.answers||[]),v=>{bubble.answers=parseAnswers(v);});wAnswers.className='bubble-answer-input';wAnswers.placeholder='One per line or use ; separator';
      const wAnswersShell=document.createElement('div');wAnswersShell.className='bubble-answer-shell';wAnswersShell.appendChild(wAnswers);
      const wAnswersStage=document.createElement('div');wAnswersStage.className='bubble-chat-stage';wAnswersStage.appendChild(wAnswersShell);bindAutoSizeTextarea(wAnswers);
      if(!String(bubble.replyCorrect||'').trim())bubble.replyCorrect=pickRandomSuggestion(getCorrectReplySuggestions());
      if(!String(bubble.replyIncorrect||'').trim())bubble.replyIncorrect=pickRandomSuggestion(getIncorrectReplySuggestions());
      const wCorrect=mkTA(bubble.replyCorrect||'',v=>{bubble.replyCorrect=v;});
      const wIncorrect=mkTA(bubble.replyIncorrect||'',v=>{bubble.replyIncorrect=v;});
      const expectedHint=document.createElement('p');expectedHint.className='field-hint tight';expectedHint.textContent='Separate acceptable replies with ; or one per line.';
      [mkLbl('Typing Placeholder'),wPh,mkLbl('Expected Reply'),expectedHint,wAnswersStage,mkLbl('Reply to Correct'),wCorrect,mkLbl('Reply to Incorrect'),wIncorrect].forEach(el=>wordFields.appendChild(el));
      replySection.appendChild(wordFields);
      const anyFields=document.createElement('div');anyFields.className='reply-fields';anyFields.style.display=replyExpected==='any'?'':'none';
      const aPh=mkInput(bubble.placeholder||'',ensureBuilderOptionsHeader(state.header).defaultPlaceholder||'Type here...',v=>{bubble.placeholder=v;});
      const aStores=mkInput(bubble.storesAs||'','{variable}',v=>{bubble.storesAs=v;updateHtmlVariableHints();});
      const aResp=mkTA(bubble.replyResponse||'',v=>{bubble.replyResponse=v;});
      [mkLbl('Typing Placeholder'),aPh,mkLbl('Reply Stored As'),aStores,mkLbl('Response'),aResp].forEach(el=>anyFields.appendChild(el));
      replySection.appendChild(anyFields);
      replyRow.querySelectorAll('input[type="radio"]').forEach(r=>{r.addEventListener('change',e=>{bubble.replyExpected=e.target.value;bubble.callToAction=e.target.value!=='no';if(e.target.value==='word'){if(!String(bubble.replyCorrect||'').trim()){bubble.replyCorrect=pickRandomSuggestion(getCorrectReplySuggestions());wCorrect.value=bubble.replyCorrect;}if(!String(bubble.replyIncorrect||'').trim()){bubble.replyIncorrect=pickRandomSuggestion(getIncorrectReplySuggestions());wIncorrect.value=bubble.replyIncorrect;}}wordFields.style.display=e.target.value==='word'?'':'none';anyFields.style.display=e.target.value==='any'?'':'none';applyVisualType();});});
      wrap.appendChild(replySection);
      const htmlInput=sections.text.querySelector('.bubble-html-input');if(htmlInput)htmlInput.addEventListener('input',e=>{bubble.html=e.target.value;});
      [sections.image,sections.video].forEach(s=>{const si=s.querySelector('.bubble-src-input');if(si)si.addEventListener('input',e=>{bubble.src=e.target.value;bubble.html=generateBubbleHtml(bubble);});});
      const altInput=sections.image.querySelector('.bubble-alt-input');if(altInput)altInput.addEventListener('input',e=>{bubble.alt=e.target.value;bubble.html=generateBubbleHtml(bubble);});
      [sections.button,sections.pay].forEach(s=>{const li=s.querySelector('.bubble-label-input');if(li)li.addEventListener('input',e=>{bubble.label=e.target.value;bubble.html=generateBubbleHtml(bubble);});const hi=s.querySelector('.bubble-href-input');if(hi)hi.addEventListener('input',e=>{bubble.href=e.target.value;bubble.html=generateBubbleHtml(bubble);});});
    }
    removeBtn.addEventListener('click',()=>{const stop=stopRef||getSelectedStop();if(listKey==='messages'&&stop&&Array.isArray(stop.messages)){const si=stop.messages.indexOf(bubbles[idx]);if(si>=0)stop.messages.splice(si,1);}else bubbles.splice(idx,1);s_renderAll();});
    container.appendChild(wrap);
  });
}

// Renders the simplified "anytime" stop editor — a trigger-keyword input and a single reply bubble.
// Anytime stops respond to a player's keyword at any point during the game, not just at a specific step.
function renderAnytimeEditorInto(body, stop) {
  const pr=stop.playerReply||(stop.playerReply=ensurePlayerReply(null));pr.anytime=true;
  const triggerRow=document.createElement('div');triggerRow.className='anytime-bubble-row';
  const triggerLbl=document.createElement('div');triggerLbl.className='anytime-bubble-lbl';triggerLbl.style.textAlign='right';triggerLbl.textContent='Player Types';
  const triggerPreview=document.createElement('div');triggerPreview.className='anytime-bubble-preview right';
  const triggerBubble=document.createElement('div');triggerBubble.className='anytime-chat-bubble player';
  const triggerInput=document.createElement('input');triggerInput.type='text';triggerInput.placeholder='word1, word2, …';triggerInput.value=(pr.answers||[]).join(', ');
  triggerInput.addEventListener('input',()=>{pr.answers=triggerInput.value.split(/[,\n]+/).map(s=>s.trim()).filter(Boolean);});
  triggerBubble.appendChild(triggerInput);triggerPreview.appendChild(triggerBubble);triggerRow.appendChild(triggerLbl);triggerRow.appendChild(triggerPreview);body.appendChild(triggerRow);
  const replyRow=document.createElement('div');replyRow.className='anytime-bubble-row';
  const replyLbl=document.createElement('div');replyLbl.className='anytime-bubble-lbl';replyLbl.textContent='Reply shown to player';
  const replyPreview=document.createElement('div');replyPreview.className='anytime-bubble-preview left';
  const replyBubble=document.createElement('div');replyBubble.className='anytime-chat-bubble game';
  const firstCorrect=(pr.correct&&pr.correct[0])||null;
  const replyInput=document.createElement('textarea');replyInput.rows=2;replyInput.placeholder='Reply text…';replyInput.value=firstCorrect?(firstCorrect.html||'').replace(/<br\s*\/?>/gi,'\n'):'';
  replyInput.addEventListener('input',()=>{if(!Array.isArray(pr.correct)||!pr.correct.length)pr.correct=[{bubbleId:createBubbleId(),html:''}];pr.correct[0].html=replyInput.value.replace(/\n/g,'<br>');});
  replyBubble.appendChild(replyInput);replyPreview.appendChild(replyBubble);replyRow.appendChild(replyLbl);replyRow.appendChild(replyPreview);body.appendChild(replyRow);
}

// Renders the full stop editor: the outgoing message bubbles, an Add Bubble button,
// and (for 'any' reply type) a variable-selector for storing the player's answer.
function renderStopEditorInto(body, stop) {
  const pr=stop&&stop.playerReply?stop.playerReply:ensurePlayerReply(null);stop.playerReply=pr;
  if(hasCallToActionBubble(stop)||hasFromPlayerBubble(stop))setPlayerReplyType(stop,pr.type);
  const msgBubblesDiv=document.createElement('div');renderBubbles(msgBubblesDiv,stop.messages||[],'messages',stop);body.appendChild(msgBubblesDiv);
  const addRow=document.createElement('div');addRow.className='row';
  const addInner=document.createElement('div');addInner.style.cssText='display:flex;align-items:center;gap:10px;';
  const addBtn=document.createElement('button');addBtn.type='button';addBtn.className='add-bubble-btn';addBtn.textContent='Add Bubble';
  const flashSpan=document.createElement('span');flashSpan.className='bubble-flash';
  addBtn.addEventListener('click',()=>{stop.messages.push({bubbleId:createBubbleId(),msgType:'text',html:'',callToAction:false,bottomAdded:false});s_renderAll();flashSpan.textContent='Bubble Added';flashSpan.classList.add('visible');setTimeout(()=>flashSpan.classList.remove('visible'),1800);});
  addInner.appendChild(addBtn);addInner.appendChild(flashSpan);addRow.appendChild(addInner);body.appendChild(addRow);
}
function renderSimpleStopEditorInto(body, stop) {
  let groups=normalizeSimpleStopMessages(stop);
  const syncGroups=()=>{stop.messages=flattenSimpleMessageGroups(groups);stop.playerReply=ensurePlayerReply(null);};

  const toolbar=document.createElement('div');
  toolbar.className='simple-stop-toolbar';
  const addGroupBtn=document.createElement('button');
  addGroupBtn.type='button';
  addGroupBtn.className='lp-btn primary';
  addGroupBtn.textContent='Add MSG GROUP';
  addGroupBtn.addEventListener('click',()=>{
    groups.push(createEmptySimpleMessageGroup(false));
    syncGroups();
    markDirty();
    s_renderAll();
  });
  toolbar.appendChild(addGroupBtn);
  body.appendChild(toolbar);

  const renderField=(parent,labelText,bubble)=>{
    const wrap=document.createElement('div');
    wrap.className='simple-stop-field';
    const label=document.createElement('div');
    label.className='bubble-details-label';
    label.textContent=labelText;
    const textarea=document.createElement('textarea');
    textarea.className='simple-stop-textarea';
    textarea.value=String(bubble.html||'');
    textarea.addEventListener('input',()=>{
      bubble.html=textarea.value;
      markDirty();
    });
    bindAutoSizeTextarea(textarea);
    wrap.appendChild(label);
    wrap.appendChild(textarea);
    parent.appendChild(wrap);
  };

  groups.forEach((group,groupIndex)=>{
    const groupWrap=document.createElement('div');
    groupWrap.className='simple-stop-group';

    const groupHeader=document.createElement('div');
    groupHeader.className='simple-stop-group-header';
    const groupTitle=document.createElement('div');
    groupTitle.className='simple-stop-group-title';
    groupTitle.textContent='MSG GROUP '+(groupIndex+1);
    const groupActions=document.createElement('div');
    groupActions.className='simple-stop-group-actions';

    const swapBtn=document.createElement('button');
    swapBtn.type='button';
    swapBtn.className='lp-btn';
    swapBtn.textContent='Swap Order';
    swapBtn.addEventListener('click',()=>{
      groups[groupIndex]=[group[1],group[0]];
      syncGroups();
      markDirty();
      s_renderAll();
    });
    groupActions.appendChild(swapBtn);

    const removeBtn=document.createElement('button');
    removeBtn.type='button';
    removeBtn.className='lp-btn danger';
    removeBtn.textContent='Remove MSG GROUP';
    removeBtn.disabled=groups.length===1;
    removeBtn.addEventListener('click',()=>{
      if(groups.length===1)return;
      groups.splice(groupIndex,1);
      syncGroups();
      markDirty();
      s_renderAll();
    });
    groupActions.appendChild(removeBtn);

    groupHeader.appendChild(groupTitle);
    groupHeader.appendChild(groupActions);
    groupWrap.appendChild(groupHeader);

    group.forEach(bubble=>{
      renderField(groupWrap,bubble.fromPlayer?'TRIGGER':'OUTGOING MSG',bubble);
    });
    body.appendChild(groupWrap);
  });
}

// Returns the currently selected stop object from state, or null if no stop is selected
function getSelectedStop() { if(selectedStopIndex<0||selectedStopIndex>=state.stops.length)return null; return state.stops[selectedStopIndex]; }
function getGamesUsingStop(stopId) {
  const key=String(stopId||'').trim();
  if(!key)return[];
  return games.filter(g=>g&&Array.isArray(g.stops)&&g.stops.includes(key));
}
function removeStopFromAllGames(stopId) {
  const key=String(stopId||'').trim();
  if(!key)return 0;
  let changed=0;
  const now=new Date().toISOString();
  games.forEach(g=>{
    if(!g||!Array.isArray(g.stops))return;
    const next=g.stops.filter(id=>id!==key);
    if(next.length===g.stops.length)return;
    g.stops=next;
    g.updatedAt=now;
    changed++;
  });
  if(changed)gamesDirty=true;
  return changed;
}
function getStopDeleteConfirmMessage(stop) {
  const label=String((stop&&stop.id)||'this stop');
  const usedBy=getGamesUsingStop(label);
  if(!usedBy.length)return`Delete "${label}"? This cannot be undone.`;
  const names=usedBy.map(g=>g.name||g.id||'(unnamed)').sort((a,b)=>a.localeCompare(b));
  const countLabel=usedBy.length===1?'game':'games';
  return `Delete "${label}"? This cannot be undone.\n\nWarning: this stop is currently in ${usedBy.length} ${countLabel}: ${names.join(', ')}.\nDeleting it will remove it from those game routes.\n\nContinue?`;
}

// ══════════════════════════════════════════════
// BUBBLE EDITOR — STOP DETAIL PANEL
// ══════════════════════════════════════════════

// Rebuilds the entire stop detail panel for the currently selected stop index.
// The stop editor is intentionally minimal: name plus two ordered message text boxes.
function s_renderStopDetail() {
  const detailEl = document.getElementById('s-stopDetail');
  const panel = document.getElementById('stopDetailsPanel');
  if(!detailEl) return;
  const i = selectedStopIndex;
  const archBtn = document.getElementById('s-archiveBtn');

  if(i < 0 || i >= (state.stops || []).length) {
    detailEl.innerHTML = '<div class="empty">Select a stop.</div>';
    if(archBtn) archBtn.style.display = 'none';
    return;
  }

  detailEl.innerHTML = '';
  const stop = state.stops[i];
  if(archBtn) { archBtn.style.display = isNewStop ? 'none' : ''; archBtn.textContent = stop.archived ? 'Unarchive' : 'Archive'; }

  // Stop Name field → slug auto-generates the Stop ID, mirroring how Game Name → Game ID works
  const nameField = document.createElement('div');
  nameField.className = 'field';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Stop Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'French Quarter';
  nameInput.value = stop.name || '';
  nameInput.autocomplete = 'off';
  const idHint = document.createElement('div');
  idHint.className = 'field-hint';
  idHint.textContent = stop.id;
  idHint.style.display = stop.id ? '' : 'none';
  nameInput.addEventListener('input', () => {
    stop.name = nameInput.value;
    const slug = slugify(nameInput.value);
    if(slug) { stop.id = slug; idHint.textContent = slug; idHint.style.display = ''; }
    else { idHint.style.display = 'none'; }
    markDirty();
  });
  nameInput.addEventListener('blur', () => {
    stop.name = nameInput.value.trim();
    const slug = slugify(stop.name) || stop.id || ('new-' + (i + 1));
    stop.id = slug;
    idHint.textContent = slug;
    idHint.style.display = '';
    renderStopsList();
  });
  nameInput.addEventListener('keydown', e => { if(e.key === 'Enter') nameInput.blur(); });
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);
  nameField.appendChild(idHint);
  detailEl.appendChild(nameField);

  // Stop type selector — styled as BUBBLE DETAILS TYPE row
  // Editor body
  const body = document.createElement('div');
  body.className = 'stop-card-body';
  renderSimpleStopEditorInto(body, stop);
  detailEl.appendChild(body);
}

// Full re-render of all stops-related UI: the list, the detail panel, warnings, and the dirty badge
function s_renderAll() {
  renderStopsList();
  s_renderStopDetail();
  renderWarnings();
  renderDirtyBadge();
  r_renderRoute();
}

// ══════════════════════════════════════════════
// SAVE STOPS
// ══════════════════════════════════════════════

// POSTs the full stops document to the local server, then updates the snapshot so isDirty() resets.
// Note: the global Save button calls saveAll() instead, which saves both games and stops together.
async function saveStops() {
  try {
    const res = await fetch(API + '/stops', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(toDoc())
    });
    if(!res.ok) throw new Error('Server error ' + res.status);
    // Update the snapshot so the dirty badge clears
    loadedStopsSnapshot = deepClone(toDoc());
    isNewStop = false;
    flashStatus('Saved.', 'ok');
    renderStopsList();
  } catch(e) {
    setStatus(e.message || 'Save failed.', 'err');
  }
}

// ── Archive stop ──────────────────────────────
// Toggles the stop's archived flag and immediately saves to the server.
// On failure, reverts the flag so state stays consistent with what's on disk.
document.getElementById('s-archiveBtn').addEventListener('click', async () => {
  if(selectedStopIndex < 0 || selectedStopIndex >= (state.stops||[]).length) return;
  const stop = state.stops[selectedStopIndex];
  stop.archived = !stop.archived;
  try {
    const res = await fetch(API + '/stops', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(toDoc())
    });
    if(!res.ok) throw new Error('Server error ' + res.status);
    loadedStopsSnapshot = deepClone(toDoc());
    document.getElementById('s-archiveBtn').textContent = stop.archived ? 'Unarchive' : 'Archive';
    s_renderAll();
  } catch(e) {
    // Revert the optimistic toggle if the save failed
    stop.archived = !stop.archived;
  }
});

// ── New stop ──────────────────────────────────
// Creates a blank stop, appends it to state.stops, and opens it for editing.
// isNewStop prevents the Archive button from showing until the stop is first saved.
document.getElementById('s-newBtn').addEventListener('click', () => {
  const stop = createEmptyStop();
  state.stops.push(stop);
  selectedStopIndex = state.stops.length - 1;
  isNewStop = true;
  s_renderAll();
});

// ══════════════════════════════════════════════
// MAP / ROUTE
// ══════════════════════════════════════════════
// The Map panel shows the ordered list of stops assigned to the selected game.
// Stops are dragged from the Stops panel into this panel to add them to a route.
// Within the panel, stops can be reordered by dragging. Anytime stops always sort to the top.

let r_dragging = null;  // Tracks the route item currently being dragged for in-panel reorder
let r_flashTimer = null; // Timer for auto-clearing the route status bar message
let r_autoScrollFrame = 0; // requestAnimationFrame handle for edge-drag horizontal scrolling
let r_autoScrollDir = 0; // -1 = scroll left, 1 = scroll right, 0 = stop

// Returns the currently selected game object, or null if none is selected
function r_currentGame() { return selectedIndex >= 0 ? games[selectedIndex] : null; }
function r_getStop(stopId) { return (state.stops||[]).find(x=>x&&x.id===stopId) || null; }
// Returns true if the stop with the given ID is an anytime stop (responds to a keyword globally)
function r_isAnytime(stopId) { const s=r_getStop(stopId); return!!(s&&s.playerReply&&s.playerReply.anytime); }
// Returns an ANYTIME badge HTML string for anytime stops, or empty string for regular stops
function r_anytimeTag(stopId) { return r_isAnytime(stopId)?'<span class="anytime-tag">ANYTIME</span>':''; }
function r_getRouteBadge(stop) {
  if(!stop) return { cls:'rb-noreply', label:'MISSING' };
  const cls = replyTagToRb(getReplyTag(stop).cls);
  const labels = {
    'rb-noreply':'NO REPLY',
    'rb-text':'WORD',
    'rb-any':'ANY',
    'rb-choice':'CHOICE',
    'rb-anytime':'ANYTIME'
  };
  return { cls, label: labels[cls] || 'NO REPLY' };
}
function r_normalizeVarName(raw) {
  const s=String(raw||'').trim();
  if(!s)return'';
  const w=s.match(/^\{\{\s*([A-Za-z_]\w*)\s*\}\}$|^\{\s*([A-Za-z_]\w*)\s*\}$/);
  return w?(w[1]||w[2]||''):s;
}
function r_collectTemplateVars(text, store) {
  const src=String(text||'');
  if(!src)return;
  const re=/\{\{\s*([A-Za-z_]\w*)\s*\}\}|\{\s*([A-Za-z_]\w*)\s*\}/g;
  let m;
  while((m=re.exec(src))) {
    const name=m[1]||m[2]||'';
    if(name)store.add(name);
  }
}
function r_collectBubbleVars(bubble, store) {
  if(!bubble||typeof bubble!=='object')return;
  const ownName=r_normalizeVarName(bubble.storesAs||'');
  if(ownName)store.add(ownName);
  [bubble.html,bubble.replyResponse,bubble.label,bubble.href,bubble.src].forEach(val=>r_collectTemplateVars(val, store));
}
function r_collectStopVars(stop, store) {
  if(!stop||typeof stop!=='object')return;
  const pr=stop.playerReply||{};
  const prName=r_normalizeVarName(pr.storesAs||'');
  if(prName)store.add(prName);
  (Array.isArray(stop.messages)?stop.messages:[]).forEach(b=>r_collectBubbleVars(b, store));
  (Array.isArray(pr.correct)?pr.correct:[]).forEach(b=>r_collectBubbleVars(b, store));
  (Array.isArray(pr.incorrect)?pr.incorrect:[]).forEach(b=>r_collectBubbleVars(b, store));
}
function r_formatVariableValue(val) {
  if(val===undefined||val===null)return'';
  if(Array.isArray(val))return val.map(v=>r_formatVariableValue(v)).join(', ');
  if(typeof val==='object'){ try{return JSON.stringify(val);}catch(_){ return String(val); } }
  return String(val);
}
function r_getVariableEntry(name) {
  const key=String(name||'').trim().toLowerCase();
  const vars=Array.isArray(state.variables)?state.variables:[];
  for(const entry of vars){
    if(typeof entry==='string'){
      if(entry.trim().toLowerCase()===key)return { name:entry, value:'' };
      continue;
    }
    if(!entry||typeof entry!=='object')continue;
    const candidate=String(entry.name||entry.key||entry.id||entry.variable||'').trim();
    if(candidate&&candidate.toLowerCase()===key)return entry;
  }
  return null;
}
function r_getVariableValue(name) {
  const entry=r_getVariableEntry(name);
  if(entry==null)return'';
  if(typeof entry!=='object')return'';
  const candidates=['value','currentValue','defaultValue','default','initialValue','sample','example'];
  for(const key of candidates){
    if(entry[key]!==undefined&&entry[key]!==null&&String(entry[key])!=='')return r_formatVariableValue(entry[key]);
  }
  if(Array.isArray(entry.values)&&entry.values.length)return entry.values.map(v=>r_formatVariableValue(v)).join(', ');
  return'';
}
function r_getCurrentGameVariables() {
  const game=r_currentGame();
  if(!game||!Array.isArray(game.stops))return[];
  const names=new Set();
  game.stops.forEach(sid=>r_collectStopVars(r_getStop(sid), names));
  return Array.from(names).sort((a,b)=>a.localeCompare(b)).map(name=>({ name, value:r_getVariableValue(name) }));
}
function r_renderVariables() {
  const el=document.getElementById('r-varsList');
  const game=r_currentGame();
  if(!el)return;
  if(!game){el.innerHTML='<div class="empty">Select a game</div>';return;}
  const vars=r_getCurrentGameVariables();
  if(!vars.length){el.innerHTML='<div class="empty">No variables in this route.</div>';return;}
  el.innerHTML='';
  vars.forEach(v=>{
    const row=document.createElement('div');
    row.className='var-row';
    const name=document.createElement('div');
    name.className='var-name';
    name.textContent=v.name;
    const value=document.createElement('div');
    value.className='var-value'+(v.value?'':' empty');
    value.textContent=v.value||'—';
    row.appendChild(name);
    row.appendChild(value);
    el.appendChild(row);
  });
}
function r_updateScrollButtons() {
  const zone=document.getElementById('r-dropZone');
  const left=document.getElementById('r-scrollLeftBtn');
  const right=document.getElementById('r-scrollRightBtn');
  if(!zone||!left||!right)return;
  const maxScroll=Math.max(0,zone.scrollWidth-zone.clientWidth);
  const canScroll=maxScroll>4;
  left.disabled=!canScroll||zone.scrollLeft<=4;
  right.disabled=!canScroll||zone.scrollLeft>=maxScroll-4;
}
function r_scrollBy(delta) {
  const zone=document.getElementById('r-dropZone');
  if(!zone)return;
  zone.scrollBy({ left:delta, behavior:'smooth' });
}
function r_stopAutoScroll() {
  r_autoScrollDir=0;
  if(r_autoScrollFrame){
    cancelAnimationFrame(r_autoScrollFrame);
    r_autoScrollFrame=0;
  }
}
function r_stepAutoScroll() {
  const zone=document.getElementById('r-dropZone');
  if(!zone||!r_autoScrollDir){r_autoScrollFrame=0;return;}
  zone.scrollLeft += r_autoScrollDir * 18;
  r_updateScrollButtons();
  r_autoScrollFrame=requestAnimationFrame(r_stepAutoScroll);
}
function r_setAutoScroll(dir) {
  if(dir===r_autoScrollDir)return;
  r_autoScrollDir=dir;
  if(!dir){ if(r_autoScrollFrame){ cancelAnimationFrame(r_autoScrollFrame); r_autoScrollFrame=0; } return; }
  if(!r_autoScrollFrame)r_autoScrollFrame=requestAnimationFrame(r_stepAutoScroll);
}
function r_handleEdgeScroll(clientX) {
  const zone=document.getElementById('r-dropZone');
  if(!zone)return;
  if(zone.scrollWidth<=zone.clientWidth+4){ r_stopAutoScroll(); return; }
  const rect=zone.getBoundingClientRect();
  const gutter=Math.min(72, rect.width/4);
  if(clientX < rect.left + gutter) r_setAutoScroll(-1);
  else if(clientX > rect.right - gutter) r_setAutoScroll(1);
  else r_stopAutoScroll();
}
// Briefly sets the route panel status bar and clears it after 2.5 seconds
function r_setStatus(msg,type) { if(r_flashTimer)clearTimeout(r_flashTimer); const el=document.getElementById('r-status'); el.textContent=msg; el.className='r-status'+(type?' '+type:''); if(msg)r_flashTimer=setTimeout(()=>{el.textContent='';el.className='r-status';},2500); }
// Hides the vertical insert line indicator
function r_clearDropIndicators() { const l=document.getElementById('r-insertLine'); if(l) l.style.display='none'; }
// Calculates where to insert a dragged item based on cursor X position (inserts left of midpoint)
function r_getInsertionIndex(items,clientX) { for(let i=0;i<items.length;i++){const r=items[i].getBoundingClientRect();if(clientX<r.left+r.width/2)return i;}return items.length; }
// Positions the vertical insert line between items based on cursor X
function r_updateDropIndicator(items,clientX) {
  const line=document.getElementById('r-insertLine'); if(!line) return;
  const zone=document.getElementById('r-dropZone'); const zr=zone.getBoundingClientRect();
  const idx=r_getInsertionIndex(items,clientX);
  let x; if(idx<items.length){const r=items[idx].getBoundingClientRect();x=r.left-zr.left+zone.scrollLeft-1;}
  else if(items.length){const r=items[items.length-1].getBoundingClientRect();x=r.right-zr.left+zone.scrollLeft+1;}
  else{x=8;}
  line.style.left=x+'px'; line.style.display='block';
}
// Re-sorts a game's stop array so anytime stops always appear before regular stops in the route
function r_sortRouteAnytimeFirst(game) { if(!game||!Array.isArray(game.stops))return; const at=game.stops.filter(id=>r_isAnytime(id)),reg=game.stops.filter(id=>!r_isAnytime(id)); game.stops=[...at,...reg]; }
// Adds a stop to the current game's route; anytime stops are inserted before the first regular stop
function r_addStop(stopId) {
  const game=r_currentGame(); if(!game)return;
  if(!Array.isArray(game.stops))game.stops=[];
  if(game.stops.includes(stopId)){r_setStatus('Already in route.','warn');return;}
  if(r_isAnytime(stopId)){const firstRegular=game.stops.findIndex(id=>!r_isAnytime(id));game.stops.splice(firstRegular<0?0:firstRegular,0,stopId);}
  else game.stops.push(stopId);
  r_renderRoute();
}
// Rebuilds the route panel DOM from the selected game's stops array
function r_renderRoute() {
  const zone=document.getElementById('r-dropZone');
  const game=r_currentGame();
  r_stopAutoScroll();
  zone.innerHTML='';
  document.getElementById('r-panelTitle').textContent = game ? 'Game Stop Order — '+(game.name||game.id||'') : 'Game Stop Order';
  if(!game){zone.innerHTML='<div class="r-zone-empty">Select a game</div>';r_renderVariables();r_updateScrollButtons();return;}
  if(!Array.isArray(game.stops))game.stops=[];
  r_sortRouteAnytimeFirst(game);
  if(!game.stops.length){zone.innerHTML='<div class="r-zone-empty">Drag stops here</div>';r_renderVariables();r_updateScrollButtons();return;}
  game.stops.forEach((sid,idx)=>{
    const stop=r_getStop(sid);
    const routeBadge=r_getRouteBadge(stop);
    const title=stop?(stop.name||stop.id||'(unnamed)'):(sid||'(missing stop)');
    const subtitle=stop&&stop.name&&stop.id&&stop.name!==stop.id ? stop.id : (stop ? '' : 'Stop record not found');
    const bubbleCount=Array.isArray(stop&&stop.messages)?stop.messages.length:0;
    const isSelected=!!(selectedStopIndex>=0&&state.stops[selectedStopIndex]&&state.stops[selectedStopIndex].id===sid);
    const wrap=document.createElement('div');
    wrap.className='r-stop-wrap'+(r_isAnytime(sid)?' anytime':'')+(isSelected?' selected':'');wrap.draggable=true;wrap.dataset.idx=idx;
    const item=document.createElement('div');
    item.className='r-stop-item';
    item.innerHTML='<button class="r-remove-btn" type="button" title="Remove">×</button><span class="r-stop-num">'+String(idx+1).padStart(2,'0')+'</span><span class="r-stop-id">'+sid+'</span>';
    item.querySelector('.r-remove-btn').addEventListener('click',e=>{e.stopPropagation();game.stops.splice(idx,1);r_renderRoute();});
    const removeBtn=item.querySelector('.r-remove-btn');
    item.innerHTML='';
    removeBtn.textContent='x';
    item.appendChild(removeBtn);
    const top=document.createElement('div');
    top.className='r-stop-top';
    const num=document.createElement('span');
    num.className='r-stop-num';
    num.textContent=String(idx+1).padStart(2,'0');
    const type=document.createElement('span');
    type.className='r-stop-type '+routeBadge.cls;
    type.textContent=routeBadge.label;
    top.appendChild(num);
    top.appendChild(type);
    item.appendChild(top);
    const body=document.createElement('div');
    body.className='r-stop-body';
    const titleEl=document.createElement('span');
    titleEl.className='r-stop-title';
    titleEl.textContent=title;
    body.appendChild(titleEl);
    if(subtitle){
      const subtitleEl=document.createElement('span');
      subtitleEl.className='r-stop-id';
      subtitleEl.textContent=subtitle;
      body.appendChild(subtitleEl);
    }
    item.appendChild(body);
    const foot=document.createElement('div');
    foot.className='r-stop-foot';
    const count=document.createElement('span');
    count.textContent=bubbleCount+' bubble'+(bubbleCount===1?'':'s');
    foot.appendChild(count);
    if(stop&&hasCallToActionBubble(stop)){
      const flag=document.createElement('span');
      flag.className='r-stop-flag';
      flag.textContent='CTA';
      foot.appendChild(flag);
    }
    item.appendChild(foot);
    wrap.addEventListener('click',()=>{ const si=(state.stops||[]).findIndex(s=>s.id===sid); if(si>=0){selectedStopIndex=si;isNewStop=false;s_renderAll();} });
    wrap.addEventListener('dragstart',e=>{r_dragging={idx};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(idx));setTimeout(()=>wrap.classList.add('dragging'),0);});
    wrap.addEventListener('dragend',()=>{wrap.classList.remove('dragging');r_clearDropIndicators();r_dragging=null;r_stopAutoScroll();});
    wrap.appendChild(item);
    zone.appendChild(wrap);
    if(idx<game.stops.length-1){
      const nextSid=game.stops[idx+1];
      if(r_isAnytime(sid)&&r_isAnytime(nextSid)){const gap=document.createElement('div');gap.className='r-anytime-gap';zone.appendChild(gap);}
      else if(r_isAnytime(sid)&&!r_isAnytime(nextSid)){const div=document.createElement('div');div.className='r-anytime-divider';zone.appendChild(div);}
      else if(!r_isAnytime(sid)&&!r_isAnytime(nextSid)){const arr=document.createElement('div');arr.className='r-stop-arrow';arr.innerHTML='<svg width="20" height="8" viewBox="0 0 20 8" fill="currentColor"><rect x="0" y="3" width="12" height="2"/><polygon points="11,0 20,4 11,8"/></svg>';zone.appendChild(arr);}
    }
  });
  const il=document.createElement('div');il.id='r-insertLine';il.className='r-insert-line';zone.appendChild(il);
  r_renderVariables();
  r_updateScrollButtons();
}
// IIFE: wires up drag-and-drop event handlers for the route drop zone.
// Handles two distinct drag sources:
//   1. Reordering within the route (r_dragging is set) — uses text/x-stop-index
//   2. Adding a stop from the Stops list — uses text/x-stop-id (set in renderStopsList)
(()=>{
  const zone=document.getElementById('r-dropZone');
  const leftBtn=document.getElementById('r-scrollLeftBtn');
  const rightBtn=document.getElementById('r-scrollRightBtn');
  leftBtn.addEventListener('click',()=>r_scrollBy(-260));
  rightBtn.addEventListener('click',()=>r_scrollBy(260));
  zone.addEventListener('scroll',r_updateScrollButtons);
  zone.addEventListener('wheel',e=>{
    if(zone.scrollWidth<=zone.clientWidth+4)return;
    const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
    if(!delta)return;
    e.preventDefault();
    zone.scrollLeft += delta;
    r_updateScrollButtons();
  },{passive:false});
  window.addEventListener('resize',r_updateScrollButtons);
  zone.addEventListener('dragover',e=>{
    const types=Array.from(e.dataTransfer.types);
    // In-panel reorder: show precise drop indicator line
    if(r_dragging!=null){e.preventDefault();const items=Array.from(zone.querySelectorAll('.r-stop-wrap:not(.dragging)'));r_updateDropIndicator(items,e.clientX);r_handleEdgeScroll(e.clientX);}
    // Cross-panel add: highlight the entire drop zone
    else if(types.includes('text/x-stop-id')&&selectedIndex>=0){e.preventDefault();zone.classList.add('drag-over');r_handleEdgeScroll(e.clientX);}
  });
  zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget)){zone.classList.remove('drag-over');r_clearDropIndicators();r_stopAutoScroll();}});
  zone.addEventListener('drop',e=>{
    zone.classList.remove('drag-over');r_clearDropIndicators();r_stopAutoScroll();
    if(r_dragging!=null){
      e.preventDefault();const game=r_currentGame();if(!game)return;
      const items=Array.from(zone.querySelectorAll('.r-stop-wrap:not(.dragging)'));
      const insertionIndex=r_getInsertionIndex(items,e.clientX);
      const from=r_dragging.idx;r_dragging=null;
      const[moved]=game.stops.splice(from,1);game.stops.splice(insertionIndex,0,moved);
      r_sortRouteAnytimeFirst(game);r_renderRoute();return;
    }
    const sid=e.dataTransfer.getData('text/x-stop-id');
    if(!sid||selectedIndex<0)return;
    const dropStop=(state.stops||[]).find(s=>s.id===sid);
    if(dropStop&&dropStop.archived)return;
    e.preventDefault();r_addStop(sid);
  });
})();

// ── Route item context menu ───────────────────
(()=>{
  const menu = document.getElementById('routeCtxMenu');
  let targetIdx = -1;
  function hideRouteCtx(){ menu.style.display='none'; targetIdx=-1; }
  function showRouteCtx(x, y, idx){
    targetIdx = idx;
    menu.style.display='flex'; menu.style.left='0'; menu.style.top='0';
    const mw=menu.offsetWidth, mh=menu.offsetHeight;
    menu.style.left=Math.min(x, window.innerWidth-mw-4)+'px';
    menu.style.top=Math.min(y, window.innerHeight-mh-4)+'px';
  }
  document.addEventListener('click', hideRouteCtx);
  document.addEventListener('contextmenu', e=>{ if(!e.target.closest('#routeCtxMenu')) hideRouteCtx(); });
  document.getElementById('rCtxDetach').addEventListener('click', ()=>{
    const game=r_currentGame(); if(!game||targetIdx<0) return;
    game.stops.splice(targetIdx,1); hideRouteCtx(); r_renderRoute(); markDirty();
  });
  // Attach contextmenu to wraps — called from r_renderRoute via delegation on the zone
  document.getElementById('r-dropZone').addEventListener('contextmenu', e=>{
    const wrap=e.target.closest('.r-stop-wrap'); if(!wrap) return;
    e.preventDefault(); e.stopPropagation(); showRouteCtx(e.clientX, e.clientY, Number(wrap.dataset.idx));
  });
})();


// ══════════════════════════════════════════════
// GAME LIST
// ══════════════════════════════════════════════

// Rebuilds the left-hand games list; most recently edited/created game first,
// then a divider, then the rest alphabetically, then archived games alphabetically.
function renderGameList() {
  const el = document.getElementById('gameList');
  if(!games.length) { el.innerHTML = '<div class="empty">No games yet.</div>'; return; }

  const sortAlpha = arr => arr.sort((a,b) => (a.g.name||'').localeCompare(b.g.name||''));
  const getTs = g => Math.max(g.updatedAt ? new Date(g.updatedAt).getTime() : 0, g.createdAt ? new Date(g.createdAt).getTime() : 0);

  const activeAll = games.map((g,i) => ({g,i})).filter(({g}) => !g.archived);
  const archived = sortAlpha(games.map((g,i) => ({g,i})).filter(({g}) => g.archived));

  let recentEntry = null, recentTs = -1;
  activeAll.forEach(e => { const ts = getTs(e.g); if(ts > recentTs) { recentTs = ts; recentEntry = e; } });
  const active = sortAlpha(activeAll.filter(e => e !== recentEntry));

  const makeRow = ({g, i}) => {
    const row = document.createElement('div');
    row.className = 'game-row' + (g.archived ? ' archived' : '') + (i === selectedIndex ? ' selected' : '');
    row.dataset.i = i;
    row.addEventListener('click', () => openDetails(i));
    row.addEventListener('contextmenu', e => { e.preventDefault(); openDetails(i); showCtxMenu(e.clientX, e.clientY, i); });
    const thumb = document.createElement('img');
    thumb.className = 'game-row-thumb';
    thumb.src = g.thumbnail || g.logo || 'assets/logo.png';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.decoding = 'async';
    thumb.draggable = false;
    const info = document.createElement('div');
    info.className = 'game-row-info';
    const name = document.createElement('div');
    name.className = 'game-row-name';
    name.textContent = g.name || '(unnamed)';
    info.appendChild(name);
    row.appendChild(thumb);
    row.appendChild(info);
    return row;
  };
  const makeDivider = () => { const hr = document.createElement('hr'); hr.style.cssText = 'border:none;border-top:1px solid rgba(17,17,17,.1);margin:0;'; return hr; };

  el.innerHTML = '';
  if(recentEntry) {
    el.appendChild(makeRow(recentEntry));
    if(active.length || archived.length) el.appendChild(makeDivider());
  }
  active.forEach(e => el.appendChild(makeRow(e)));
  if(archived.length) {
    el.appendChild(makeDivider());
    archived.forEach(e => el.appendChild(makeRow(e)));
  }
}

// ── Details panel ──────────────────────────────────
// Populates the Game Details panel with data from games[index] and refreshes dependent panels
function openDetails(index) {
  selectedIndex = index;
  isNew = false;
  const g = games[index];
  document.getElementById('detailsTitle').textContent = 'Game Details';
  document.getElementById('g-name').value = g.name || '';
  document.getElementById('g-subtitle').value = g.subtitle || '';
  document.getElementById('g-desc').value = g.description || '';
  document.getElementById('g-price').value = g.price || '';
  logoPicker.load(g.logo || 'assets/logo.png');
  thumbnailPicker.load(g.thumbnail || 'assets/logo.png');
  faviconPicker.load(g.favicon || 'index.ico');

  const idHint = document.getElementById('g-idHint');
  if(g.id) { idHint.textContent = g.id; idHint.style.display = ''; }
  else { idHint.style.display = 'none'; }

  const shareField = document.getElementById('g-shareField');
  const shareUrl = document.getElementById('g-shareUrl');
  if(g.id) { shareUrl.textContent = SHARE_BASE + g.id; document.getElementById('g-shareUrlLocal').textContent = SHARE_BASE_LOCAL + g.id; shareField.style.display = ''; }
  else { shareField.style.display = 'none'; }

  selectedTags = new Set((g.tag || '').split(/[;,]+/).map(t => t.trim()).filter(Boolean));
  renderTags();

  setGameStatus('');
  s_refreshAddRouteButtons();
  renderGameList();
  r_renderRoute();
}

// Resets the details panel to a blank "New Game" form without touching the games array
function openNewGame() {
  selectedIndex = -1;
  isNew = true;
  document.getElementById('detailsTitle').textContent = 'New Game';
  document.getElementById('g-name').value = '';
  document.getElementById('g-subtitle').value = 'Mission Control';
  document.getElementById('g-desc').value = '';
  document.getElementById('g-price').value = 'Free To Start / In App Purchases';
  logoPicker.load('assets/logo.png', { blank:true });
  thumbnailPicker.load('assets/logo.png', { blank:true });
  faviconPicker.load('index.ico', { blank:true });
  document.getElementById('g-idHint').style.display = 'none';
  document.getElementById('g-shareField').style.display = 'none';
  selectedTags = new Set();
  renderTags();
  setGameStatus('');
  s_refreshAddRouteButtons();
  renderGameList();
  r_renderRoute();
  document.getElementById('g-name').focus();
}

// ── Stops list panel ──────────────────────────────────
// Rebuilds the Stops panel list, grouped as: anytime stops → regular stops → archived stops.
// Within each group stops are sorted alphabetically by ID.
// Rows are click-to-select only; use the + button to add a stop to the current game's route.
function renderStopsList() {
  const el = document.getElementById('stopsList');
  if(!state.stops.length) { el.innerHTML = '<div class="empty">No stops yet.</div>'; return; }

  const alpha = arr => arr.slice().sort((a,b) => (a.s.id||'').localeCompare(b.s.id||''));
  const anytime = alpha(state.stops.map((s,i) => ({s,i})).filter(({s}) => !s.archived && s.playerReply && s.playerReply.anytime));
  const active  = alpha(state.stops.map((s,i) => ({s,i})).filter(({s}) => !s.archived && !(s.playerReply && s.playerReply.anytime)));
  const archived = alpha(state.stops.map((s,i) => ({s,i})).filter(({s}) => s.archived));

  const mkDivider = () => { const hr = document.createElement('hr'); hr.style.cssText = 'border:none;border-top:1px solid rgba(17,17,17,.1);margin:0;'; return hr; };
  const makeRow = ({s, i}) => {
    const row = document.createElement('div');
    row.className = 'stop-row' + (s.archived ? ' archived' : '') + (i === selectedStopIndex ? ' selected' : '');
    if(i === selectedStopIndex) row.style.cssText = 'background:var(--ink);color:#fff;';

    const info = document.createElement('div');
    info.className = 'stop-row-info';
    const name = document.createElement('div');
    name.className = 'stop-row-name';
    name.textContent = s.name || s.id || '(unnamed)';
    info.appendChild(name);

    const tag = getReplyTag(s);
    const badge = document.createElement('span');
    badge.className = 'reply-badge ' + replyTagToRb(tag.cls);
    badge.textContent = tag.label;

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'stop-add-route';
    addBtn.textContent = '+';
    addBtn.title = selectedIndex >= 0 ? 'Add to ' + (games[selectedIndex].name || 'route') : 'Select a game first';
    if(selectedIndex < 0 || s.archived) addBtn.classList.add('no-game');
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      if(selectedIndex < 0) return;
      r_addStop(s.id);
    });

    row.appendChild(info);
    row.appendChild(badge);
    row.appendChild(addBtn);
    row.addEventListener('click', () => {
      selectedStopIndex = i;
      isNewStop = false;
      s_renderAll();
    });
    row.addEventListener('contextmenu', e => { e.preventDefault(); selectedStopIndex = i; isNewStop = false; s_renderAll(); showStopCtxMenu(e.clientX, e.clientY, i); });
    return row;
  };

  el.innerHTML = '';
  anytime.forEach(e => el.appendChild(makeRow(e)));
  if(anytime.length && active.length) el.appendChild(mkDivider());
  active.forEach(e => el.appendChild(makeRow(e)));
  if(archived.length) {
    el.appendChild(mkDivider());
    archived.forEach(e => el.appendChild(makeRow(e)));
  }
}

// Converts the reply-tag-* CSS class from getReplyTag() to the rb-* class used on stop list badges
function replyTagToRb(cls) {
  if(cls === 'reply-tag-noreply') return 'rb-noreply';
  if(cls === 'reply-tag-wordreply') return 'rb-text';
  if(cls === 'reply-tag-anyreply') return 'rb-any';
  if(cls === 'reply-tag-choicereply') return 'rb-choice';
  if(cls === 'reply-tag-anytime') return 'rb-anytime';
  return 'rb-noreply';
}

// ── Tags ──────────────────────────────────────────
// Re-renders all tag pills in the Game Details panel, marking selected ones with the 'on' class
function renderTags() {
  const el = document.getElementById('g-tagPicker');
  const input = document.getElementById('g-tagNewInput');
  const addBtn = document.getElementById('g-tagAddBtn');
  [...el.children].forEach(c => { if(c !== input && c !== addBtn) c.remove(); });
  allTags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill' + (selectedTags.has(tag) ? ' on' : '');
    pill.textContent = tag;
    pill.addEventListener('click', () => {
      if(selectedTags.has(tag)) selectedTags.delete(tag);
      else selectedTags.add(tag);
      renderTags();
    });
    el.insertBefore(pill, input);
  });
}

// Reads the custom tag input, adds the value to allTags (if not present) and marks it selected
function addNewTag() {
  const input = document.getElementById('g-tagNewInput');
  const val = input.value.trim();
  if(!val) return;
  if(!allTags.includes(val)) allTags.push(val);
  selectedTags.add(val);
  input.value = '';
  renderTags();
}

document.getElementById('g-tagAddBtn').addEventListener('click', addNewTag);
document.getElementById('g-tagNewInput').addEventListener('keydown', e => { if(e.key === 'Enter') { e.preventDefault(); addNewTag(); } });

// Serialises the selected tags set to a semicolon-delimited string for storage in games.json
function getTagsValue() { return [...selectedTags].join(';'); }

// ── Name → ID hint ────────────────────────────────
// Live-updates the slug preview and shareable URL as the user types a game name
document.getElementById('g-name').addEventListener('input', () => {
  const id = slugify(document.getElementById('g-name').value);
  const idHint = document.getElementById('g-idHint');
  const shareField = document.getElementById('g-shareField');
  const shareUrl = document.getElementById('g-shareUrl');
  if(id) {
    idHint.textContent = id; idHint.style.display = '';
    shareUrl.textContent = SHARE_BASE + id; document.getElementById('g-shareUrlLocal').textContent = SHARE_BASE_LOCAL + id; shareField.style.display = '';
  } else {
    idHint.style.display = 'none'; shareField.style.display = 'none';
  }
});

document.getElementById('g-copyShareBtn').addEventListener('click', () => {
  const url = document.getElementById('g-shareUrl').textContent;
  if(url) navigator.clipboard.writeText(url).catch(() => {});
});

document.getElementById('g-goShareBtn').addEventListener('click', () => {
  const url = document.getElementById('g-shareUrl').textContent;
  if(url) window.open(url, '_blank');
});

document.getElementById('g-copyShareBtnLocal').addEventListener('click', () => {
  const url = document.getElementById('g-shareUrlLocal').textContent;
  if(url) navigator.clipboard.writeText(url).catch(() => {});
});

document.getElementById('g-goShareBtnLocal').addEventListener('click', () => {
  const url = document.getElementById('g-shareUrlLocal').textContent;
  if(url) window.open(url, '_blank');
});

// ── Game duplicate / delete ────────────────────────────
// Duplicates the game at the given index: clones it, appends " dup" to the name,
// assigns a fresh ID and timestamps, saves immediately, and opens the new game
function g_duplicateGame(index) {
  const clone = deepClone(games[index]);
  clone.id = slugify(clone.name || 'game') + '-' + Date.now();
  clone.createdAt = new Date().toISOString();
  clone.updatedAt = new Date().toISOString();
  delete clone.archived;
  games.push(clone);
  selectedIndex = games.length - 1;
  isNew = false;
  openDetails(selectedIndex);
  fetch(API + '/games', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({games})})
    .then(r => { if(!r.ok) throw new Error(); setGameStatus('Saved.','ok'); setTimeout(()=>setGameStatus(''),2000); })
    .catch(() => setGameStatus('Save failed.','err'));
}

// Removes the selected game from the array and saves; errors are silently swallowed since
// the game is already gone from the in-memory list
async function g_deleteGame() {
  if(selectedIndex < 0) return;
  games.splice(selectedIndex, 1);
  selectedIndex = -1;
  isNew = false;
  document.getElementById('detailsTitle').textContent = 'Game Details';
  renderGameList();
  r_renderRoute();
  try {
    await fetch(API + '/games', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({games})});
  } catch(e) {}
}


// ── Game row context menu ───────────────────────────────
let ctxTargetIndex = -1; // The game index the context menu was opened on (may differ from selectedIndex)

const ctxMenu = document.getElementById('gameCtxMenu');

// Positions and shows the context menu at (x, y), clamped to stay within the viewport.
// The menu is rendered at 0,0 first so offsetWidth/Height are accurate before repositioning.
function showCtxMenu(x, y, gameIndex) {
  ctxTargetIndex = gameIndex;
  const g = games[gameIndex];
  document.getElementById('ctxArchive').textContent = g && g.archived ? 'Unarchive' : 'Archive';
  // Briefly show at top-left to measure actual rendered dimensions before placing at cursor
  ctxMenu.style.display = 'flex';
  ctxMenu.style.left = '0'; ctxMenu.style.top = '0';
  const mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
  // Clamp so the menu never overflows the right or bottom edge of the window
  ctxMenu.style.left = Math.min(x, window.innerWidth - mw - 4) + 'px';
  ctxMenu.style.top  = Math.min(y, window.innerHeight - mh - 4) + 'px';
}

// Hides the context menu and resets the target index
function hideCtxMenu() { ctxMenu.style.display = 'none'; ctxTargetIndex = -1; }

document.addEventListener('click', hideCtxMenu);
document.addEventListener('keydown', e => { if(e.key === 'Escape') { hideCtxMenu(); hideStopCtxMenu(); } });

document.getElementById('ctxDuplicate').addEventListener('click', () => {
  if(ctxTargetIndex < 0) return;
  g_duplicateGame(ctxTargetIndex);
});

document.getElementById('ctxArchive').addEventListener('click', async () => {
  if(ctxTargetIndex < 0) return;
  const g = games[ctxTargetIndex];
  g.archived = !g.archived;
  renderGameList();
  fetch(API + '/games', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({games})}).catch(()=>{});
});

document.getElementById('ctxDelete').addEventListener('click', () => {
  if(ctxTargetIndex < 0) return;
  const g = games[ctxTargetIndex];
  const name = g.name || 'this game';
  if(!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  games.splice(ctxTargetIndex, 1);
  if(selectedIndex === ctxTargetIndex) { selectedIndex = -1; isNew = false; }
  else if(selectedIndex > ctxTargetIndex) selectedIndex--;
  renderGameList();
  fetch(API + '/games', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({games})}).catch(()=>{});
});

// ── Stop context menu ──────────────────────────────────
const stopCtxMenu = document.getElementById('stopCtxMenu');
let sCtxTargetIndex = -1;

function showStopCtxMenu(x, y, stopIndex) {
  sCtxTargetIndex = stopIndex;
  const s = state.stops[stopIndex];
  document.getElementById('sCtxArchive').textContent = s && s.archived ? 'Unarchive' : 'Archive';
  stopCtxMenu.style.display = 'flex';
  stopCtxMenu.style.left = '0'; stopCtxMenu.style.top = '0';
  const mw = stopCtxMenu.offsetWidth, mh = stopCtxMenu.offsetHeight;
  stopCtxMenu.style.left = Math.min(x, window.innerWidth - mw - 4) + 'px';
  stopCtxMenu.style.top  = Math.min(y, window.innerHeight - mh - 4) + 'px';
}
function hideStopCtxMenu() { stopCtxMenu.style.display = 'none'; sCtxTargetIndex = -1; }

document.addEventListener('click', hideStopCtxMenu);

document.getElementById('sCtxDuplicate').addEventListener('click', () => {
  if(sCtxTargetIndex < 0) return;
  const now = new Date().toISOString();
  const clone = deepClone(state.stops[sCtxTargetIndex]);
  clone.id = (clone.id || 'stop') + '-' + Date.now();
  clone.archived = false;
  clone.createdAt = now;
  clone.updatedAt = now;
  state.stops.push(clone);
  selectedStopIndex = state.stops.length - 1;
  isNewStop = false;
  s_renderAll();
  markDirty();
});

document.getElementById('sCtxArchive').addEventListener('click', () => {
  if(sCtxTargetIndex < 0) return;
  const s = state.stops[sCtxTargetIndex];
  s.archived = !s.archived;
  s.updatedAt = new Date().toISOString();
  s_renderAll();
  markDirty();
});

document.getElementById('sCtxDelete').addEventListener('click', () => {
  if(sCtxTargetIndex < 0) return;
  const s = state.stops[sCtxTargetIndex];
  if(!confirm(getStopDeleteConfirmMessage(s))) return;
  removeStopFromAllGames(s&&s.id);
  state.stops.splice(sCtxTargetIndex, 1);
  if(selectedStopIndex === sCtxTargetIndex) { selectedStopIndex = -1; isNewStop = false; }
  else if(selectedStopIndex > sCtxTargetIndex) selectedStopIndex--;
  s_renderAll();
  markDirty();
});

// ── Refresh add-to-route buttons ──────────────────────
// Enables/disables the add-to-route buttons in the stops list based on whether a game is selected
function s_refreshAddRouteButtons() {
  const hasGame = selectedIndex >= 0;
  document.querySelectorAll('.stop-add-route').forEach(btn => {
    btn.classList.toggle('no-game', !hasGame);
    btn.title = hasGame ? 'Add to ' + (games[selectedIndex].name || 'route') : 'Select a game first';
  });
}

// ── Global save ────────────────────────────────────────
document.getElementById('globalSaveBtn').addEventListener('click', saveAll);

// Saves both the games list and the stops document in parallel.
// Stops are only sent to the server if isDirty() is true, avoiding unnecessary writes.
// On success, updates the snapshot so the dirty badge clears.
async function saveAll() {
  const btn = document.getElementById('globalSaveBtn');
  const status = document.getElementById('globalSaveStatus');
  btn.disabled = true;
  status.textContent = 'Saving…';

  try {
    // Stamp updatedAt on the currently selected stop before serialising
    if(isDirty() && selectedStopIndex >= 0 && selectedStopIndex < (state.stops||[]).length) {
      state.stops[selectedStopIndex].updatedAt = new Date().toISOString();
    }

    // Duplicate stop ID check — block save if two stops share the same ID
    if(isDirty()) {
      const seen = new Map();
      for(let idx = 0; idx < (state.stops||[]).length; idx++) {
        const sid = state.stops[idx].id;
        if(seen.has(sid)) {
          flashStatus('Duplicate stop ID "' + sid + '". Rename one before saving.', 'err');
          status.textContent = ''; btn.disabled = false; return;
        }
        seen.set(sid, idx);
      }
    }

    const [gRes, sRes] = await Promise.all([
      (async () => {
        const name = document.getElementById('g-name').value.trim();
        if(name) {
          const id = slugify(name);

          // Duplicate ID check — block save if another game already uses this ID
          const conflict = games.find((g, i) => g.id === id && i !== selectedIndex);
          if(conflict) {
            setGameStatus('ID "' + id + '" is already used by "' + conflict.name + '". Rename this game.', 'err');
            return { ok: false, _blocked: true };
          }
          if(isNew) {
            games.push({ id, name,
              subtitle: document.getElementById('g-subtitle').value.trim(),
              tag: getTagsValue(),
              description: document.getElementById('g-desc').value.trim(),
              price: document.getElementById('g-price').value.trim(),
              logo: document.getElementById('g-logo').value.trim() || 'assets/logo.png',
              thumbnail: document.getElementById('g-thumbnail').value.trim() || 'assets/logo.png',
              favicon: document.getElementById('g-favicon').value.trim(),
              featured: false, archived: false, stops: [],
              createdAt: new Date().toISOString()
            });
            selectedIndex = games.length - 1;
            isNew = false;
          } else if(selectedIndex >= 0) {
            const g = games[selectedIndex];
            g.name = name; g.id = id;
            g.subtitle = document.getElementById('g-subtitle').value.trim();
            g.tag = getTagsValue();
            g.description = document.getElementById('g-desc').value.trim();
            g.price = document.getElementById('g-price').value.trim();
            g.logo = document.getElementById('g-logo').value.trim() || 'assets/logo.png';
            g.thumbnail = document.getElementById('g-thumbnail').value.trim() || 'assets/logo.png';
            g.favicon = document.getElementById('g-favicon').value.trim();
            g.updatedAt = new Date().toISOString();
          }
        } else if(!gamesDirty) {
          return { ok: true };
        }
        return fetch(API + '/games', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({games})
        });
      })(),
      // Only POST stops if something actually changed — avoids a needless disk write
      isDirty() ? fetch(API + '/stops', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(toDoc())
      }) : Promise.resolve({ ok: true })
    ]);

    if(gRes && gRes._blocked) { status.textContent = ''; btn.disabled = false; return; }
    if(gRes && !gRes.ok) throw new Error('Games save failed');
    if(!sRes.ok) throw new Error('Stops save failed');
    gamesDirty = false;

    // Re-check isDirty() here because the stops fetch only runs when dirty, so
    // we only update the snapshot when it was actually sent
    if(isDirty()) {
      loadedStopsSnapshot = deepClone(toDoc());
      isNewStop = false;
    }
    renderDirtyBadge();

    // Update game panel UI if a game was saved
    if(selectedIndex >= 0) {
      const g = games[selectedIndex];
      document.getElementById('detailsTitle').textContent = 'Game Details';
      document.getElementById('g-idHint').textContent = g.id;
      document.getElementById('g-idHint').style.display = '';
      document.getElementById('g-shareUrl').textContent = SHARE_BASE + g.id;
      document.getElementById('g-shareUrlLocal').textContent = SHARE_BASE_LOCAL + g.id;
      document.getElementById('g-shareField').style.display = '';
      renderGameList();
    }
    renderStopsList();

    status.textContent = 'Saved';
    setTimeout(() => { status.textContent = ''; }, 2000);
  } catch(e) {
    status.textContent = e.message || 'Save failed';
    setTimeout(() => { status.textContent = ''; }, 3000);
  } finally {
    btn.disabled = false;
  }
}

// ── New game ───────────────────────────────────────────
document.getElementById('newGameBtn').addEventListener('click', openNewGame);

// ── Game status ────────────────────────────────────────
// Sets the Game Details panel status bar (separate from the stop status bar)
function setGameStatus(msg, type) {
  const el = document.getElementById('detailsStatus');
  el.textContent = msg;
  el.className = 'status-bar' + (type ? ' ' + type : '');
}

// ── Slugify ───────────────────────────────────────
// Converts a game name to a URL-safe id (e.g. "Oswald's Diary" → "oswalds-diary")
function slugify(s) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

// ══ INIT ══════════════════════════════════════════════════════════════════════

// Bootstraps the builder: fetches games from the local API and stops from the static JSON file,
// then renders all panels and opens a blank new-stop form ready for editing.
async function init() {
  try {
    // Load games from the local Node server and stops from the static data file in parallel
    const [gRes, sRes] = await Promise.all([fetch(API + '/games'), fetch('../data/stops.json')]);
    const gData = await gRes.json();
    const sData = await sRes.json();
    games = Array.isArray(gData.games) ? gData.games : [];

    const sState = (sData && Array.isArray(sData.stops)) ? ensureDoc(deepClone(sData)) : Object.assign({}, DEFAULT_DOC, { stops: [] });
    state = sState;

    renderGameList();
    renderStopsList();
    renderTags();
    // Auto-open a new stop form so the editor is immediately ready to use
    document.getElementById('s-newBtn').click();
    // Take the snapshot AFTER the auto-created stop is added so isDirty() starts false —
    // the badge should only appear when the user makes their own edits
    loadedStopsSnapshot = deepClone(toDoc());
  } catch(e) {
    document.getElementById('gameList').innerHTML = '<div class="empty" style="color:var(--err)">Could not load — is server.js running?</div>';
  }
}

// ── Panel footers ──────────────────────────────
// Mirrors each panel's header into a sticky footer at the bottom of the panel.
// This makes the New/Save/Archive buttons accessible without scrolling on tall panels.
// A MutationObserver keeps the footer in sync when the header content changes dynamically
// (e.g. the Archive button toggling between "Archive" and "Unarchive").
function setupPanelFooters() {
  document.querySelectorAll('.panel').forEach(panel => {
    const head = panel.querySelector('.panel-head');
    if(!head) return;
    if(!head.querySelector('button')) return; // skip panels with no buttons in header

    const foot = document.createElement('div');
    foot.className = 'panel-foot';

    function syncFoot() {
      // Clone the header HTML into the footer, renaming all IDs with a -foot suffix
      // to avoid duplicate IDs in the document
      foot.innerHTML = head.innerHTML.replace(/\bid="([^"]+)"/g, 'id="$1-foot"');
      // Wire footer button clicks through to their header counterparts so all logic stays in one place
      foot.querySelectorAll('[id]').forEach(footEl => {
        const origId = footEl.id.replace(/-foot$/, '');
        footEl.addEventListener('click', e => {
          e.stopPropagation();
          document.getElementById(origId)?.click();
        });
      });
    }

    syncFoot();
    // Re-sync whenever the header DOM changes (button text, disabled state, visibility, etc.)
    new MutationObserver(syncFoot).observe(head, { subtree: true, childList: true, attributes: true, characterData: true });

    panel.appendChild(foot);
  });
}

// ── Image picker helpers ───────────────────────
// Creates a coordinated image picker that accepts either a file upload or a URL.
// The chosen value is stored in a hidden input so saveAll() can read it simply.
// Returns a `load(val)` function used by openDetails/openNewGame to populate the picker.
function setupImgPicker(fileInputId, urlInputId, hiddenId, previewId, defaultValue) {
  const fileInput = document.getElementById(fileInputId);
  const urlInput  = document.getElementById(urlInputId);
  const hidden    = document.getElementById(hiddenId);
  const preview   = document.getElementById(previewId);

  function toRelativeDisplay(raw) {
    const val = String(raw || '').trim();
    if(!val) return '';
    if(/^(https?:|data:|blob:)/i.test(val)) return val;
    let path = val.replace(/^([A-Za-z]:)?[\\/]+fakepath[\\/]+/i, '');
    path = path.split(/[?#]/)[0].replace(/\//g, '\\').replace(/^\.\//, '').replace(/^\.\\/, '');
    if(/^play\\/i.test(path) || /^index\.ico$/i.test(path)) return path;
    if(/^assets\\/i.test(path)) return 'play\\' + path;
    const base = String(defaultValue || '').replace(/\//g, '\\');
    const baseDir = base.includes('\\') ? base.slice(0, base.lastIndexOf('\\')) : '';
    return baseDir ? ('play\\' + baseDir + '\\' + path) : path;
  }

  function setVisibleVal(display, editValue) {
    const shown = String(display || '');
    const editable = String(editValue != null ? editValue : shown);
    urlInput.dataset.displayValue = shown;
    urlInput.dataset.editValue = editable;
    urlInput.value = shown;
  }

  function setVal(val, display, editValue) {
    hidden.value = val;
    if(val) {
      preview.src = val;
      preview.style.display = '';
    } else {
      preview.src = '';
      preview.style.display = 'none';
    }
    setVisibleVal(display, editValue);
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const relativePath = toRelativeDisplay(fileInput.value || file.name);
      setVal(e.target.result, relativePath, relativePath); // Stores as a data: URI
    };
    reader.readAsDataURL(file);
  });

  urlInput.addEventListener('input', () => {
    // When a URL is typed, clear the file input so the two fields stay mutually exclusive
    fileInput.value = '';
    const raw = urlInput.value.trim();
    hidden.value = raw;
    if(raw) {
      preview.src = raw;
      preview.style.display = '';
    } else {
      preview.src = '';
      preview.style.display = 'none';
    }
    urlInput.dataset.editValue = raw;
    urlInput.dataset.displayValue = toRelativeDisplay(raw);
  });

  urlInput.addEventListener('focus', () => {
    urlInput.value = urlInput.dataset.editValue || '';
  });

  urlInput.addEventListener('blur', () => {
    urlInput.value = urlInput.dataset.displayValue || '';
  });

  // Expose a load() method so openDetails/openNewGame can populate the picker programmatically
  return {
    load: (val, options) => {
      const raw = val || '';
      const opts = options || {};
      const display = opts.blank || (defaultValue && raw === defaultValue) ? '' : (opts.display || (String(raw).startsWith('data:') ? '' : toRelativeDisplay(raw)));
      const editValue = opts.blank ? '' : (opts.editValue != null ? opts.editValue : (String(raw).startsWith('data:') ? display : raw));
      setVal(raw, display, editValue);
      fileInput.value = '';
    }
  };
}

const logoPicker      = setupImgPicker('g-logo-file',      'g-logo-url',      'g-logo',      'g-logo-preview',      'assets/logo.png');
const thumbnailPicker = setupImgPicker('g-thumbnail-file', 'g-thumbnail-url', 'g-thumbnail', 'g-thumbnail-preview', 'assets/logo.png');
const faviconPicker   = setupImgPicker('g-favicon-file',   'g-favicon-url',   'g-favicon',   'g-favicon-preview',   'index.ico');

// ── Publish button (local only) ────────────────
// The Publish button is hidden in production (GitHub Pages); only shown when running locally
if(IS_LOCAL) document.getElementById('g-publishBtn').style.display = '';

// Publish = saveAll() + POST /publish, which triggers a git commit and push on the server.
// This deploys the updated games.json and stops.json to GitHub Pages.
document.getElementById('g-publishBtn').addEventListener('click', async () => {
  const btn = document.getElementById('g-publishBtn');
  const orig = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;
  try {
    await saveAll();
    btn.textContent = 'Publishing…';
    const res = await fetch(API + '/publish', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ message: 'update game data' })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Publish failed');
    btn.textContent = 'Published!';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2500);
  } catch(e) {
    btn.textContent = 'Failed';
    btn.title = e.message; // Error detail visible on hover
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; btn.title = ''; }, 3000);
  }
});

init();

