const puppeteer=require('puppeteer-core');
let ok=0,bad=0;const t=(m,c,g)=>c?(ok++,console.log('  ok  '+m)):(bad++,console.log('  FAIL '+m+(g!==undefined?'   got: '+g:'')));
(async()=>{
 const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox']});
 const p=await b.newPage();
 for (const u of ['/', '/soundtracks/', '/games/', '/mc/audiences/', '/mc/trivia/', '/gifts/']) {
   const got=[];
   p.removeAllListeners('response');
   p.on('response',r=>{ if(/favicon\.ico|icon-32|apple-touch/.test(r.url())) got.push(r.status()); });
   await p.goto('http://127.0.0.1:5599'+u,{waitUntil:'networkidle2',timeout:30000});
   const links=await p.evaluate(()=>[...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]')]
     .map(l=>l.getAttribute('rel')+' '+l.getAttribute('href')));
   t(u+' offers a PNG first-class', links.some(l=>/icon-32\.png\?v=2/.test(l)), links.join(' | '));
   t(u+' versions the ico', links.some(l=>/favicon\.ico\?v=2/.test(l)));
   /* CHROME FETCHES A FAVICON ONCE PER ORIGIN and reuses it for every later
      page in the session, so a per-page request count is only meaningful for
      the FIRST page. Asserting it on all six failed three correct pages. */
   if (u === '/') t('the first page actually fetches one',
     got.length>0 && got.every(s=>s===200), got.join(','));
   t(u+' asks for nothing that 404s', got.every(s=>s===200), got.join(','));
 }
 // AND THE FILES THEMSELVES DECODE TO THE PIN.
 for (const f of ['/icon-32.png?v=2','/apple-touch-icon.png?v=2','/favicon.ico?v=2']) {
   const r=await p.goto('http://127.0.0.1:5599'+f);
   const px=await p.evaluate((s)=>new Promise((res)=>{const im=new Image();
     im.onload=()=>{const c=document.createElement('canvas');c.width=32;c.height=32;
       const x=c.getContext('2d');x.drawImage(im,0,0,32,32);
       const d=x.getImageData(0,0,32,32).data;let a=0;
       for(let i=0;i<d.length;i+=4){if(Math.abs(d[i]-245)<45&&Math.abs(d[i+1]-180)<45&&Math.abs(d[i+2]-97)<45)a++;}
       res(a);};im.onerror=()=>res(-1);im.src=s;}), f);
   t(f+' decodes to the pin', r.status()===200 && px>10, r.status()+' amber='+px);
 }
 await b.close();
 console.log('\n'+ok+' ok, '+bad+' FAIL'); process.exit(bad?1:0);
})();
