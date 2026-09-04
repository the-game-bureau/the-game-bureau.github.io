// nfl-seed-shape.js -- runs every rule public.challenges enforces on a
// multiple_choice row over the rows in ten-nfl-challenges.sql BEFORE anybody
// pastes it, and the Challenge Bank's own duplicate rule against the LIVE
// table. A seed that fails a CHECK fails as a 23514 in the SQL editor with a
// constraint name; this says which row and why.
//
//   node mc/_dev/browser-checks/nfl-seed-shape.js
//
// The SQL is parsed with a tiny hand walker rather than a regex, because the
// tuples hold quoted strings and this repo has lost enough files to a
// backslash eaten between a heredoc and a regex.

const fs = require('fs');
const path = require('path');
const https = require('https');

const SEED = path.join(__dirname, '..', '..', 'supabase', 'seeds', 'ten-nfl-challenges.sql');
const API = 'https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1';
const KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

let okCount = 0, failCount = 0;
function is(label, pass, got) {
  if (pass) { okCount++; console.log('  ok   ' + label); }
  else { failCount++; console.log('  FAIL ' + label + (got === undefined ? '' : '   got: ' + JSON.stringify(got))); }
}

// ---- parse the values list: a sequence of tuples of SQL literals ----------
function parseValues(sql) {
  const start = sql.indexOf(') values');
  const body = sql.slice(start + ') values'.length);
  const rows = [];
  let i = 0;
  function skipWs() { while (i < body.length && ' \t\r\n'.indexOf(body[i]) >= 0) i++; }
  function readString() {
    // body[i] is the opening quote
    i++;
    let out = '';
    while (i < body.length) {
      if (body[i] === "'") {
        if (body[i + 1] === "'") { out += "'"; i += 2; continue; }
        i++; return out;
      }
      out += body[i++];
    }
    throw new Error('unterminated string');
  }
  function readValue() {
    skipWs();
    if (body[i] === "'") return readString();
    if (body.startsWith('array[', i)) {
      i += 'array['.length;
      const arr = [];
      for (;;) {
        skipWs();
        if (body[i] === ']') { i++; return arr; }
        if (body[i] === ',') { i++; continue; }
        arr.push(readString());
      }
    }
    if (body.startsWith('null', i)) { i += 4; return null; }
    throw new Error('unexpected at ' + i + ': ' + body.slice(i, i + 20));
  }
  for (;;) {
    skipWs();
    if (body[i] !== '(') break;
    i++;
    const vals = [];
    for (;;) {
      vals.push(readValue());
      skipWs();
      if (body[i] === ',') { i++; continue; }
      if (body[i] === ')') { i++; break; }
      throw new Error('bad tuple at ' + i);
    }
    rows.push({ type: vals[0], ladder_key: vals[1], name: vals[2], prompt: vals[3], answer: vals[4], choices: vals[5], tags: vals[6] });
    skipWs();
    if (body[i] === ',') { i++; continue; }
    break;
  }
  return rows;
}

// The database's own word test, as in challenges_mc_answer_not_in_prompt.
function words(s) {
  return ' ' + String(s).toLowerCase().split('').map(function (ch) {
    return /[a-z0-9]/.test(ch) ? ch : ' ';
  }).join('').split(' ').filter(Boolean).join(' ') + ' ';
}

function get(pathAndQuery) {
  return new Promise(function (resolve, reject) {
    https.get(API + pathAndQuery, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }, function (res) {
      let buf = '';
      res.on('data', function (d) { buf += d; });
      res.on('end', function () { resolve(JSON.parse(buf)); });
    }).on('error', reject);
  });
}

(async function main() {
  const sql = fs.readFileSync(SEED, 'utf8');
  const rows = parseValues(sql);
  console.log('seed rows parsed: ' + rows.length);
  is('ten rows', rows.length === 10, rows.length);
  is('no em dash anywhere in the file', sql.indexOf(String.fromCharCode(8212)) < 0);
  is('no control bytes in the file', !sql.split('').some(function (c) {
    const n = c.charCodeAt(0); return n < 32 && n !== 9 && n !== 10 && n !== 13;
  }));

  const dests = await get('/destinations?select=id&league=eq.NFL');
  const destIds = new Set(dests.map(function (d) { return d.id; }));
  const live = await get('/challenges?select=id,name,prompt,ladder_key');

  rows.forEach(function (r, n) {
    const tag = '[' + (n + 1) + ' ' + r.name + '] ';
    is(tag + 'type is multiple_choice', r.type === 'multiple_choice', r.type);
    is(tag + 'ladder_key is a real NFL destination', destIds.has(r.ladder_key), r.ladder_key);
    is(tag + 'ladder_key is lowercase and not blank', r.ladder_key === r.ladder_key.toLowerCase() && r.ladder_key.trim() !== '');
    is(tag + 'has a prompt', !!r.prompt && r.prompt.trim() !== '');
    is(tag + 'has an answer', !!r.answer && r.answer.trim() !== '');
    is(tag + 'four options', Array.isArray(r.choices) && r.choices.length === 4, r.choices && r.choices.length);
    is(tag + 'answer is one of the options, spelled identically', r.choices.indexOf(r.answer) >= 0, r.answer);
    is(tag + 'options are distinct', new Set(r.choices).size === r.choices.length);
    is(tag + 'answer is not a word of the question', words(r.prompt).indexOf(words(r.answer)) < 0);
    is(tag + 'does not open with "One word"', !r.prompt.trim().toLowerCase().startsWith('one word'));
    is(tag + 'tags are lowercase with no spaces', r.tags.every(function (t) { return t === t.toLowerCase() && t.indexOf(' ') < 0 && t !== ''; }), r.tags);
    is(tag + 'tags carry nfl, the club, and one of positive or negative',
      r.tags.indexOf('nfl') >= 0
        && r.tags.indexOf(r.ladder_key.split('-nfl-')[1]) >= 0
        && (r.tags.indexOf('positive') >= 0) !== (r.tags.indexOf('negative') >= 0), r.tags);
    is(tag + 'the city tag is the key\'s own city', r.tags.indexOf(r.ladder_key.split('-nfl-')[0].split('-').slice(0, -1).join('-')) >= 0, r.tags);
    is(tag + 'the name is short and not the question', r.name.length <= 40 && r.name !== r.prompt, r.name);
    const dupQ = live.find(function (l) { return words(l.prompt || '') === words(r.prompt); });
    is(tag + 'no live row asks the same question', !dupQ, dupQ && dupQ.id);
    const dupN = live.find(function (l) { return words(l.name || '') === words(r.name); });
    is(tag + 'no live row carries the same name', !dupN, dupN && dupN.id);
  });
  const pos = rows.filter(function (r) { return r.tags.indexOf('positive') >= 0; }).length;
  is('a mix: five positive, five negative', pos === 5, pos);
  is('ten distinct clubs', new Set(rows.map(function (r) { return r.ladder_key; })).size === 10);

  console.log('');
  console.log(okCount + ' ok, ' + failCount + ' FAIL');
  if (okCount === 0) { console.log('ZERO ASSERTIONS IS NOT SUCCESS'); process.exit(2); }
  process.exit(failCount ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
