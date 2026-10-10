/* Focused reader-group audit. Baseline is required for the causal negative.
   Usage: SITE_BASELINE_DIST=/path/to/old/dist AXE_CORE_PATH=/path/to/axe.min.js
   RG_CHROMIUM_EXECUTABLE=/path/to/chromium node tests/audit-reader-group.cjs
   --baseline /path/to/old/dist is an alternative to SITE_BASELINE_DIST. */
'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const {chromium}=require(process.env.REPORT_GEN_PLAYWRIGHT_MODULE||require.resolve('playwright',{paths:[root,process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||root]}));
const baselineIndex=process.argv.indexOf('--baseline'),baselineArgument=baselineIndex>=0?process.argv[baselineIndex+1]:undefined;
const baselineInput=process.env.SITE_BASELINE_DIST||baselineArgument;
if(!baselineInput)throw Error('Provide the original baseline dist using SITE_BASELINE_DIST or --baseline PATH.');
const baseline=path.resolve(baselineInput);
const {axeSource:axeCode}=require('./qa-deps.cjs');
const routes=fs.readdirSync(dist).filter(name=>name.endsWith('.html')&&/<div\b[^>]*class=["'][^"']*\breader-toolbar\b/.test(fs.readFileSync(path.join(dist,name),'utf8'))).sort();
const inputPaths=[...routes.map(route=>'dist/'+route),'scripts/site_evolution.py',...['css','js'].flatMap(kind=>fs.readdirSync(path.join(dist,'assets',kind)).filter(name=>name.endsWith('.'+kind)).map(name=>'dist/assets/'+kind+'/'+name))].sort();
const hashes=()=>Object.fromEntries(inputPaths.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
const result={generated_at:new Date().toISOString(),scope:'Reader grouping/name and aria-prohibited-attr on all 16 toolbar routes, with and without product JavaScript; original Cap causal baseline',browser:'',profiles:[],checks:[],negative:null,issues:[],inputs_before:hashes(),limitations:['Chromium automated accessibility checks only; no human screen reader verification.','No-JS load disables script execution before navigation in one CDP session, then enables only axe inspection without replaying product scripts.']};
let browser,server,base,failures=0;
const check=(name,pass,detail={})=>{result.checks.push({name,pass,...detail});if(!pass){failures++;result.issues.push({name,...detail});}};
const toolbarNodes=rule=>rule?.nodes.filter(node=>node.target.some(target=>typeof target==='string'&&target.includes('reader-toolbar'))||node.html.includes('reader-toolbar'))||[];
const compact=nodes=>nodes.map(node=>({target:node.target,html:node.html,summary:node.failureSummary}));
async function visit(route,noJS=false,old=false){
 const context=await browser.newContext({javaScriptEnabled:true,viewport:{width:1366,height:900},reducedMotion:'reduce'}),page=await context.newPage(),logs={errors:[],failed:[],console:[]};let session=null;
 page.on('pageerror',error=>logs.errors.push(error.message));page.on('requestfailed',request=>logs.failed.push({url:request.url(),error:request.failure()?.errorText}));page.on('console',message=>{if(message.type()==='error')logs.console.push(message.text());});
 if(noJS){session=await context.newCDPSession(page);await session.send('Emulation.setScriptExecutionDisabled',{value:true});}
 await page.goto(base+(old?'baseline/':'')+route,{waitUntil:'load'});
 const toolbar=page.locator('.reader-toolbar'),groupCount=await page.getByRole('group',{name:'Cuaderno personal',exact:true}).count();
 const dom=await toolbar.evaluate(el=>({role:el.getAttribute('role'),label:el.getAttribute('aria-label'),tag:el.tagName,classes:document.documentElement.className,menuTag:document.querySelector('.menu-toggle')?.tagName}));
 if(noJS){check('Static product before axe '+route,!/\b(?:js|ready|motion-ready|notebook-ready)\b/.test(dom.classes)&&dom.menuTag==='A');await session.send('Emulation.setScriptExecutionDisabled',{value:false});}
 await page.evaluate(axeCode);
 const report=await page.evaluate(async()=>{const report=await axe.run(document,{runOnly:{type:'rule',values:['aria-prohibited-attr']}});return {violations:report.violations,incomplete:report.incomplete,passes:report.passes};});
 const prohibited=compact(toolbarNodes(report.violations.find(rule=>rule.id==='aria-prohibited-attr'))),incomplete=compact(toolbarNodes(report.incomplete.find(rule=>rule.id==='aria-prohibited-attr'))),passes=compact(toolbarNodes(report.passes.find(rule=>rule.id==='aria-prohibited-attr')));
 const after=await page.evaluate(()=>({classes:document.documentElement.className,menuTag:document.querySelector('.menu-toggle')?.tagName}));
 if(noJS)check('Static product after axe '+route,!/\b(?:js|ready|motion-ready|notebook-ready)\b/.test(after.classes)&&after.menuTag==='A');
 const entry={route,mode:noJS?'no-js':'js',groupCount,dom,aria_prohibited_attr:{violations:prohibited,incomplete,passes},logs};
 if(old){entry.pass=groupCount===0&&dom.role===null&&dom.label==='Cuaderno personal'&&incomplete.length>0&&!prohibited.length;result.negative=entry;check('Original Cap exposes unlabeled generic role and incomplete prohibited-name review',entry.pass,{entry});}
 else{entry.pass=groupCount===1&&dom.role==='group'&&dom.label==='Cuaderno personal'&&!prohibited.length&&!incomplete.length&&passes.length>0&&!logs.errors.length&&!logs.failed.length&&!logs.console.length;result.profiles.push(entry);check('Named reader group has no prohibited/incomplete naming '+route+' '+entry.mode,entry.pass,{entry:entry.pass?undefined:entry});}
 if(session){await session.send('Emulation.setScriptExecutionDisabled',{value:true});await session.detach();}
 await context.close();
}
(async()=>{
 check('Exactly 16 reader-toolbar routes discovered',routes.length===16,{routes});
 server=http.createServer((request,response)=>{let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400).end();return;}const old=pathname.startsWith('/baseline/'),folder=old?baseline:dist,relative=old?pathname.slice('/baseline'.length):pathname,file=path.resolve(folder,'.'+relative);if(!file.startsWith(folder+path.sep)){response.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){response.writeHead(404).end();return;}const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.png':'image/png','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream';response.writeHead(200,{'Content-Type':mime});response.end(data);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
 browser=await chromium.launch({headless:true,executablePath:process.env.RG_CHROMIUM_EXECUTABLE||process.env.REPORT_GEN_CHROMIUM||undefined,args:['--no-sandbox']});result.browser=browser.version();
 await visit('cap.html',false,true);
 for(const route of routes)for(const noJS of [false,true]){await visit(route,noJS);if(result.profiles.length%8===0)console.log('Profiles '+result.profiles.length+'; failures '+failures);}
})().catch(error=>{failures++;result.issues.push({name:'Harness exception',error:error.stack});}).finally(async()=>{result.inputs_after=hashes();check('Audited HTML, generators and JS/CSS stayed unchanged',JSON.stringify(result.inputs_before)===JSON.stringify(result.inputs_after));result.summary={profiles:result.profiles.length,checks:result.checks.length,negative:result.negative?.pass===true,failures};fs.writeFileSync(path.join(__dirname,'audit-reader-group.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));process.exitCode=failures?1:0;});
