/* THE LOGO BAR: A PICKER, A WHITE FRAME, AND A DOOR TO THE LOGO STUDIO.
   ---------------------------------------------------------------------------
   Built to the GUIDE BAR shape because a logo is the same kind of object: a
   thing chosen from a catalogue whose picture lives IN the row rather than at
   an address that rots. The CSS is SHARED with the guide bar -- each rule
   names both -- so the two cannot drift into two ways of drawing one idea.

   IT NEEDS TWO REAL ROWS IN public.logos, one with an image and one without.
   The table is empty by design, so seed them and delete them after:

     insert into public.logos (name, image) values
       (Bureau Mark, a 1x1 png data uri), (Plain Mark, null);

   THE WRITE IS INTERCEPTED, NEVER SENT -- a check has no business writing to
   the paid product, and a probe that let one through earlier the same day cost
   a real game its clubs. */
const http=require('http'),fs=require('fs'),path=require('path');
const puppeteer=require('C:/tmp/node_modules/puppeteer-core');
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'};
let ok=0,fail=0;
const is=(w,c,g)=>{if(c){ok++;console.log('  ok   '+w);}else{fail++;console.log('  FAIL '+w+(g===undefined?'':'   got: '+JSON.stringify(g)));}};
(async()=>{
  const root='C:/Code/the-game-bureau';
  const server=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');let f=path.join(root,decodeURIComponent(u.pathname));
    if(u.pathname.endsWith('/'))f=path.join(f,'index.html');
    fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});r.end(b);});});
  await new Promise(r=>server.listen(8881,r));
  const br=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
  const writes=[],errs=[];
  try{
    const p=await br.newPage(); await p.setViewport({width:1500,height:1200});
    p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
    await p.evaluateOnNewDocument(()=>{window.__a=null;
      window.TgbMcAdminAuth={create:(o)=>{window.__a=o.onAuthorized;return{getSession:()=>null,init:()=>{}};}};
      window.TgbAdminSiteNav={bindAuth:()=>{}};});
    await p.setRequestInterception(true);
    p.on('request',(req)=>{const u=req.url();
      if(u.indexOf('supabase.co')===-1||req.method()==='GET'||req.method()==='OPTIONS'){req.continue();return;}
      writes.push({u:u,m:req.method(),b:req.postData()});
      req.respond({status:200,contentType:'application/json',
        headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'},
        body:'[{"id":"nor2026car1"}]'});});
    await p.goto('http://127.0.0.1:8881/mc/games/?id=nor2026car1',{waitUntil:'networkidle2'});
    await p.evaluate(async()=>{document.body.classList.add('mc-auth-authorized');if(window.__a)await window.__a();});
    await new Promise(r=>setTimeout(r,4000));
    /* WAIT FOR THE CATALOGUE, NOT FOR A CLOCK. Measured on a fixed sleep this
       check failed four ways on a page that was perfectly correct -- the logo
       list simply had not arrived, so paintLogoField had not run its real
       pass. A check that passes only sometimes is worth nothing. */
    await p.waitForFunction(function(){return typeof builderLogoList!=='undefined'&&builderLogoList.length>0;},{timeout:20000});
    await new Promise(r=>setTimeout(r,300));

    const m=await p.evaluate(()=>{
      const bars=[...document.querySelectorAll('.game-id-bar')].map(b=>({id:b.id,legend:(b.querySelector('legend')||{}).textContent,y:Math.round(b.getBoundingClientRect().y)}));
      const sel=document.getElementById('nodeLogoSelect');
      const shot=document.getElementById('logoPickShot');
      const door=document.getElementById('logoStudioBtn');
      const r=shot?shot.getBoundingClientRect():null, sr=sel?sel.getBoundingClientRect():null, dr=door?door.getBoundingClientRect():null;
      return {bars, opts:sel?[...sel.options].map(o=>o.textContent):null, disabled:sel?sel.disabled:null,
        shotBg:shot?getComputedStyle(shot).backgroundColor:null,
        doorRight:!!(sr&&dr&&dr.x>=sr.right), sameLine:!!(sr&&dr&&dr.y<sr.bottom&&sr.y<dr.bottom),
        shotLeft:!!(r&&sr&&r.right<=sr.x), href:door?door.getAttribute('href'):null,
        noneShown:!(document.getElementById('logoPickNone')||{hidden:true}).hidden, noneEl:!!document.getElementById('logoPickNone'), noneHiddenRaw:(document.getElementById('logoPickNone')||{}).hidden, curId:(typeof state!=='undefined'&&state)?state.currentGameId:'(no state)', hasStore:(typeof hasSupabaseStore==='function')?hasSupabaseStore():'(none)'};
    });
    const bar=m.bars.find(b=>b.id==='logoBar');
    is('there is a LOGO bar',!!bar&&bar.legend==='Logo',bar);
    is('it sits between Guide and Tags',(()=>{const o=m.bars.sort((a,b)=>a.y-b.y).map(b=>b.id);
      return o.indexOf('logoBar')===o.indexOf('guideBar')+1 && o.indexOf('tagsBar')===o.indexOf('logoBar')+1;})(),
      m.bars.sort((a,b)=>a.y-b.y).map(b=>b.id).join(','));
    is('the picker lists the catalogue',!!m.opts&&m.opts.some(o=>/Bureau Mark/.test(o))&&m.opts.some(o=>/Plain Mark/.test(o)),m.opts);
    is('and a blank first option',!!m.opts&&/No logo/.test(m.opts[0]),m.opts&&m.opts[0]);
    is('the picker is live on an open game',m.disabled===false,m.disabled);
    is('the frame is white',/^rgb\(255, 255, 255\)$/.test(m.shotBg),m.shotBg);
    is('the frame is left of the picker',m.shotLeft);
    is('the door is right of the picker and on its line',m.doorRight&&m.sameLine);
    is('the door goes to the Logo Studio',m.href==='/mc/logostudio/',m.href);
    is('an empty slot says NO LOGO',m.noneShown);

    // CHOOSE ONE -> it must PATCH logo_id and paint the image.
    writes.length=0;
    const after=await p.evaluate(async()=>{
      const s=document.getElementById('nodeLogoSelect');
      const o=[...s.options].find(x=>/Bureau Mark/.test(x.textContent));
      s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise(r=>setTimeout(r,1200));
      const img=document.getElementById('logoPickImage');
      return {imgShown:!img.hidden, src:(img.getAttribute('src')||'').slice(0,22),
              fit:getComputedStyle(img).objectFit,
              noneHidden:(document.getElementById('logoPickNone')||{}).hidden, status:(document.getElementById('logoPickStatus')||{}).textContent, storedNow:(state&&state.currentGameMeta)?state.currentGameMeta.logoId:'(none)', listLen:(typeof builderLogoList!=='undefined')?builderLogoList.length:'(undef)'};
    });
    const w=writes.find(x=>x.u.indexOf('/games')!==-1&&x.m==='PATCH');
    is('choosing one PATCHes games',!!w,writes.map(x=>x.m+' '+x.u.slice(x.u.indexOf('/rest'))));
    const bodyJson=w?JSON.parse(w.b):{};
    is('it writes logo_id as a NUMBER',typeof bodyJson.logo_id==='number',bodyJson);
    is('and writes nothing else',w&&Object.keys(bodyJson).length===1,Object.keys(bodyJson));
    is('the frame paints the image',after.imgShown&&/^data:image\/png/.test(after.src),after);
    is('contained, not cropped',after.fit==='contain',after.fit);
    is('and NO LOGO is hidden',after.noneHidden===true,after.noneHidden);
    is('no uncaught page errors',errs.length===0,errs);
  } finally{await br.close();server.close();}
  console.log('');console.log(ok+' ok, '+fail+' FAIL');
  process.exit(fail?1:0);
})();
