/* Native browser regressions for reading marks: navigation is not completion. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const {chromium} = require(process.env.SITE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.SITE_READING_DIST || path.join(__dirname, '../dist'));
const source = process.env.SITE_READING_SOURCE;
const output = process.env.SITE_READING_OUTPUT;
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml'};
const server = http.createServer((req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname;
  const file = source && route === '/assets/js/site.js' ? path.resolve(source) : path.resolve(root, '.' + route);
  if (!(source && file === path.resolve(source)) && !file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, bytes) => { if (error) return res.writeHead(404).end(); res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(bytes); });
});
const key = 'iphobiuss:seen:cap', results = []; let browser, base;
async function fresh({reducedMotion = 'reduce', seed} = {}) {
  const context = await browser.newContext({viewport:{width:1440,height:900}, reducedMotion});
  await context.addInitScript(({key, seed}) => { localStorage.setItem('iphobiuss:intro','off'); if (seed !== undefined) localStorage.setItem(key, JSON.stringify(seed)); }, {key,seed});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/cap.html');
  await page.waitForFunction(() => document.documentElement.classList.contains('ready'));
  return {context,page,errors};
}
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), key);
async function wheelToNext(page, nextId) {
  await page.evaluate(id => {
    const axis = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 0) + 72;
    const next = document.getElementById(id);
    window.scrollTo({top:next.getBoundingClientRect().top + scrollY - axis - 60,behavior:'instant'});
  }, nextId);
  await page.waitForTimeout(300);
  await page.mouse.move(1100,450);
  await page.mouse.wheel(0,160);
  await page.waitForTimeout(400);
}
async function check(name, fn, options) {
  const state = await fresh(options);
  try { await fn(state); assert.deepEqual(state.errors, []); results.push({name,passed:true}); console.log('PASS ' + name); }
  catch(error) { results.push({name,passed:false,error:error.message}); console.log('FAIL ' + name + ': ' + error.message); }
  finally { await state.context.close(); }
}
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({executablePath:process.env.SITE_CHROMIUM,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  await check('Adjacent TOC anchor does not mark the skipped section', async ({page}) => {
    await page.locator('.article-toc a').nth(1).click(); await page.waitForTimeout(350); assert.deepEqual(await stored(page), []);
  });
  await check('j shortcut advances without claiming a section was read', async ({page}) => {
    await page.locator('.article-toc a').first().click(); await page.waitForTimeout(300);
    await page.keyboard.press('j'); await page.waitForTimeout(350); assert.deepEqual(await stored(page), []);
  });
  await check('Smooth TOC navigation does not mark intermediate sections', async ({page}) => {
    await page.locator('.article-toc a').nth(4).click(); await page.waitForTimeout(1800); assert.deepEqual(await stored(page), []);
  }, {reducedMotion:'no-preference'});
  await check('Wheel reading still marks the section just left', async ({page}) => {
    await wheelToNext(page, 'recon'); assert.deepEqual(await stored(page), ['vpn']);
  });
  await check('Notebook clear in another tab removes UI marks and old progress stays deleted', async ({context,page}) => {
    await wheelToNext(page, 'recon'); assert.deepEqual(await stored(page), ['vpn']);
    const other = await context.newPage(); await other.goto(base + '/cuaderno.html');
    await other.locator('[data-notebook-clear]').click(); await other.locator('[data-notebook-clear-yes]').click();
    await page.waitForTimeout(300);
    assert.deepEqual(await stored(page), []); assert.equal(await page.locator('.article-toc a[data-seen]').count(), 0);
    await wheelToNext(page, 'idor'); assert.deepEqual(await stored(page), ['recon']);
  });
  await check('Malformed persisted marks never break the page or invent markers', async ({page}) => {
    assert.equal(await page.locator('.article-toc a[data-seen]').count(), 0);
    await page.locator('.article-toc a').nth(1).click(); await page.waitForTimeout(300);
    assert.equal(await page.locator('.article-toc a[data-seen]').count(), 0);
  }, {seed:{vpn:true}});
  if (output) fs.writeFileSync(output, JSON.stringify({browser:browser.version(),checks:results.length,passed:results.filter(row=>row.passed).length,results},null,2)+'\n');
  if (results.some(row=>!row.passed)) process.exitCode = 1;
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async () => {await browser?.close();server.close();});
