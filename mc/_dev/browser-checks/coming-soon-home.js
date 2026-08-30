const puppeteer = require('puppeteer-core');
let ok=0,bad=0; const t=(m,c,g)=>c?(ok++,console.log('  ok  '+m)):(bad++,console.log('  FAIL '+m+(g!==undefined?'   got: '+g:'')));
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox']});
  const p=await b.newPage();
  const bad404=[]; p.on('requestfailed',r=>bad404.push(r.url()));
  const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.setViewport({width:390,height:640});
  await p.goto('http://127.0.0.1:5599/',{waitUntil:'networkidle2',timeout:30000});
  const m=await p.evaluate(()=>({
    h1: document.querySelector('h1').innerText,
    docH: document.documentElement.scrollHeight,
    winH: window.innerHeight,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    bg: getComputedStyle(document.body).backgroundColor,
    links: [...document.querySelectorAll('a')].map(a=>a.getAttribute('href')),
    markW: document.querySelector('.mark svg').getBoundingClientRect().width
  }));
  t('it says opening soon', /opening/i.test(m.h1), m.h1.replace(/\n/g,' '));
  t('it fits one phone screen without scrolling ('+m.docH+' vs '+m.winH+')', m.docH<=m.winH+1, m.docH+'/'+m.winH);
  t('and never scrolls sideways', !m.overflowX);
  t('the ground is painted, not borrowed', m.bg!=='rgba(0, 0, 0, 0)', m.bg);
  t('the pin is drawn and has a size', m.markW>10, m.markW);
  t('no link leads back into the unfinished pages',
    m.links.every(h=>/^mailto:/.test(h)), m.links.join(', '));
  t('nothing failed to load', bad404.length===0, bad404.join(', '));
  t('no console errors', errs.length===0, errs.join(' | '));
  await p.setViewport({width:1440,height:900});
  await p.reload({waitUntil:'networkidle2'});
  const d=await p.evaluate(()=>({docH:document.documentElement.scrollHeight,winH:window.innerHeight}));
  t('and one desktop screen too ('+d.docH+' vs '+d.winH+')', d.docH<=d.winH+1, d.docH+'/'+d.winH);
  await b.close();
  console.log('\n'+ok+' ok, '+bad+' FAIL'); process.exit(bad?1:0);
})();
