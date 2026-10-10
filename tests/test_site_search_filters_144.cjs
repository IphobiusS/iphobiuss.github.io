/* Real-browser search journeys: facets, shared URLs, keyboard, fallbacks and privacy. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { axeSource } = require('./qa-deps.cjs');
const root = path.resolve(process.env.SITE_SEARCH_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_SEARCH_OUTPUT || path.join(__dirname, '../audit-v14.4/search'));
fs.mkdirSync(output, {recursive:true});
const checks = []; let browser;
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);});
});
const check=async(name,fn)=>{const detail=await fn();checks.push({name,passed:true,...detail});console.log('PASS '+name);};
const save=fatal=>fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({total:checks.length,passed:checks.length,browser:browser?.version(),checks,...(fatal?{fatal:String(fatal.stack||fatal)}:{})},null,2));
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({...(process.env.SITE_CHROMIUM?{executablePath:process.env.SITE_CHROMIUM}:{}),headless:true,args:['--no-sandbox']});
  const create=async(options={})=>{const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1440,height:1000},...options});const page=await context.newPage();return {context,page};};
  const ready=page=>page.waitForFunction(()=>document.documentElement.classList.contains('search-ready'));
  const count=async page=>Number((await page.locator('#search-count').innerText()).match(/^\d+/)?.[0]||0);
  const total=async page=>page.evaluate(()=>window.SEARCH_INDEX.length);
  const allResults=async page=>{const more=page.locator('#search-results+button');while(await more.isVisible())await more.click();return page.locator('#search-results a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));};
  await check('Initial compact state, live facet totals and no searches stored',async()=>{
    const {context,page}=await create();const requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/buscar.html');await ready(page);await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('#search-results li').count(),0);
    assert.ok((await page.locator('.search-result-region').boundingBox()).height<=64);
    assert.equal(await page.locator('[data-search-filters-clear]').isDisabled(),true);
    assert.equal(await page.locator('.search-recents').getAttribute('open'),null);
    const entries=await total(page);
    assert.equal(await page.locator('#search-type option').first().textContent(),`Todos los tipos (${entries})`);
    assert.equal(await page.locator('#search-language option[value=en]').textContent(),'English (5)');
    const before=requests.length;await page.locator('#search-language').selectOption('en');
    assert.equal(await count(page),5);assert.equal(await page.locator('#search-results [hreflang=en]').count(),5);
    assert.ok((await allResults(page)).includes('engineering-notes.html'));
    assert.equal(requests.length,before);assert.ok(requests.every(url=>url.startsWith(base+'/')));
    assert.equal(await page.evaluate(()=>localStorage.getItem('iphobiuss:search-recents:v1')),null);assert.deepEqual(errors,[]);
    await context.close();return {indexedRecords:entries,englishRoutes:5,interactionRequests:0};
  });
  await check('All types remain discoverable; facets count records and keep languages separate',async()=>{
    const {context,page}=await create();await page.goto(base+'/buscar.html');await ready(page);
    const values=await page.locator('#search-type option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean));const all=[],counts={};
    for(const value of values){await page.locator('#search-type').selectOption(value);counts[value]=await count(page);const urls=await allResults(page);assert.equal(urls.length,counts[value]);all.push(...urls);}
    const entries=await total(page);assert.equal(all.length,entries);assert.equal(new Set(all).size,entries);
    await page.locator('#search-type').selectOption('casos');await page.locator('#search-language').selectOption('en');
    assert.equal(await count(page),2);assert.deepEqual((await allResults(page)).sort(),['cap-case-en.html','forest-case-en.html']);
    await page.locator('#search-type').selectOption('proyectos');assert.equal(await count(page),1);assert.equal(await page.locator('#search-results a').getAttribute('href'),'report-gen-en.html');
    await context.close();return {counts,allRecordsAccessible:entries};
  });
  await check('Shared URL, reload, browser back and forward restore query and both filters',async()=>{
    const {context,page}=await create();await page.goto(base+'/buscar.html?q=cap&tipo=casos&idioma=en');await ready(page);
    assert.equal(await count(page),1);assert.equal(await page.locator('input[name=q]').inputValue(),'cap');
    assert.equal(await page.locator('#search-results a').getAttribute('href'),'cap-case-en.html');
    await page.locator('#search-language').selectOption('es');assert.equal(await page.locator('#search-results a').first().getAttribute('href'),'cap-caso.html');
    await page.goBack();assert.equal(await page.locator('#search-language').inputValue(),'en');assert.equal(await page.locator('#search-type').inputValue(),'casos');
    await page.goForward();assert.equal(await page.locator('#search-language').inputValue(),'es');
    await page.reload();await ready(page);assert.equal(await page.locator('#search-language').inputValue(),'es');assert.equal(await page.locator('input[name=q]').inputValue(),'cap');
    await page.locator('[data-search-filters-clear]').click();assert.equal(await page.locator('#search-type').inputValue(),'');assert.equal(await page.locator('#search-language').inputValue(),'');assert.equal(new URL(page.url()).searchParams.get('q'),'cap');
    assert.equal(new URL(page.url()).searchParams.has('tipo'),false);assert.equal(new URL(page.url()).searchParams.has('idioma'),false);
    await page.goBack();assert.equal(await page.locator('#search-type').inputValue(),'casos');assert.equal(await page.locator('#search-language').inputValue(),'es');
    await context.close();return {reload:true,back:true,forward:true,clearPreservesQuery:true};
  });
  await check('Useful empty state, reset query and zero-count combinations remain operable',async()=>{
    const {context,page}=await create();await page.goto(base+'/buscar.html?tipo=guias&idioma=en');await ready(page);
    assert.equal(await count(page),0);assert.equal(await page.locator('#search-empty').isVisible(),true);assert.equal(await page.locator('[data-search-reset-query]').isVisible(),false);
    await page.locator('[data-search-filters-clear]').click();assert.equal(await page.locator('#search-empty').isVisible(),false);
    await page.locator('input[name=q]').fill('zzznothing144');await page.locator('input[name=q]').press('Enter');assert.equal(await page.locator('#search-empty').isVisible(),true);
    await page.locator('[data-search-reset-query]').click();assert.equal(await page.locator('input[name=q]').inputValue(),'');assert.equal(await page.locator('input[name=q]').evaluate(n=>n===document.activeElement),true);assert.equal(await page.locator('#search-results li').count(),0);
    await context.close();return {filterReset:true,queryReset:true};
  });
  await check('Synonyms, ranked titles, snippets and keyboard pagination survive filters',async()=>{
    const {context,page}=await create();await page.goto(base+'/buscar.html?q=sqli&tipo=herramientas&idioma=es');await ready(page);
    assert.ok(await count(page)>0);assert.match(await page.locator('#search-results').innerText(),/SQL|sqlmap/);
    await page.goto(base+'/buscar.html?q=kerberos&tipo=tecnicas');await ready(page);assert.ok(await count(page)>0);assert.match(await page.locator('#search-results').innerText(),/Kerberos|Roast|SPN/i);assert.ok(await page.locator('#search-results mark').count()>0);
    await page.goto(base+'/buscar.html?tipo=guias');await ready(page);assert.equal(await page.locator('#search-results li').count(),20);
    const more=page.locator('#search-results+button');await more.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#search-results li').count(),40);assert.equal(await page.locator('#search-results li').nth(20).locator('a').evaluate(n=>n===document.activeElement),true);
    const records=await count(page);assert.equal((await allResults(page)).length,records);
    await context.close();return {synonyms:true,pagination:true,keyboardFocus:true};
  });
  await check('Opt-in recents save submitted queries only; changing filters never adds a term',async()=>{
    const {context,page}=await create();await page.goto(base+'/buscar.html');await ready(page);
    await page.locator('.search-recents>summary').click();await page.locator('[data-search-history-optin]').check();
    await page.locator('input[name=q]').fill('kerberos');await page.locator('#search-type').selectOption('tecnicas');
    assert.equal(await page.evaluate(()=>localStorage.getItem('iphobiuss:search-recents:v1')),null);
    await page.locator('input[name=q]').press('Enter');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('iphobiuss:search-recents:v1'))),['kerberos']);
    await page.locator('#search-language').selectOption('es');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('iphobiuss:search-recents:v1'))),['kerberos']);
    await page.locator('[data-search-history-optin]').uncheck();assert.equal(await page.evaluate(()=>localStorage.getItem('iphobiuss:search-recents:v1')),null);
    await context.close();return {explicitConsentOnly:true};
  });
  for(const mode of ['no-js','search-core.js','search-index.js','site.js'])await check('Native catalogue available with '+mode,async()=>{
    const {context,page}=await create({javaScriptEnabled:mode!=='no-js',viewport:{width:320,height:900}});
    if(mode!=='no-js')await page.route('**/assets/js/'+mode,route=>route.abort());
    await page.goto(base+'/buscar.html?tipo=casos&idioma=en');await page.locator('.search-fallback').waitFor({state:'visible'});
    assert.equal(await page.locator('.search-filters').isVisible(),false);assert.ok(await page.locator('.search-fallback a').count()>=202);
    for(const route of ['cap-caso.html','cap-case-en.html','engineering-notes.html'])assert.equal(await page.locator('.search-fallback a[href="'+route+'"]').isVisible(),true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();return {nativeLinks:true};
  });
  await check('Denied storage, hostile query and invalid facets fail safely',async()=>{
    const {context,page}=await create();await context.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new DOMException('denied','SecurityError');}});});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const query='<img src=x onerror="window.__unsafe=1">';await page.goto(base+'/buscar.html?q='+encodeURIComponent(query)+'&tipo=__proto__&idioma=xx');await ready(page);
    assert.equal(await page.locator('#search-type').inputValue(),'');assert.equal(await page.locator('#search-language').inputValue(),'');assert.equal(await page.evaluate(()=>window.__unsafe),undefined);
    await page.locator('[data-search-reset-query]').click();await page.locator('#search-type').selectOption('casos');await page.locator('#search-language').selectOption('en');assert.equal(await count(page),2);assert.deepEqual(errors,[]);
    await context.close();return {safeText:true,storageOptional:true};
  });
  for(const theme of ['dark','paper','retro'])for(const [width,scale] of [[1440,100],[320,100],[320,200]])await check(`Layout and accessibility ${theme}/${width}/${scale}`,async()=>{
    const {context,page}=await create({viewport:{width,height:1000}});await context.addInitScript(theme=>{if(theme==='paper')localStorage.setItem('iphobiuss:theme','paper');if(theme==='retro')localStorage.setItem('iphobiuss:retro','on');window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));},theme);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/buscar.html?tipo=casos&idioma=en');await ready(page);await page.evaluate(()=>document.fonts.ready);
    if(scale===200)await page.addStyleTag({content:'html{font-size:200%!important}'});
    await page.locator('#search-type').focus();assert.equal(await page.locator('#search-type').evaluate(n=>n===document.activeElement),true);
    const selectedSummary=page.locator('[data-search-filter-selection]');
    assert.equal(await selectedSummary.isVisible(),width<=480);
    let summaryScreenshot=null;
    if(width===320&&scale===200){
      for(const [type,language,expected] of [['fundamentos','es','Fundamentos'],['herramientas','es','Herramientas'],['','','Todos los tipos'],['portafolio','en','Portafolio']]){
        await page.locator('#search-type').selectOption(type);await page.locator('#search-language').selectOption(language);
        assert.match(await selectedSummary.innerText(),new RegExp(expected+' \\(\\d+\\)'));
        const selection=await selectedSummary.evaluate(node=>{
          const box=node.getBoundingClientRect();
          const texts=[...node.children].map(span=>{const range=document.createRange();range.selectNodeContents(span);return {text:span.textContent,rects:[...range.getClientRects()].map(rect=>({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}))};});
          return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,texts};
        });
        for(const item of selection.texts)for(const rect of item.rects){assert.ok(rect.left>=selection.left-1&&rect.right<=selection.right+1&&rect.top>=selection.top-1&&rect.bottom<=selection.bottom+1,'Complete selected text must wrap inside its visible summary: '+item.text);}
        const expectedType=await page.locator('#search-type option:checked').textContent(),expectedLanguage=await page.locator('#search-language option:checked').textContent();
        assert.equal(selection.texts[0].text,'Tipo: '+expectedType);assert.equal(selection.texts[1].text,'Idioma: '+expectedLanguage);
        if(type==='herramientas'){summaryScreenshot=`search-controls-${theme}-${width}-${scale}.png`;await page.locator('.search-filters').screenshot({path:path.join(output,summaryScreenshot)});}
      }
      await page.locator('#search-type').selectOption('casos');await page.locator('#search-language').selectOption('en');
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.ok(await page.locator('.search-filter-controls select,.search-filter-controls button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().width>40&&n.getBoundingClientRect().left>=0&&n.getBoundingClientRect().right<=innerWidth+1)));
    await page.evaluate(axeSource);const axe=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(v=>v.id)})));
    assert.deepEqual(axe.violations,[]);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__csp),[]);
    const screenshot=`search-${theme}-${width}-${scale}.png`;await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.screenshot({path:path.join(output,screenshot),fullPage:true,animations:'disabled'});await context.close();return {axe,screenshot,summaryScreenshot,selectedValuesWrap:width===320&&scale===200};
  });
  save();console.log(`Search filters: ${checks.length}/${checks.length} passed.`);
})().catch(error=>{save(error);console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));});
