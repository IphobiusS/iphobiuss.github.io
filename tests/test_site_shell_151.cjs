/* Public terminal commands, navigation, keyboard editing and safe text rendering. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const {chromium} = require(process.env.SITE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.SITE_SHELL_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_SHELL_OUTPUT || path.join(__dirname, '../audit-151/shell'));
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.pdf':'application/pdf', '.json':'application/json'};
const fingerprint = () => Object.fromEntries(fs.readdirSync(root,{recursive:true}).filter(file=>fs.statSync(path.join(root,file)).isFile()).sort().map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const before = fingerprint();
const server = http.createServer((req,res) => {
  let file; try {file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));} catch {return res.writeHead(400).end();}
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(error,bytes)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);});
});
const results=[];let browser,base;
async function visit(options={}) {
  const context=await browser.newContext({viewport:options.mobile?{width:390,height:844}:{width:1440,height:1000},reducedMotion:'reduce',javaScriptEnabled:options.nojs!==true});
  await context.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',event=>window.__csp.push({directive:event.violatedDirective,blocked:event.blockedURI}));});
  const page=await context.newPage(),errors=[],consoleErrors=[],failedRequests=[],responses=[],dialogs=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400)responses.push({url:response.url(),status:response.status()});});
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
  await page.goto(base+'/index.html');await page.evaluate(()=>document.fonts.ready);
  if(!options.nojs)await page.waitForFunction(()=>document.documentElement.classList.contains('shell-ready'));
  const input=page.locator('[data-shell-input]'),log=page.locator('[data-shell-log]');
  return {context,page,input,log,errors,consoleErrors,failedRequests,responses,dialogs};
}
async function run(state,command) {await state.input.fill(command);await state.input.press('Enter');return state.log.locator('.shell-entry').last();}
async function check(name,fn,options) {
  const state=await visit(options);
  try {await fn(state);assert.deepEqual(state.errors,[]);assert.deepEqual(state.consoleErrors,[]);assert.deepEqual(state.failedRequests,[]);assert.deepEqual(state.responses,[]);assert.deepEqual(state.dialogs,[]);assert.deepEqual(await state.page.evaluate(()=>window.__csp||[]),[]);results.push({name,passed:true});console.log('PASS '+name);}
  catch(error){results.push({name,passed:false,error:error.stack});console.log('FAIL '+name+': '+error.message);}
  finally {await state.context.close();}
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.SITE_CHROMIUM,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  await check('Commands reflect the published site data and preserve working links',async state=>{
    const data=JSON.parse(await state.page.locator('#shell-data').textContent());
    assert.match(await (await run(state,'help')).innerText(),/whoami[\s\S]*ls \[carpeta\][\s\S]*clear/);
    const identity=await (await run(state,'whoami')).innerText();for(const value of [data.name,data.role,data.city,...data.certs.map(cert=>cert.name)])assert.ok(identity.includes(value));
    assert.match(await (await run(state,'ls')).innerText(),/proyectos\/[\s\S]*casos\/[\s\S]*guias\/[\s\S]*cv.pdf/);
    const projects=await run(state,'ls proyectos');assert.deepEqual(await projects.locator('.shell-out a').evaluateAll(links=>links.map(link=>link.getAttribute('href'))),data.projects.map(project=>project.href));
    const certs=await run(state,'certs');assert.deepEqual(await certs.locator('.shell-out a').evaluateAll(links=>links.map(link=>({href:link.getAttribute('href'),target:link.target,rel:link.rel}))),data.certs.map(cert=>({href:cert.url,target:'_blank',rel:'noopener'})));
    const cv=await run(state,'cat cv');assert.equal(await cv.locator('.shell-out a').getAttribute('href'),data.links.cv);assert.equal(await cv.locator('.shell-out a').getAttribute('download'),'');
    assert.equal(await state.log.locator('.shell-entry').count(),6);
  });
  await check('Aliases and accented command input resolve normally',async state=>{
    assert.match(await (await run(state,'AYUDA')).innerText(),/Comandos disponibles/);
    const data=JSON.parse(await state.page.locator('#shell-data').textContent());
    assert.equal(await (await run(state,'  GUÍAS  ')).locator('.shell-out a').count(),data.guides.length);
    assert.equal(await (await run(state,'ls guías/')).locator('.shell-out a').count(),data.guides.length);
    assert.equal(await (await run(state,'cv')).locator('a[download]').count(),1);
    assert.match(await (await run(state,'id')).innerText(),new RegExp(data.name));
    assert.match(await (await run(state,'contact')).innerText(),/LinkedIn[\s\S]*GitHub/);
  });
  await check('Untrusted command text and prototype property names stay inert',async state=>{
    const payload='<img src=x onerror=alert(1)>';
    const entry=await run(state,payload);assert.ok((await entry.locator('.shell-echo').textContent()).endsWith(payload));
    assert.equal(await state.log.locator('img,script,iframe,[onerror]').count(),0);
    for(const command of ['__proto__','constructor','toString','cd __proto__','cd constructor','ls constructor']){
      assert.equal(await (await run(state,command)).locator('.shell-error').count(),1);
      assert.equal(new URL(state.page.url()).pathname,'/index.html');
    }
    assert.equal(await state.log.locator('.shell-entry').count(),6);
  });
  await check('History restores the draft, unique Tab completes, ambiguous Tab releases focus, and clear works',async state=>{
    await run(state,'whoami');await run(state,'certs');
    await state.input.fill('cat c');await state.input.press('ArrowUp');assert.equal(await state.input.inputValue(),'certs');
    await state.input.press('ArrowUp');assert.equal(await state.input.inputValue(),'whoami');
    await state.input.press('ArrowDown');assert.equal(await state.input.inputValue(),'certs');
    await state.input.press('ArrowDown');assert.equal(await state.input.inputValue(),'cat c');
    await state.input.fill('who');await state.input.press('Tab');assert.equal(await state.input.inputValue(),'whoami ');assert.ok(await state.input.evaluate(el=>el===document.activeElement));
    await state.input.fill('c');await state.input.press('Tab');assert.equal(await state.input.inputValue(),'c');assert.equal(await state.page.locator('[data-shell-form] button').evaluate(el=>el===document.activeElement),true);
    await run(state,'clear');assert.equal(await state.log.locator('.shell-entry').count(),0);assert.equal(await state.input.inputValue(),'');
    await state.input.press('ArrowUp');assert.equal(await state.input.inputValue(),'clear');
  });
  await check('cd follows native page and section destinations',async state=>{
    await run(state,'cd contacto');await state.page.waitForURL('**/index.html#contacto');
    await run(state,'cd guías');await state.page.waitForURL('**/guias.html');assert.ok(await state.page.locator('h1').isVisible());
  });
  for(const mobile of [false,true])await check((mobile?'Mobile':'Desktop')+' suggested commands and viewport capture',async state=>{
    await state.page.locator('[data-shell-cmd="ls proyectos"]').click();assert.ok(await state.input.evaluate(el=>el===document.activeElement));
    assert.ok((await state.log.innerText()).includes('report-gen'));
    assert.ok(await state.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await state.page.locator('[data-shell]').scrollIntoViewIfNeeded();
    await state.page.screenshot({path:path.join(output,mobile?'shell-mobile.png':'shell-desktop.png'),fullPage:false});
  },{mobile});
  await check('Without JavaScript the static evidence links remain accessible',async state=>{
    assert.ok(await state.page.locator('[data-shell-ui]').isHidden());
    assert.ok(await state.page.locator('[data-shell] a:visible').count()>=3);
  },{nojs:true});
  assert.deepEqual(fingerprint(),before,'dist changed during terminal audit');
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({browser:browser.version(),checks:results.length,passed:results.filter(row=>row.passed).length,distUnchanged:true,checked:'Native Chromium browser; pageerror, console errors, request failures, HTTP errors, dialogs and CSP violations checked in every case.',results},null,2)+'\n');
  if(results.some(row=>!row.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
