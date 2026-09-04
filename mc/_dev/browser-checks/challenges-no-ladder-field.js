/* WHERE IT IS ASKED IS GONE, AND THE PREVIEW WITH IT (2026-09-03).

   The `ladder_key` field and the "How it reads in a real game" panel were both
   taken out of the Challenge Bank. **The column is still NOT NULL for trivia**
   -- `challenges_ladder_key_belongs_to_trivia` refuses a trivia row without one
   -- so the interesting half of this is the WRITE: the stored key has to be
   carried through untouched, and a new trivia row has to get the portable rung
   rather than nothing.
     It found a real one. `readForm` had no `row` in scope, so the first cut of
   this change made EVERY SAVE THROW -- caught by driving the form, which is the
   only thing that reaches that line.

   Reads go to the LIVE database; every write is intercepted, because a check
   has no business adding a challenge to the catalogue it is reading. */
const http=require('http'),fs=require('fs'),path=require('path');
const pup=require('C:/tmp/node_modules/puppeteer-core');
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
let ok=0,bad=0;
const t=(m,c,g)=>c?(ok++,console.log('  ok   '+m)):(bad++,console.log('  FAIL '+m+(g===undefined?'':'   got: '+JSON.stringify(g))));
(async()=>{
  const root='C:/Code/the-game-bureau';
  const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');
    let f=path.join(root,decodeURIComponent(u.pathname));
    if(u.pathname.endsWith('/'))f=path.join(f,'index.html');
    fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end();return;}
      r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});r.end(b);});});
  await new Promise(r=>srv.listen(9401,r));
  const br=await pup.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args:['--no-sandbox'],protocolTimeout:240000});
  try{
    const p=await br.newPage();
    await p.setViewport({width:1500,height:1100});
    const errs=[],writes=[];
    p.on('pageerror',e=>errs.push(String(e.message).split('\n')[0]));
    await p.evaluateOnNewDocument(()=>{window.__a=null;
      window.TgbMcAdminAuth={create:(o)=>{window.__a=o.onAuthorized;return{getSession:()=>null,init:()=>{}};}};
      window.TgbAdminSiteNav={bindAuth:()=>{}};});
    await p.setRequestInterception(true);
    p.on('request',q=>{const u=q.url(),m=q.method();
      const H={'access-control-allow-origin':'*','access-control-allow-headers':'*',
        'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-expose-headers':'content-range'};
      if(u.indexOf('supabase.co')===-1){q.continue();return;}
      if(m==='OPTIONS'){q.respond({status:204,headers:H});return;}
      if(m==='GET'){q.continue();return;}
      let body=null;try{body=JSON.parse(q.postData()||'null');}catch(e){body=q.postData();}
      writes.push({m,u,body});
      q.respond({status:200,contentType:'application/json',headers:H,
        body:JSON.stringify([Object.assign({id:99999},body&&!Array.isArray(body)?body:{})])});});
    await p.goto('http://127.0.0.1:9401/mc/challenges/',{waitUntil:'domcontentloaded'});
    await p.evaluate(async()=>{document.body.classList.add('mc-auth-authorized');if(window.__a)await window.__a();});
    await p.waitForFunction(()=>typeof state!=='undefined'&&state.rows&&state.rows.length>0,{timeout:40000});

    const dom=await p.evaluate(()=>({
      rows: state.rows.length,
      ladderField: !!document.getElementById('ladderField'),
      fLadder: !!document.getElementById('fLadder'),
      ladderList: !!document.getElementById('ladderList'),
      preview: !!document.getElementById('preview'),
      previewCss: [...document.styleSheets].some(sh=>{try{return [...sh.cssRules].some(r=>/\.preview/.test(r.selectorText||''));}catch(e){return false;}}),
      labels: [...document.querySelectorAll('#dlg .field > span')].map(s=>s.textContent)
    }));
    t('the room loads',dom.rows>0,dom.rows);
    t('the where-it-is-asked field is gone',!dom.ladderField&&!dom.fLadder);
    t('and its datalist with it',!dom.ladderList);
    t('the preview is gone',!dom.preview);
    t('and its CSS went too',!dom.previewCss);
    t('the prompt label reads Prompt',dom.labels.indexOf('Prompt')>=0,dom.labels);
    t('and no label says Question, which is now a TYPE',
      !dom.labels.some(x=>/^Question/.test(x)),dom.labels);

    // EDIT A TRIVIA ROW: its stored key must survive untouched.
    const edit=await p.evaluate(async()=>{
      const row=state.rows.filter(r=>r.type==='question'&&r.ladder_key&&r.ladder_key!=='*')[0];
      openEditor(row);
      document.getElementById('fName').value=row.name+'';
      await saveEditing();
      return {had:row.ladder_key,id:row.id};
    });
    const w1=writes[writes.length-1];
    t('editing trivia keeps its stored key',
      w1&&w1.body&&w1.body.ladder_key===edit.had,{sent:w1&&w1.body&&w1.body.ladder_key,had:edit.had});

    // A NEW TRIVIA ROW IS PORTABLE.
    const before=writes.length;
    await p.evaluate(async()=>{
      openEditor(null);
      document.getElementById('fName').value='PROBE new trivia';
      document.getElementById('fKind').value='question';
      document.getElementById('fKind').dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('fPrompt').value='Probe?';
      document.getElementById('fAnswer').value='yes';
      document.getElementById('fChoices').value='yes\nno';
      await saveEditing();
    });
    const w2=writes[writes.length-1];
    t('a new trivia row is filed portable',
      writes.length>before&&w2.body&&w2.body.ladder_key==='*',w2&&w2.body&&w2.body.ladder_key);
    t('and it is a POST, not a patch',w2&&w2.m==='POST',w2&&w2.m);

    /* A ROW THAT IS NOT A QUESTION STILL NULLS IT, and after the merge that
       means a photo -- `challenges_ladder_key_belongs_to_a_question` refuses a
       key anywhere else. The probe used to say `type_answer` here, which is now
       `question` and correctly KEEPS a key. */
    await p.evaluate(async()=>{
      openEditor(null);
      document.getElementById('fName').value='PROBE photo';
      document.getElementById('fKind').value='photo';
      document.getElementById('fKind').dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('fPrompt').value='Probe?';
      document.getElementById('fAnswer').value='yes';
      await saveEditing();
    });
    const w3=writes[writes.length-1];
    t('a row that is not a question still nulls the key',w3&&w3.body&&w3.body.ladder_key===null,w3&&w3.body&&w3.body.ladder_key);

    /* THE OPTIONS BOX IS TRIVIA'S AND NOBODY ELSE'S, and `hidden` alone did
       not do it: `.field { display: flex }` is an AUTHOR rule and `[hidden]` is
       only the UA sheet's `display: none`, so the box was on screen for every
       kind -- a photo, a minigame, the waiver. **`offsetParent`, never the
       `hidden` PROPERTY**: the property was true the whole time. */
    const kinds = await p.evaluate(() => {
      const out = {};
      ['question', 'minigame', 'photo', 'operations', 'waypoint_reveal'].forEach((k) => {
        const row = state.rows.filter((r) => r.type === k)[0];
        if (!row) { out[k] = null; return; }
        openEditor(row);
        const f = document.getElementById('choicesField');
        out[k] = !!(f && f.offsetParent !== null);
      });
      return out;
    });
    /* THE BOX IS OFFERED ON EVERY QUESTION AND NOWHERE ELSE. It used to be
       gated on the tapped type, which is the duplication 2026090319 removed:
       **filling the box IS what makes a question tapped.** */
    t('the options box is shown on a question, whose it is',
      kinds.question === true, kinds);
    t('and hidden on every type that is not one',
      kinds.minigame === false && kinds.photo === false
      && kinds.operations === false && kinds.waypoint_reveal !== true, kinds);

    /* THE ROOM'S FALLBACK IS A SECOND COPY OF THE COLUMN'S DEFAULT, which is
       the shape `KIND_VALUES` rotted into: 2026090313 renamed `freeform` and
       left the list behind, so the picker offered a value the CHECK refuses and
       an `any_answer` row opened reading `question`, one save from silently
       rewriting what kind of thing it is.
         **THE FALLBACK CAN ROT THE SAME WAY.** `readForm` writes
       `|| 'question'` and `openEditor` shows the same, so a rename that
       moves the value and not those two puts a refused value in front of
       somebody on every untyped row. This asks the one question that catches
       it: whatever the fallback is, the picker has to offer it. */
    const fallback = await p.evaluate(() => {
      openEditor({ id: -999, name: 'no type', prompt: 'A prompt.',
                   answer: 'An answer.', tags: [] });
      const shown = document.getElementById('fKind').value;
      const opts = [...document.getElementById('fKind').options].map((o) => o.value);
      closeEditor();
      return { shown: shown, offered: opts.indexOf(shown) !== -1 };
    });
    t('an untyped row falls back to a type the picker offers',
      fallback.offered, fallback);

    /* THE KIND IS `operations`, NOT `consent` (2026090312). One row has it, and
       a picker missing its kind would show `question` selected and silently
       rewrite what the waiver is on the next save. */
    /* EVERY TYPE ON FILE IS IN THE PICKER, and this is the assertion that was
       missing. `KIND_VALUES` still said `freeform` after 2026090313 renamed the
       value, so **an `any_answer` row opened showing `question` and would have
       silently rewritten itself on the next save** -- the exact fault that
       list's own comment warns about, and nothing was checking for it.
         READ FROM THE LIVE ROWS, never from a list in the check: a second copy
       of the six would go stale the same way. */
    const typesCovered = await p.evaluate(() => {
      const opts = [...document.getElementById('fKind').options].map((o) => o.value);
      const onFile = [...new Set(state.rows.map((r) => String(r.type || '')))].filter(Boolean);
      return { opts: opts, onFile: onFile,
               missing: onFile.filter((t) => opts.indexOf(t) === -1) };
    });
    t('every type on file is offered by the picker',
      typesCovered.missing.length === 0, typesCovered);
    /* AND THE OTHER WAY: the picker must not offer a value the CHECK refuses,
       which is what `freeform` became -- a saveable option that the database
       rejects with a constraint name.
         THIS LIST IS A HAND-KEPT COPY OF `challenges_type_check`, DELIBERATELY,
       and is the one copy worth having: only the database knows what it will
       accept, and a check that derived this from the page would be asking the
       page whether it agrees with itself. **Change it in the same commit as
       that constraint**, or it describes a rule the database no longer keeps. */
    t('and the picker offers no type the table has retired',
      typesCovered.opts.every((o) => ['question', 'minigame', 'photo',
        'operations', 'waypoint_reveal'].indexOf(o) !== -1),
      typesCovered.opts);

    /* THE BADGE READS THE UNDERSCORE AS A SPACE, so a stored `waypoint_reveal`
       draws WAYPOINT REVEAL. The value keeps the underscore because it is used
       as a CSS class, and a space in a class name is two selectors.
         THE SUBJECT MOVED WITH THE MERGE: it was `multiple_choice`, and
       `question` has no underscore to read. **waypoint_reveal is the only
       value left that carries one**, so it is the only one that can prove it. */
    /* DRIVEN, BECAUSE THE LIVE TABLE HOLDS NO `waypoint_reveal` ROW -- 91
       question, 28 photo, 6 minigame, 1 operations and none of it underscored
       any more. A check that waited for one to be written would be a check that
       never ran, so the row is made up and taken away again. */
    t('the badge draws an underscore as a space',
      await p.evaluate(() => {
        const keep = state.rows.slice();
        state.rows = [{ id: -4242, name: 'PROBE reveal', type: 'waypoint_reveal',
                        prompt: 'The next stop is behind you.', tags: [] }];
        render();
        const b = [...document.querySelectorAll('.ch-kind')]
          .filter((x) => x.className.indexOf('is-waypoint_reveal') !== -1)[0];
        const txt = b ? b.textContent : '';
        state.rows = keep;
        render();
        return !!b && txt.indexOf('_') === -1
            && txt.toLowerCase().indexOf('waypoint reveal') !== -1;
      }));

    /* A TAG CARRIES NO SPACES. Typed with one, it is filed hyphenated -- so
       the check reads what actually LEAVES the page rather than what the box
       holds, which is the only thing that says the rule reached the payload. */
    const tagged = await p.evaluate(async () => {
      const row = state.rows.filter((r) => r.type === 'question')[0];
      openEditor(row);
      document.getElementById('fTags').value =
        'sports bar,  double  space , plain, sports-bar';
      await saveEditing();
      return true;
    });
    const wt = writes[writes.length - 1];
    t('a tag typed with a space is filed hyphenated', tagged
      && wt.body && wt.body.tags.indexOf('sports-bar') !== -1
      && wt.body.tags.indexOf('sports bar') === -1, wt && wt.body && wt.body.tags);
    /* RUNS COLLAPSE, or `a  b` files `a--b`. */
    t('and a run of spaces collapses to one hyphen',
      wt.body.tags.indexOf('double-space') !== -1, wt.body.tags);
    t('a tag with no space is left alone', wt.body.tags.indexOf('plain') !== -1, wt.body.tags);
    /* DEDUPED AFTER THE HYPHENS: `sports bar` and `sports-bar` are one tag
       typed two ways, and deduping first would file both. */
    t('and the same tag typed two ways is filed once',
      wt.body.tags.length === 3
      && wt.body.tags.filter((x) => x === 'sports-bar').length === 1, wt.body.tags);
    t('so nothing filed carries a space',
      wt.body.tags.every((x) => x.indexOf(' ') === -1), wt.body.tags);

    t('the waiver row reads as operations',
      await p.evaluate(() => state.rows.some((r) => r.type === 'operations')));
    t('and no row is still consent',
      await p.evaluate(() => !state.rows.some((r) => r.type === 'consent')));
    t('the kind picker offers operations and not consent',
      await p.evaluate(() => {
        const v = [...document.getElementById('fKind').options].map((o) => o.value);
        return v.indexOf('operations') !== -1 && v.indexOf('consent') === -1;
      }));

    t('the chip still says where a trivia row is keyed',
      await p.evaluate(()=>!!document.querySelector('.ch-scope')));
    t('no page errors',errs.length===0,errs);
    await p.screenshot({path:'C:/tmp/probe/chal.png',clip:{x:0,y:0,width:1500,height:700}});
  } finally { await br.close(); srv.close(); }
  console.log('\n' + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad?1:0);
})();
