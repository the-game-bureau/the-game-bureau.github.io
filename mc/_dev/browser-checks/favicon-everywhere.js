const puppeteer=require('puppeteer-core');
let ok=0,bad=0;const t=(m,c,g)=>c?(ok++,console.log('  ok  '+m)):(bad++,console.log('  FAIL '+m+(g!==undefined?'   got: '+g:'')));
(async()=>{
 const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox']});
 const p=await b.newPage();
 const seen={};
 p.on('response',r=>{ if(/favicon|\.ico/.test(r.url())) seen[r.url()]=r.status(); });
 for (const path of ['/', '/games/', '/mc/trivia/', '/soundtracks/', '/linkinbio/']) {
   await p.goto('http://127.0.0.1:5599'+path,{waitUntil:'networkidle2',timeout:30000});
   const href=await p.evaluate(()=>{const l=document.querySelector('link[rel="icon"]');return l?l.getAttribute('href'):null;});
   t(path+' points at the one icon', href==='/favicon.ico', href);
 }
 const r=await p.goto('http://127.0.0.1:5599/favicon.ico');
 t('the .ico is served', r.status()===200, r.status());
 const buf=await r.buffer();
 t('and it is a real ICO container ('+buf.length+' bytes)',
   buf[0]===0 && buf[1]===0 && buf[2]===1 && buf[3]===0, buf.slice(0,4).join(','));
 t('carrying more than one size', buf[4] > 1, buf[4]+' entries');
 const j=await p.goto('http://127.0.0.1:5599/shell/brand/tgb-pin.jpg');
 t('the jpg is served', j.status()===200, j.status());
 await b.close();
 console.log('\n'+ok+' ok, '+bad+' FAIL'); process.exit(bad?1:0);
})();
