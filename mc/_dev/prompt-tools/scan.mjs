// Scans the repo's PROMPT TEXT for em dashes. Prompt text only: template
// literals and string concatenations inside a build*Prompt function, a
// <textarea class="prompt">, or the tgb-agent-context block. Code comments are
// for humans and are exempt, which is why a blanket grep is the wrong tool.
import fs from 'node:fs';

const EM = '\u2014';
// PAGES that carry prompt text, and the .md files that ARE prompts. Six of the
// ten entries here were dead paths on 2026-09-04 -- rooms that had moved or been
// deleted -- and a missing file was SILENTLY SKIPPED, so this reported CLEAN
// while covering four of them. It names a missing entry now: a check that cannot
// see its subject is worse than none.
const FILES = [
  'mc/socializer/index.html', 'mc/soundtracks/index.html', 'mc/gifts/index.html',
  'mc/assets/waypoint-prompts.js', 'mc/picmaker/prompts.js',
  'mc/greenroom/index.html', 'mc/audiences/index.html', 'mc/challenges/index.html',
  'mc/waypoints/index.html'
];
// WHOLE-FILE PROMPTS. These are markdown a routine or a person follows start to
// finish, so there is no region to find: every line is prompt text. They were
// covered by NOTHING until 2026-09-04, which mattered most for socializer.md,
// since it holds both Socializer prompts in full.
const WHOLE = [
  'mc/socializer/socializer.md', 'mc/soundtracks/soundtracks.md',
  'mc/_dev/prompt-tools/path-bot.prompt.md',
  'mc/_dev/prompt-tools/trivia.prompt.md'
];

function regions(src) {
  const out = [];
  for (const re of [/<textarea[^>]*class="prompt"[^>]*>([\s\S]*?)<\/textarea>/g,
                    /id="tgb-agent-context">([\s\S]*?)<\/script>/g]) {
    let m; while ((m = re.exec(src))) out.push({ kind: 'block', text: m[1], at: m.index });
  }
  // string literals inside a prompt builder
  const fn = /function build\w*Prompt[\s\S]*?\n    \}/g;
  let m; while ((m = fn.exec(src))) out.push({ kind: 'builder', text: m[0], at: m.index });
  return out;
}

let total = 0, missing = 0;
for (const f of WHOLE) {
  if (!fs.existsSync(f)) { missing++; console.log('MISSING: ' + f); continue; }
  const n = (fs.readFileSync(f, 'utf8').match(/—/g) || []).length;
  if (n) { total += n; console.log(f + ': ' + n + ' em dash' + (n > 1 ? 'es' : '')); }
}
for (const f of FILES) {
  if (!fs.existsSync(f)) { missing++; console.log('MISSING: ' + f); continue; }
  const src = fs.readFileSync(f, 'utf8');
  let n = 0;
  for (const r of regions(src)) {
    if (r.kind === 'builder') {
      // count only inside quoted strings, never in // comments
      for (const line of r.text.split('\n')) {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) continue;
        n += (line.match(/\u2014/g) || []).length;
      }
    } else {
      n += (r.text.match(/\u2014/g) || []).length;
    }
  }
  if (n) console.log(`${String(n).padStart(4)}  ${f}`);
  total += n;
}
console.log(total === 0 ? 'CLEAN: no em dashes in prompt text' : `TOTAL ${total}`);
if (total) process.exitCode = 1;
if (missing) {
  console.log(`${missing} file${missing > 1 ? 's' : ''} in the list could not be read, so this run covered less than it says.`);
  process.exitCode = 1;
}
