/* Notebook kit: lays out the printable pages, cover.html and contents.html.
 * Load after kit.js. Sizes come from game.json "print":
 *   trim   [width, height] of the finished notebook in inches (default 8.5 x 11)
 *   bleed  extra ink past the trim on every outside edge (default 0.125 in)
 *   margin the safe area inside the trim that text stays within (default 0.5 in)
 *
 * URL options (the PDF builder sets these; you can too, to proof on screen):
 *   cover.html?layout=spread&spine=0.18   wraparound: back, spine, front, with bleed
 *   cover.html?layout=front | layout=back  one panel at trim size, no bleed
 *   contents.html?bleed=0                  trim size with no bleed (print-at-home copy)
 *   cover.html?layout=front&stamp=sampler  the free sampler's front cover: the chosen front cover, stamped SAMPLER
 *   contents.html?only=scoring          just one part: rules, scoring (fixed pages) or game (the repeated sheet)
 *   sampler.html?part=sampler              the sampler's own pages (any <section data-rules> in it is left out)
 *   ...&autoprint                          open the print dialog once laid out (Save as PDF)
 *
 * Text filled from game.json anywhere in the page: {{title}} {{subtitle}} {{tagline}} {{kicker}}
 * {{url}} {{price}} {{sheets}} (print.sheets), and as HTML {{steps}} {{specs}} {{description}}
 * {{image}} (photo 1 from Photos & video, or a pattern of squares until there is one),
 * {{qr}} (a QR code, as vector SVG in the text colour, that opens the game's web page) and
 * {{stepsHeading}} (game.json stepsHeading, or "How it works").
 *
 * When everything is laid out the page sets <body data-ready="1">.
 */
(function () {
  'use strict';
  const NB = window.NB;
  // Options come from the URL, or (in the admin page's live preview, which has no URL) from
  // <meta name="nb-query" content="layout=front">.
  const qm = document.querySelector('meta[name="nb-query"]');
  const q = new URLSearchParams(location.search + (qm ? (location.search ? '&' : '') + qm.content : ''));
  const r3 = n => Math.round(n * 1000) / 1000;
  const inch = n => r3(n) + 'in';

  function addStyle(css) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }

  function toolbar(g, label, extra) {
    if (q.has('pdf')) return;
    const bar = document.createElement('div');
    bar.className = 'pk-toolbar';
    bar.innerHTML = '<b>' + NB.esc(g.title) + '</b><span>' + NB.esc(label) + '</span>' + (extra || '') +
      '<a href="/studio/?game=' + encodeURIComponent(NB.folder().replace(/^\/|\/$/g, '')) + '">Edit</a><button type="button" onclick="print()">Print / Save PDF</button>';
    document.body.prepend(bar);
  }

  async function layoutContents(g) {
    const [W, H] = g.print.trim;
    const b = q.get('bleed') === '0' ? 0 : g.print.bleed;
    const m = g.print.margin;
    const PW = W + 2 * b, PH = H + 2 * b;
    const root = document.documentElement.style;
    root.setProperty('--pw', inch(PW)); root.setProperty('--ph', inch(PH));
    root.setProperty('--bleed', inch(b)); root.setProperty('--pad', inch(b + m));
    addStyle('@page{size:' + inch(PW) + ' ' + inch(PH) + ';margin:0}' +
      '@page flow{size:' + inch(PW) + ' ' + inch(PH) + ';margin:' + inch(b + m) + '}');

    // 0. ?only=rules|scoring|game keeps just that part, for the studio's Rules, Scoring and Game previews.
    //    rules is <section data-rules>, game is <template data-repeat>, scoring is everything else.
    //    A comma list keeps several: only=rules,scoring is the notebook without its game sheets, used when
    //    the game pages come from a link or a generator (game.json "pages").
    const only = q.get('only') ? q.get('only').split(',') : null;
    if (only) [...document.body.children].forEach(el => {
      if (el.tagName === 'SCRIPT') return;
      const part = el.matches('[data-rules]') ? 'rules' : el.matches('template[data-repeat]') ? 'game' : 'scoring';
      if (!only.includes(part)) el.remove();
    });

    // 1. Repeat any <template data-repeat="N">, filling {{n}} with 1..N.
    document.querySelectorAll('template[data-repeat]').forEach(t => {
      const n = +t.dataset.repeat || 1, start = +(t.dataset.start || 1);
      const per = +(t.dataset.per || 1); // items per page: {{n}} counts items, {{a}} {{b}} ... are page items
      let html = '';
      for (let i = 0; i < n; i++) {
        const k = start + i;
        html += t.innerHTML.replace(/\{\{n\}\}/g, k).replace(/\{\{n(\+|-)(\d+)\}\}/g, (x, op, d) => op === '+' ? k + +d : k - +d)
          .replace(/\{\{i\}\}/g, (i * per) + 1).replace(/\{\{i\+(\d+)\}\}/g, (x, d) => i * per + 1 + +d);
      }
      t.insertAdjacentHTML('beforebegin', html);
      t.remove();
    });

    // 2. The free sampler is always: the chosen front cover stamped SAMPLER, the rules, the scoring
    //    pages, then sampler.html's own pages (Kevin, 2026-11-27). The rules and scoring come from
    //    contents.html, so sampler.html (?part=sampler) never brings in rules of its own.
    const isSampler = q.get('part') === 'sampler';
    if (isSampler) document.querySelectorAll('[data-rules]').forEach(el => el.remove());

    // 3. Put the rules (rules.md) wherever <section data-rules> sits.
    for (const el of document.querySelectorAll('[data-rules]')) {
      el.classList.add('flow', 'pk-rules');
      el.innerHTML = await NB.loadRules(g);
    }

    toolbar(g, (isSampler ? 'Free sampler pages, ' : b ? 'Contents with ' + b + ' in bleed, ' : 'Contents, ') + r3(PW) + ' x ' + r3(PH) + ' in', isSampler ? '' : '<a href="?">Full, with bleed</a><a href="?bleed=0">Full, no bleed</a>');
    if (b) document.body.classList.add('pk-has-bleed');
  }

  // A QR code for a web address, as an inline SVG (qrcode.js, MIT, loaded only when a page uses {{qr}}).
  async function qrSVG(text) {
    if (!window.qrcode) await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = '/studio/kit/qrcode.js'; s.onload = ok; s.onerror = () => bad(new Error('Could not load the QR code maker')); document.head.appendChild(s); });
    const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
    const n = qr.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return '<svg class="pk-qr" viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" role="img" aria-label="QR code for ' + NB.esc(text) + '" shape-rendering="crispEdges"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="currentColor"/></svg>';
  }

  async function layoutCover(g) {
    const [W, H] = g.print.trim;
    const layout = q.get('layout') || 'spread';
    const front = document.querySelector('.cover-front');
    const back = document.querySelector('.cover-back');
    const spineEl = document.querySelector('.cover-spine');
    const m = g.print.margin;
    const root = document.documentElement.style;
    const wrap = document.createElement('div');
    wrap.className = 'pk-cover pk-' + layout;
    const panel = (el, cls, pads) => {
      const p = document.createElement('div');
      p.className = 'pk-panel ' + cls;
      if (el) { p.appendChild(el); el.style.padding = pads.map(inch).join(' '); }
      return p;
    };

    // ?stamp=sampler: the free sampler's front cover is the notebook's own chosen front cover with
    // the SAMPLER stamp on top. There is no separate sampler cover design.
    document.querySelectorAll('.cover-sampler').forEach(el => el.remove());

    // The game's web address goes on every front and back cover (notebook and sampler). A cover that
    // already shows it (most backs do, with {{url}}) is left alone; otherwise a small line is added at the bottom.
    const url = String(g.url || 'thegamebureau.com' + NB.folder()).replace(/^https?:\/\//, '').replace(/\/$/, '');
    const bare = t => t.toLowerCase().replace(/https?:\/\//g, '').replace(/\s+/g, '');
    [front, back].forEach(el => {
      if (!el || bare(el.textContent).includes(bare(url))) return;
      const u = document.createElement('div'); u.className = 'pk-url'; u.textContent = url; el.appendChild(u);
    });

    let PW, PH, label;
    if (layout === 'front' || layout === 'back') {
      PW = W; PH = H;
      const el = layout === 'front' ? front : back;
      const pn = panel(el, 'pk-' + layout, [m, m, m, m]);
      // ?stamp=sampler: the free sampler's front cover gets a rubber stamp across it.
      if (layout === 'front' && q.get('stamp') === 'sampler') pn.insertAdjacentHTML('beforeend', '<div class="pk-stamp" aria-hidden="true"><span>SAMPLER</span></div>');
      wrap.appendChild(pn);
      [front, back, spineEl].forEach(x => { if (x && x !== el) x.remove(); });
      label = (layout === 'front' ? 'Front' : 'Back') + ' cover, ' + W + ' x ' + H + ' in';
    } else {
      const b = q.get('bleed') === '0' ? 0 : g.print.bleed;
      const spine = Math.max(0, +(q.get('spine') || g.print.spine || 0));
      PW = 2 * W + spine + 2 * b; PH = H + 2 * b;
      root.setProperty('--panel-w', inch(W + b)); root.setProperty('--spine-w', inch(spine));
      wrap.appendChild(panel(back, 'pk-back', [b + m, m, b + m, b + m]));
      const s = document.createElement('div');
      s.className = 'pk-spine';
      // Spine text keeps 1/16 in clear on each side (what Lulu and KDP ask for) and is sized to
      // fit: 14 pt at most, and left off when the spine can't hold 6 pt (about 0.21 in).
      const room = (spine - 0.125) * 72; // points across the spine for the text
      const min = g.print.spineTextMin != null ? +g.print.spineTextMin : 0.125 + 6 / 72;
      if (spineEl && spine >= min && room > 0) { root.setProperty('--spine-font', Math.min(14, room).toFixed(2) + 'pt'); s.appendChild(spineEl); }
      else if (spineEl) spineEl.remove();
      wrap.appendChild(s);
      wrap.appendChild(panel(front, 'pk-front', [b + m, b + m, b + m, m]));
      label = 'Wraparound cover, ' + r3(PW) + ' x ' + r3(PH) + ' in (spine ' + spine + ' in, bleed ' + b + ' in)';
      if (b) document.body.classList.add('pk-has-bleed');
      root.setProperty('--bleed', inch(b));
    }
    root.setProperty('--pw', inch(PW)); root.setProperty('--ph', inch(PH));
    addStyle('@page{size:' + inch(PW) + ' ' + inch(PH) + ';margin:0}');
    // Anything else the author left in <body> (stray elements) is dropped from the cover.
    document.body.appendChild(wrap);
    toolbar(g, label, ['spread', 'front', 'back'].filter(l => l !== layout).map(l => '<a href="?layout=' + l + '">' + l[0].toUpperCase() + l.slice(1) + '</a>').join(''));
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const g = await NB.loadGame();
      g.print.margin = g.print.margin == null ? 0.5 : g.print.margin;
      document.title = g.title + ' · ' + document.body.dataset.page;
      // Fill {{title}}, {{subtitle}}, {{tagline}}, {{url}} anywhere in the page text.
      const vars = { title: g.title, subtitle: g.subtitle || '', tagline: g.tagline || '', url: g.url || 'thegamebureau.com' + NB.folder(), price: g.price || '' };
      const html = {
        steps: '<ol class="pk-steps">' + (g.steps || []).map(st => '<li><b>' + NB.esc(st.title) + '</b>' + NB.esc(st.text) + '</li>').join('') + '</ol>',
        specs: '<div class="pk-specs">' + (g.specs || []).map(sp => '<div><b>' + NB.esc(sp[0]) + '</b>' + NB.esc(sp[1]) + '</div>').join('') + '</div>',
        description: NB.descHTML(g.description),
        // The photo picked FOR NOTEBOOK COVER in Media, as it is when the page is generated.
        // With none picked, a pattern of squares stands in.
        image: (() => { const m = NB.coverPhoto(g); return m ? '<img class="pk-image" src="' + NB.esc(m.src) + '" alt="' + NB.esc(m.alt || g.title) + '"' + NB.focusStyle(m) + '>' : '<div class="pk-art" aria-hidden="true">' + '<i></i>'.repeat(16) + '</div>'; })(),
      };
      // {{qr}}: the game's web page as a QR code, drawn as one SVG path so it prints sharp.
      if (document.body.innerHTML.includes('{{qr}}')) html.qr = await qrSVG('https://' + String(vars.url).replace(/^https?:\/\//, ''));
      vars.stepsHeading = g.stepsHeading || 'How it works';
      vars.sheets = String(g.print.sheets || 72);
      vars.kicker = g.kicker || '';
      document.body.innerHTML = document.body.innerHTML
        .replace(/\{\{(steps|specs|description|image|qr)\}\}/g, (x, k) => html[k])
        .replace(/\{\{(title|subtitle|tagline|url|price|sheets|kicker|stepsHeading)\}\}/g, (x, k) => NB.esc(vars[k]));
      if (document.body.dataset.page === 'cover') await layoutCover(g);
      else await layoutContents(g);
      if (q.has('pdf')) document.body.classList.add('pk-pdf');
      await document.fonts.ready;
      await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      document.body.dataset.ready = '1';
      if (q.has('autoprint')) setTimeout(() => print(), 300);
    } catch (e) {
      document.body.dataset.ready = 'error';
      document.body.dataset.error = e.message;
      document.body.insertAdjacentHTML('afterbegin', '<p style="padding:24px;color:#b00">' + NB.esc(e.message) + '</p>');
    }
  });
})();
