// Starts a new notebook game by copying the sample game.
//   node studio/kit/new-game.js <folder> "<Title>"
// e.g. node studio/kit/new-game.js pitch-count "Pitch Count"  ->  /pitch-count/ on the site
// Then edit <folder>/game.json, rules.md, cover.html and contents.html, and replace images/.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SAMPLE = path.join(ROOT, 'studio', 'dice-derby');
const [folder, title] = process.argv.slice(2);
if (!folder || !title || !/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/.test(folder)) {
  console.error('Usage: node studio/kit/new-game.js <folder> "<Title>"   (folder: lowercase letters, digits and dashes)');
  process.exit(2);
}
const dest = path.join(ROOT, folder);
if (fs.existsSync(dest)) { console.error(folder + '/ already exists.'); process.exit(1); }
const slug = path.basename(folder);
fs.cpSync(SAMPLE, dest, { recursive: true, filter: src => !src.includes(path.sep + 'pdf' + path.sep) && !src.endsWith(path.sep + 'pdf') });
fs.mkdirSync(path.join(dest, 'pdf'));
const g = JSON.parse(fs.readFileSync(path.join(dest, 'game.json'), 'utf8'));
g.slug = slug; g.title = title;
fs.writeFileSync(path.join(dest, 'game.json'), JSON.stringify(g, null, 2) + '\n');
for (const f of ['index.html', 'rules.html', 'cover.html', 'contents.html', 'rules.md']) {
  const p = path.join(dest, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8')
    .replace(/studio\/dice-derby/g, folder).replace(/dice-derby/g, slug)
    .replace(/Dice Derby/g, title).replace(/DICE DERBY/g, title.toUpperCase()));
}
console.log('Created ' + folder + '/ from the Dice Derby sample. Next: edit game.json, rules.md, cover.html, contents.html and images/.');
