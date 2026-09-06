const http=require('http'),fs=require('fs'),path=require('path');
const pup=require('C:/tmp/node_modules/puppeteer-core');
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
let ok=0,bad=0;const t=(m,c,g)=>c?(ok++,console.log('  ok   '+m)):(bad++,console.log('  FAIL '+m+(g===undefined?'':'   got: '+JSON.stringify(g))));
(async()=>{const root='C:/Code/the-game-bureau';
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');let f=path.join(root,decodeURIComponent(u.pathname));
if(u.pathname.endsWith('/'))f=path.join(f,'index.html');
fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>srv.listen(9240,r));
const br=await pup.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox'],protocolTimeout:240000});
const p=await br.newPage();await p.setViewport({width:1600,height:900});
const errs=[],writes=[];
p.on('pageerror',e=>errs.push(String(e.message).split(String.fromCharCode(10))[0]));
await p.evaluateOnNewDocument(()=>{window.__a=null;window.TgbMcAdminAuth={create:(o)=>{window.__a=o.onAuthorized;return{getSession:()=>({access_token:'p'}),init:()=>{}};}};window.TgbAdminSiteNav={bindAuth:()=>{}};});
await p.setRequestInterception(true);
p.on('request',q=>{const u=q.url(),m=q.method();
 const H={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-expose-headers':'content-range'};
 if(u.indexOf('supabase.co')===-1){q.continue();return;}
 if(m==='OPTIONS'){q.respond({status:204,headers:H});return;}
 if(m==='GET'){q.continue();return;}
 writes.push({m:m,u:u.slice(-40)});q.respond({status:200,contentType:'application/json',headers:H,body:'[]'});});
await p.goto('http://127.0.0.1:9240/mc/games/index.html',{waitUntil:'domcontentloaded'});
await p.evaluate(async()=>{document.body.classList.add('mc-auth-authorized');if(window.__a)await window.__a();});
await p.waitForFunction(()=>document.querySelectorAll('#gamePickerList option').length>5,{timeout:60000});
await new Promise(r=>setTimeout(r,2500));

const before=await p.evaluate(()=>{const b=document.getElementById('gameEraseBtn');
 const box=b.closest('.builder-nav-row');const kids=[...box.querySelectorAll('button')].map(x=>x.id);
 return{exists:!!b,text:b.textContent.trim(),aria:b.getAttribute('aria-disabled'),title:b.title,
  inLifecycle:box.classList.contains('builder-nav-row--lifecycle'),order:kids,
  sep:!!box.querySelector('.builder-nav-sep'),
  colour:getComputedStyle(b).color,dialogOpen:!document.getElementById('gameEraseBackdrop').hidden};});
t('the Delete button exists',before.exists);
t('and it is in the lifecycle box after New and Duplicate',
  before.inLifecycle && before.order.join(',')==='builderNewGameBtn,duplicateGameBtn,gameEraseBtn',before.order);
t('with a hairline separating it from them',before.sep);
/* THE PAGE OPENS A GAME ON LOAD, so "no game open" is not a state you can
   arrive in -- an earlier draft of this check asserted it and failed on a page
   that was correct. The real off case is a game that is not IN THE DATABASE
   yet: press New and there is nothing to delete. */
await p.evaluate(()=>startNewPhone());
await new Promise(r=>setTimeout(r,2000));
const fresh=await p.evaluate(()=>{const b=document.getElementById('gameEraseBtn');
 return{aria:b.getAttribute('aria-disabled'),title:b.title,entry:!!getCurrentGameArchiveEntry()};});
t('on a game not yet saved it is off, and says why',
  fresh.aria==='true'&&/open a game/i.test(fresh.title)&&fresh.entry===false,fresh);
t('and pressing it then opens nothing',(await p.evaluate(()=>{document.getElementById('gameEraseBtn').click();
  return document.getElementById('gameEraseBackdrop').hidden;}))===true);

await p.evaluate(async()=>{const ids=gamePickerOrderedGames().map(e=>e.game.id);await openSavedGameById(ids[2],{});});
await new Promise(r=>setTimeout(r,3000));
const open=await p.evaluate(()=>{const b=document.getElementById('gameEraseBtn');
 return{aria:b.getAttribute('aria-disabled'),title:b.title,cur:state.currentGameId};});
t('with a game open it turns on',open.aria==='false'&&/delete this game/i.test(open.title),open);

/* IT WAS ASYNCHRONOUS FOR AN HOUR, while it counted what a delete takes with
   it before asking. The cascade sentence was cut the same day and the counter
   with it, so the message is written in one go again -- and the wait is KEPT,
   because a check that waits on a condition already true costs nothing and
   would have to be rewritten the next time the question grows a lookup. */
await p.evaluate(()=>{document.getElementById('gameEraseBtn').click();});
await p.waitForFunction(
  ()=>/for good/i.test(document.getElementById('gameEraseMessage').textContent||''),
  {timeout:20000});
const dlg=await p.evaluate(()=>{
 const back=document.getElementById('gameEraseBackdrop');
 return{open:!back.hidden,msg:(document.getElementById('gameEraseMessage').textContent||'').trim(),
  buttons:[...back.querySelectorAll('button')].map(b=>b.textContent.trim())};});
t('pressing it asks first',dlg.open,dlg);
t('and the question names the game',dlg.msg.length>40&&!/^Erase\?$/.test(dlg.msg),dlg.msg.slice(0,90));
t('and offers Skip instead of deleting',dlg.buttons.some(b=>/skip/i.test(b)),dlg.buttons);
/* ONE WORD FOR ONE ACT: the button that opens this says Delete, so the one
   that does it must too. It said Erase. The COLUMN is still `erased`. */
t('and the confirm button says the same word as the trigger',
  dlg.buttons.some(b=>/^delete$/i.test(b))&&!dlg.buttons.some(b=>/erase/i.test(b)),dlg.buttons);
t('nothing has been written yet',writes.length===0,writes);

await p.evaluate(()=>{[...document.querySelectorAll('#gameEraseBackdrop button')].filter(b=>/cancel/i.test(b.textContent))[0].click();});
await new Promise(r=>setTimeout(r,600));
t('cancel closes it and writes nothing',
  (await p.evaluate(()=>document.getElementById('gameEraseBackdrop').hidden))===true && writes.length===0,writes);
t('no page errors',errs.length===0,errs.slice(0,3));
await br.close();srv.close();
console.log('');console.log(ok+' ok, '+bad+' FAIL');process.exit(bad?1:0);})();
