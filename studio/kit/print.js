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
 *   contents.html?sampler=1                the free sampler's pages only
 *   ...&autoprint                          open the print dialog once laid out (Save as PDF)
 *
 * Text filled from game.json anywhere in the page: {{title}} {{subtitle}} {{tagline}} {{kicker}}
 * {{url}} {{price}} {{sheets}} (print.sheets), and as HTML {{steps}} {{specs}} {{description}}.
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
      '<a href="/studio/edit.html?game=' + encodeURIComponent(NB.folder().replace(/^\/|\/$/g, '')) + '">Edit</a><button type="button" onclick="print()">Print / Save PDF</button>';
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

    // 2. Free sampler (?sampler=1): keep the rules plus the pages marked data-sampler,
    //    or, if none are marked, the first print.samplerPages pages (default 2).
    if (q.get('sampler') === '1') {
      const pages = [...document.querySelectorAll('.page')];
      const marked = pages.filter(p => p.hasAttribute('data-sampler'));
      const keep = new Set(marked.length ? marked : pages.slice(0, g.print.samplerPages == null ? 2 : g.print.samplerPages));
      pages.forEach(p => { if (!keep.has(p)) p.remove(); });
      document.querySelectorAll('[data-full-only]').forEach(el => el.remove());
    }

    // 3. Put the rules (rules.md) wherever <section data-rules> sits.
    for (const el of document.querySelectorAll('[data-rules]')) {
      el.classList.add('flow', 'pk-rules');
      el.innerHTML = await NB.loadRules();
    }

    if (q.get('sampler') === '1') document.querySelectorAll('[data-sampler-only]').forEach(el => el.hidden = false);
    else document.querySelectorAll('[data-sampler-only]').forEach(el => el.remove());
    toolbar(g, (q.get('sampler') === '1' ? 'Free sampler: ' : '') + (b ? 'Contents with ' + b + ' in bleed, ' : 'Contents, ') + r3(PW) + ' x ' + r3(PH) + ' in', '<a href="?">Full, with bleed</a><a href="?bleed=0">Full, no bleed</a><a href="?bleed=0&sampler=1">Sampler</a>');
    if (b) document.body.classList.add('pk-has-bleed');
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

    let PW, PH, label;
    if (layout === 'front' || layout === 'back') {
      PW = W; PH = H;
      const el = layout === 'front' ? front : back;
      wrap.appendChild(panel(el, 'pk-' + layout, [m, m, m, m]));
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
      if (spineEl && spine >= (g.print.spineTextMin || 0.25)) s.appendChild(spineEl);
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
        description: (g.description || []).map(p => '<p>' + NB.esc(p) + '</p>').join(''),
      };
      vars.sheets = String(g.print.sheets || 24);
      vars.kicker = g.kicker || '';
      document.body.innerHTML = document.body.innerHTML
        .replace(/\{\{(steps|specs|description)\}\}/g, (x, k) => html[k])
        .replace(/\{\{(title|subtitle|tagline|url|price|sheets|kicker)\}\}/g, (x, k) => NB.esc(vars[k]));
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
