#!/usr/bin/env node
/* Read-only S07 measurement. CLI: --site <dist> --runtime <runtime.json> --output <json> */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const opts = {};
for (let n=2;n<process.argv.length;n+=2) opts[process.argv[n].replace(/^--/,'')] = process.argv[n+1];
const runtime = opts.runtime ? JSON.parse(fs.readFileSync(opts.runtime)) : {};
const playwright = require(process.env.REPORT_GEN_PLAYWRIGHT_MODULE || runtime.playwright || 'playwright');
const site = path.resolve(opts.site || 'dist');
const output = path.resolve(opts.output || 'screenshot-measurements.json');
const digest = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(site, rel))).digest('hex');
const pages = ['index.html#readme','index.html#proyectos','proyectos.html','report-gen-demo.html'];
const files = [...new Set(pages.map(p=>p.split('#')[0])), 'assets/css/site.css','assets/css/dossier.css','assets/css/identity.css'];
const before = Object.fromEntries(files.map(f=>[f,digest(f)]));
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff'};
const server = http.createServer((req,res)=>{
  const rel = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'');
  const p = path.resolve(site,rel || 'index.html');
  if (!p.startsWith(site + path.sep)) {res.writeHead(403).end();return;}
  fs.readFile(p,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(p)] || 'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch({executablePath:process.env.RG_CHROMIUM_EXECUTABLE || runtime.chromium,args:['--no-sandbox']});
  const rows=[],issues=[];
  try {
    for (const width of (opts.widths || '390,768,1100,1366,1920').split(',').map(Number)) for (const dpr of (opts.dprs || '1,2,3').split(',').map(Number)) {
      const context = await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:dpr,reducedMotion:'reduce'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===base ? route.continue() : route.abort());
      for(const route of pages){
        const page = await context.newPage();
        page.on('pageerror',e=>issues.push({width,dpr,route,type:'pageerror',message:e.message}));
        await page.goto(`${base}/${route}`,{waitUntil:'networkidle'});
        await page.evaluate(async zoom=>{
          if(zoom!==100) document.documentElement.style.fontSize=`${16*zoom/100}px`;
          await document.fonts.ready;
          document.querySelectorAll('details').forEach(x=>x.open=true);
        },Number(opts['text-zoom'] || 100));
        if(opts['auto-sizes-probe']==='true') await page.evaluate(()=>{
          document.querySelectorAll('img[src*="report-gen-"]').forEach(el=>{
            const source=el.closest('picture')?.querySelector('source');
            if(source) source.setAttribute('sizes',`auto, ${source.getAttribute('sizes')}`);
          });
        });
        if(route.startsWith('index')) {
          const wanted=route.split('#')[1];
          await page.locator(`.tree a[data-folder="${wanted}"]`).click();
          await page.waitForFunction(id=>!document.getElementById(id).hidden,wanted);
        }
        const imgs=page.locator('img[src*="report-gen-"]');
        for(let i=0;i<await imgs.count();i++){
          const img=imgs.nth(i);
          if(!await img.isVisible())continue;
          await img.scrollIntoViewIfNeeded();
          await img.evaluate(async el=>{await Promise.race([(async()=>{if(!el.complete)await new Promise((resolve,reject)=>{el.addEventListener('load',resolve,{once:true});el.addEventListener('error',reject,{once:true});});await el.decode().catch(()=>{});})(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('image decode deadline')),15000))]);});
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const data=await img.evaluate(el=>{
            const rect=el.getBoundingClientRect(),picture=el.closest('picture'),source=picture?.querySelector('source'),style=getComputedStyle(el);
            const box=x=>{const r=x.getBoundingClientRect(),c=getComputedStyle(x);return {tag:x.tagName,class:x.className,id:x.id,width:r.width,height:r.height,paddingLeft:c.paddingLeft,paddingRight:c.paddingRight,borderLeft:c.borderLeftWidth,borderRight:c.borderRightWidth,maxWidth:c.maxWidth,display:c.display};};
            return {src:el.getAttribute('src'),loading:el.loading,currentSrc:new URL(el.currentSrc).pathname,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight,renderedWidth:rect.width,renderedContentWidth:rect.width-parseFloat(style.borderLeftWidth)-parseFloat(style.borderRightWidth)-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),renderedHeight:rect.height,rootFontSize:getComputedStyle(document.documentElement).fontSize,sourceSizes:source?.getAttribute('sizes'),sourceSrcset:source?.getAttribute('srcset'),imgSizes:el.getAttribute('sizes'),imgSrcset:el.getAttribute('srcset'),ancestors:[el.parentElement,el.parentElement.parentElement,el.closest('.pane')||el.closest('.narrow')||el.closest('.shell')].filter(Boolean).map(box)};
          });
          data.expectedSourceSlotWidth = data.sourceSizes?.startsWith('auto,') ? data.renderedContentWidth : data.renderedWidth;
          data.sourceSlotDifferenceCSSPixels = Math.abs(data.naturalWidth-data.expectedSourceSlotWidth);
          data.sourceSlotMatchesRenderedBox = data.sourceSlotDifferenceCSSPixels <= 2;
          rows.push({route,viewportWidth:width,dpr,...data});
          if(opts['assert-size']==='true' && !data.sourceSlotMatchesRenderedBox) issues.push({width,dpr,route,src:data.src,type:'source-size-mismatch',renderedWidth:data.renderedWidth,naturalWidth:data.naturalWidth,sizes:data.sourceSizes});
        }
        console.log(JSON.stringify({measured:route,width,dpr,rows:rows.length}));
        await page.close();
      }
      await context.close();
    }
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
  const after=Object.fromEntries(files.map(f=>[f,digest(f)]));
  let currentSourceFiles={};
  const imagePython=opts['image-python'] || runtime.site_python;
  if(imagePython){
    const filenames=[...new Set(rows.map(r=>r.currentSrc.replace(/^\//,'')))];
    const script='import json,sys\nfrom pathlib import Path\nfrom PIL import Image\nbase=Path(sys.argv[1]); result={}\nfor rel in json.loads(sys.argv[2]):\n p=base/rel\n with Image.open(p) as im: result[rel]={"pixelWidth":im.width,"pixelHeight":im.height,"bytes":p.stat().st_size}\nprint(json.dumps(result))';
    currentSourceFiles=JSON.parse(execFileSync(imagePython,['-c',script,site,JSON.stringify(filenames)],{encoding:'utf8'}));
  }
  const result={generatedAt:new Date().toISOString(),scope:'Read-only rendered CSS screenshot dimensions in default dark theme. Each DPR uses a fresh browser context; hidden index panes measured after selecting actual folder. Collapsed project details opened via native details property. No image contents or remote services modified.',instrumentation:{textZoomPercent:Number(opts['text-zoom'] || 100),autoSizesDOMProbe:opts['auto-sizes-probe']==='true',assertSourceSize:opts['assert-size']==='true'},runtime:{chromium:runtime.chromium,playwright:runtime.playwright},naturalWidthNote:'DOM naturalWidth is density-corrected under w-descriptor srcset; currentSourceFiles records actual resource pixel dimensions separately. --assert-size true requires the declared source slot to match within 2px for native integer rounding. Auto selects the concrete image content box, excluding CSS border/padding; authored fallback formulas were derived from the outer screenshot box.',currentSourceFiles,sourceHashesBefore:before,sourceHashesAfter:after,sourceChanged:files.filter(f=>before[f]!==after[f]),rows,issues};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  const unique=new Map();for(const r of rows){const key=[r.route,r.src,r.viewportWidth].join('|');if(!unique.has(key))unique.set(key,r);}
  console.log(JSON.stringify({measurements:rows.length,issues:issues.length,sourceChanged:result.sourceChanged,dimensions:[...unique.values()].map(({route,src,viewportWidth,renderedWidth,currentSrc})=>({route,src,viewportWidth,renderedWidth,currentSrc}))},null,2));
  process.exitCode=issues.length||result.sourceChanged.length?1:0;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
