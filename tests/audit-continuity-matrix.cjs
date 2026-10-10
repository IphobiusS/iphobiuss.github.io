/* Independent UX/accessibility audit. Uses a private local HTTP server and fresh contexts. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const {chromium} = require(process.env.REPORT_GEN_PLAYWRIGHT_MODULE || require.resolve('playwright', {paths:[root, process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || root]}));
const output = path.join(__dirname, 'audit-continuity-matrix.json');
const { axeSource: axe } = require('./qa-deps.cjs');
const notebook = {version:1,items:[{url:'cap.html',title:'Cap: guía HTB',note:'Una nota personal para retomar la investigación.',updated:'2026-10-08T23:26:03Z'}],reading:[{url:'cap.html#pcap',title:'Cap · ANÁLISIS DEL PCAP',note:'',updated:'2026-10-08T23:26:03Z'},{url:'knife.html#removed-heading',title:'Sección histórica',note:'',updated:''}]};
const imported = {version:1,items:[{url:'cap.html',title:'Título del respaldo',note:'No reemplazar la nota actual',updated:''},{url:'forest.html',title:'Forest: guía HTB',note:'Nueva nota conservada',updated:''}],reading:[]};
const result = {generated_at:new Date().toISOString(),scope:'Independent browser happy paths, keyboard, responsive layout, text resize, accessibility and progressive fallback',browser:'',profiles:[],checks:[],issues:[],limitations:['Chromium only; axe automated checks do not replace a human screen reader audit.','Clipboard success is stubbed and fallback is forced; operating system clipboard was not tested.','Effective text resizing doubles each original computed font size after dynamic controls exist; browser zoom is not substituted.','Native no-JS pages load with script execution disabled through one CDP session. That same session enables inspection only after static fallback checks; scripts are not replayed, and absent readiness is checked before and after axe.']};
result.axe_enabled=true;
const inputPaths=[...new Set(['scripts/build.py','scripts/site_evolution.py','content/site-data.json','dist/cuaderno.html','dist/guias.html','dist/buscar.html','dist/cap.html',...['js','css'].flatMap(kind=>fs.readdirSync(path.join(dist,'assets',kind)).filter(name=>name.endsWith('.'+kind)).map(name=>'dist/assets/'+kind+'/'+name))])].sort();
const hashes=()=>Object.fromEntries(inputPaths.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
result.inputs_before=hashes();
let browser, server, base, failures=0;
function check(name, pass, detail={}) { result.checks.push({name,pass,...detail}); if (!pass) { failures++; result.issues.push({name,...detail}); console.log('FAIL '+name); } }
async function context(width=1366, js=true, seed=true, theme='dark') {
 const ctx = await browser.newContext({viewport:{width,height:900},javaScriptEnabled:js,reducedMotion:'reduce'});
 if (seed) await ctx.addInitScript(({book, theme}) => { try { localStorage.setItem('iphobiuss:notebook:v1', JSON.stringify(book)); localStorage.setItem('iphobiuss:search-history:consent','yes'); localStorage.setItem('iphobiuss:search-recents:v1',JSON.stringify(['kerberos', 'DCSync', 'a'.repeat(200)])); localStorage.setItem('iphobiuss:retro', theme==='retro'?'on':'off'); localStorage.setItem('iphobiuss:theme', theme==='paper'?'paper':''); } catch {} }, {book:notebook,theme});
 return ctx;
}
async function load(ctx, route, state) {
 const page=await ctx.newPage(); const logs={pageErrors:[],consoleErrors:[],failedRequests:[],csp:[]};
 if(state==='no-js'){page.__auditNoJSSession=await ctx.newCDPSession(page);await page.__auditNoJSSession.send('Emulation.setScriptExecutionDisabled',{value:true});}
 page.on('pageerror',e=>logs.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')logs.consoleErrors.push(m.text());});page.on('requestfailed',r=>logs.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
 await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>{window.__auditCSP=(window.__auditCSP||[]).concat([{directive:e.violatedDirective,url:e.blockedURI}]);}));
 // The page's load event completes deferred scripts. Functional locators then
 // require operable controls. Network-idle is not a product readiness contract.
 await page.goto(base+route,{waitUntil:'load'}); return {page,logs};
}
async function textResize(page, factor) {
 if (factor===1)return;
 await page.evaluate(()=>{const entries=[...document.querySelectorAll('*')].map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]); for (const [el,size] of entries) {if(Number.isFinite(size)&&size>0)el.style.fontSize=(size*2)+'px';} });
 await page.waitForTimeout(150);
}
async function inspect(page, logs, name) {
 const geometry=await page.evaluate(()=>{
  const visible=el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&!!el.getClientRects().length&&!el.closest('[hidden]');};
  const elements=[...document.querySelectorAll('button,input,textarea,label,p,h1,h2,h3,a')].filter(visible);
  const clipped=[];for(const el of elements) {const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(['button','label','p','h1','h2','h3'].includes(el.localName)&&el.scrollHeight>el.clientHeight+3&&['hidden','clip'].includes(s.overflowY))clipped.push({tag:el.localName,text:el.textContent.slice(0,100),client:el.clientHeight,scroll:el.scrollHeight});}
  return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,clipped,csp:window.__auditCSP||[]};
 });
 const nativeNoJS=name.startsWith('no-js-'),staticReady=()=>page.evaluate(()=>!document.documentElement.classList.contains('js')&&!document.documentElement.classList.contains('notebook-ready')&&!document.documentElement.classList.contains('search-ready')&&document.querySelector('.menu-toggle')?.tagName==='A');
 if(nativeNoJS)check('Product scripts stayed disabled before inspection '+name,await staticReady());
 if(nativeNoJS&&axe)await page.__auditNoJSSession.send('Emulation.setScriptExecutionDisabled',{value:false});
 let accessibility;{await page.evaluate(axe);accessibility=await page.evaluate(async()=>{const report=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return report.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});}
 if(nativeNoJS)check('Product scripts did not replay during inspection '+name,await staticReady());
 if(page.__auditNoJSSession){await page.__auditNoJSSession.send('Emulation.setScriptExecutionDisabled',{value:true});await page.__auditNoJSSession.detach();}
 const pass=geometry.scroll<=geometry.viewport+1&&!geometry.clipped.length&&!geometry.csp.length&&!logs.pageErrors.length&&!logs.consoleErrors.length&&!logs.failedRequests.length&&(!accessibility||!accessibility.length);
 result.profiles.push({name,pass,geometry,accessibility,logs,accessibilityMode:axe?nativeNoJS?'axe-on-static-no-js-page-after-inspection-enabled':'axe':'not-run-no-axe-supplied'});if(!pass){failures++;result.issues.push({name,geometry,accessibility,logs});await page.screenshot({path:path.join(__dirname,name.replace(/[^a-z0-9_-]/gi,'_')+'.png'),fullPage:true});}fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');if(result.profiles.length%12===0)console.log('Profiles '+result.profiles.length+'; failures '+failures);
}
async function functional() {
 const ctx=await context(1366,true,false);await ctx.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});});
 let {page}=await load(ctx,'cap.html');await page.locator('[data-bookmark="cap.html"]').click();check('Bookmark is stored',await page.evaluate(()=>JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).items[0].url)==='cap.html');
 await page.locator('#pcap').scrollIntoViewIfNeeded();await page.waitForTimeout(800);let reading=await page.evaluate(()=>JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).reading);check('Reader stores a section point, without completion field',reading.some(i=>i.url.startsWith('cap.html#'))&&!reading.some(i=>Object.hasOwn(i,'completed')||Object.hasOwn(i,'percent')),{reading});
 await page.goto(base+'cuaderno.html');const note=page.locator('[data-notebook-note="cap.html"]');await note.fill('Nota guardada');await page.getByRole('button',{name:'Guardar nota',exact:true}).click();await note.fill('Borrador actual');await page.locator('[data-notebook-copy="cap.html"]').click();check('Markdown copies current draft without saving it',(await page.evaluate(()=>window.__copied)).endsWith('Borrador actual\n')&&(await page.evaluate(()=>JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).items[0].note))==='Nota guardada');
 await page.locator('[data-notebook-import]').focus();await page.keyboard.press('Enter');check('Import opened with focus in file picker',await page.locator('[data-notebook-import-file]').evaluate(el=>el===document.activeElement));await page.keyboard.press('Escape');check('Escape closes import and returns focus',await page.locator('[data-notebook-import-panel]').isHidden()&&await page.locator('[data-notebook-import]').evaluate(el=>el===document.activeElement));
 await page.locator('[data-notebook-import]').click();await page.locator('[data-notebook-import-file]').setInputFiles({name:'respaldo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});await page.waitForFunction(()=>!document.querySelector('[data-notebook-import-apply]').disabled);check('Import preview describes additions and conflicts',/1 entradas nuevas y 1 coincidencias/.test(await page.locator('[data-notebook-import-preview]').innerText()));await page.locator('[data-notebook-import-apply]').click();let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')));check('Additive import preserves existing note and unsaved draft',stored.items.length===2&&stored.items.find(i=>i.url==='cap.html').note==='Nota guardada'&&await page.locator('[data-notebook-note="cap.html"]').inputValue()==='Borrador actual');
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-notebook-export="json"]').click();const download=await downloadPromise;const stream=await download.createReadStream();const chunks=[];for await (const chunk of stream)chunks.push(chunk);const exported=JSON.parse(Buffer.concat(chunks).toString());check('JSON export includes saved content, excludes unsaved draft',exported.items.length===2&&exported.items.find(i=>i.url==='cap.html').note==='Nota guardada');
 await page.goto(base+'buscar.html?q=kerberos');check('URL query is not silently recorded',await page.evaluate(()=>localStorage.getItem('iphobiuss:search-recents:v1'))===null);await page.locator('.search-recents>summary').focus();await page.keyboard.press('Enter');await page.locator('[data-search-history-optin]').focus();await page.keyboard.press('Space');check('Recents opt-in responds to keyboard',await page.locator('[data-search-history-optin]').isChecked());const field=page.locator('#search-input-results');await field.fill('DCSync');await page.waitForTimeout(150);check('Typing never records query',await page.evaluate(()=>localStorage.getItem('iphobiuss:search-recents:v1'))===null);await field.press('Enter');check('Submitted query is stored locally',(await page.evaluate(()=>JSON.parse(localStorage.getItem('iphobiuss:search-recents:v1'))))[0]==='DCSync');await page.reload();await page.locator('.search-recents>summary').click();check('Recents survive reload with consent',await page.locator('[data-search-recents] button').first().innerText()==='DCSync');await page.locator('[data-search-history-clear]').click();check('Clear removes recents and retains explicit choice',await page.evaluate(()=>localStorage.getItem('iphobiuss:search-recents:v1'))===null&&await page.locator('[data-search-history-optin]').isChecked());await page.locator('[data-search-history-optin]').uncheck();check('Disabling removes both history and consent',await page.evaluate(()=>localStorage.getItem('iphobiuss:search-recents:v1')===null&&localStorage.getItem('iphobiuss:search-history:consent')===null));
 await page.locator('h1').click();await page.keyboard.press('/');check('Slash focuses search',await field.evaluate(el=>el===document.activeElement));await field.fill('a');await field.press('/');check('Slash can be typed in search input',await field.inputValue()==='a/');
 await page.goto(base+'guias.html');await page.locator('h1').click();await page.keyboard.press('/');await page.waitForURL('**/buscar.html#search-input-results');check('Slash from catalog opens and focuses search',await page.locator('#search-input-results').evaluate(el=>el===document.activeElement));await ctx.close();
}
async function matrix() {
 for(const theme of ['dark','paper','retro'])for(const width of [360,1366])for(const scale of [1,2])for(const state of ['notebook','import','copy-fallback','search','catalog']) {
  const ctx=await context(width,true,true,theme);if(state==='copy-fallback')await ctx.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
  const route=state==='search'?'buscar.html?q=kerberos':state==='catalog'?'guias.html':'cuaderno.html';const {page,logs}=await load(ctx,route,state);
  if(state==='import'){await page.locator('[data-notebook-import]').click();await page.locator('[data-notebook-import-file]').setInputFiles({name:'respaldo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});await page.waitForFunction(()=>!document.querySelector('[data-notebook-import-apply]').disabled);}
  if(state==='copy-fallback'){await page.locator('[data-notebook-copy]').click();check('Manual Markdown fallback '+theme+'-'+width+'-'+scale,await page.locator('[data-notebook-markdown]').isVisible()&&await page.locator('[data-notebook-markdown]').evaluate(el=>el===document.activeElement&&el.selectionEnd===el.value.length));}
  if(state==='catalog'){const cap=await page.locator('[data-guide-progress="cap.html"]').innerText();const knife=await page.locator('[data-guide-progress="knife.html"]').innerText();check('Honest catalog progress '+theme+'-'+width+'-'+scale,/sección 4 de 8/.test(cap)&&/ANÁLISIS DEL PCAP/.test(cap)&&/puede haber cambiado/.test(knife)&&!/completad[oa]|100\s*%/i.test(cap),{cap,knife});}
  await textResize(page,scale);await inspect(page,logs,[state,theme,width,scale===1?'100':'200'].join('-'));
  if ((state==='import'&&theme==='paper'&&width===360&&scale===2)||(['search','catalog'].includes(state)&&theme==='dark'&&width===1366&&scale===1)){
   if(state==='import'){await page.locator('[data-notebook-import-panel]').evaluate(el=>scrollTo(0,el.getBoundingClientRect().top+scrollY));await page.waitForTimeout(400);await page.screenshot({path:path.join(__dirname,'sample-import-panel-paper-360-200.png')});}
   else{await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(150);await page.screenshot({path:path.join(__dirname,'sample-'+state+'-'+theme+'-'+width+'-100.png'),fullPage:true});}
  }
  await ctx.close();
 }
}
async function fallbacks() {
 for(const mode of ['no-js','notebook-failed','search-failed'])for(const width of [360,1366])for(const theme of ['dark','paper','retro']) {
  const ctx=await context(width,true,true,theme);if(mode==='notebook-failed')await ctx.route('**/notebook.js',r=>r.abort());if(mode==='search-failed')await ctx.route('**/search-core.js',r=>r.abort());
  const routes=mode==='no-js'?['cuaderno.html','guias.html','buscar.html']:mode==='notebook-failed'?['cuaderno.html','guias.html']:['buscar.html'];
  for(const route of routes){const {page,logs}=await load(ctx,route,mode);if(mode==='no-js')await page.evaluate(t=>{document.documentElement.dataset.retro=t==='retro'?'on':'off';if(t==='paper')document.documentElement.dataset.theme='paper';},theme);
   if(route==='cuaderno.html')check('Notebook fallback remains explanatory '+mode+'-'+width+'-'+theme,await page.locator('[data-notebook-list]').innerText().then(x=>/JavaScript/.test(x))&&await page.locator('[data-notebook-import]').isHidden());
   if(route==='guias.html')check('Catalog unavailable progress is honest '+mode+'-'+width+'-'+theme,await page.locator('[data-guide-progress-message]').innerText().then(x=>/requieren JavaScript/.test(x)) && await page.locator('[data-guide-progress]:not([hidden])').count()===0);
   if(route==='buscar.html')check('Search fallback contains catalog '+mode+'-'+width+'-'+theme,await page.locator('.search-fallback').isVisible()&&await page.locator('.search-fallback a').count()>100&&await page.locator('[data-search-history-optin]').isHidden());
   logs.failedRequests=logs.failedRequests.filter(r=>!r.url.endsWith(mode==='notebook-failed'?'notebook.js':'search-core.js'));logs.consoleErrors=logs.consoleErrors.filter(x=>!x.includes('ERR_FAILED'));await inspect(page,logs,[mode,route,theme,width].join('-'));await page.close();
  }await ctx.close();
 }
}
(async()=>{
 server=http.createServer((req,res)=>{let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}const file=path.resolve(dist,'.'+pathname);if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,buf)=>{if(err){res.writeHead(404).end();return;}const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime});res.end(buf);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';browser=await chromium.launch({headless:true,executablePath:process.env.RG_CHROMIUM_EXECUTABLE||process.env.REPORT_GEN_CHROMIUM||undefined,args:['--no-sandbox']});result.browser=browser.version();console.log('Functional started');await functional();console.log('Functional complete; matrix started');await matrix();await fallbacks();
})().catch(e=>{failures++;result.issues.push({name:'Harness exception',error:e.stack});}).finally(async()=>{result.inputs_after=hashes();check('Audited runtime and generators stayed unchanged',JSON.stringify(result.inputs_before)===JSON.stringify(result.inputs_after));result.summary={profiles:result.profiles.length,checks:result.checks.length,failures};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));process.exitCode=failures?1:0;});
