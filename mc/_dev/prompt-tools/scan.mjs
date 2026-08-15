// Scans the repo's PROMPT TEXT for em dashes. Prompt text only: template
// literals and string concatenations inside a build*Prompt function, a
// <textarea class="prompt">, or the tgb-agent-context block. Code comments are
// for humans and are exempt, which is why a blanket grep is the wrong tool.
import fs from 'node:fs';

const EM = '\u2014';
const FILES = [
  'mc/socials/index.html', 'mc/soundtracks/admin/index.html', 'mc/gifts/index.html',
  'mc/assets/waypoint-prompts.js', 'mc/picmaker/prompts.js', 'mc/greenroom.html',
  'mc/data/events.html', 'mc/data/teams.html', 'mc/routes.html', 'mc/data/cities.html'
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

let total = 0;
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
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
