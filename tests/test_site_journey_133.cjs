/* S03/S04/S07 contracts. All navigation remains native and inspectable without JS. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { axeSource } = require('./qa-deps.cjs');
const { chromium } = require(process.env.SITE_PLAYWRIGHT_MODULE || process.env.REPORT_GEN_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist');
const output = path.resolve(process.env.SITE_JOURNEY_OUTPUT || path.join(__dirname, 'site-journey-133-results.json'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => { const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname)); if (!file.startsWith(root + path.sep)) return res.writeHead(403).end(); fs.readFile(file, (err, data) => { if (err) res.writeHead(404).end(); else { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(data); } }); });
const ids = ['criterio', 'caso-web', 'caso-ad', 'resultado'];
const results = []; let browser;
const check = async (name, fn) => { try { console.log(name); await fn(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, error: e.message }); throw e; } };
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port;
 browser = await chromium.launch({ executablePath: process.env.SITE_CHROMIUM || process.env.RG_CHROMIUM_EXECUTABLE || process.env.REPORT_GEN_CHROMIUM, headless: true, args: ['--no-sandbox'] });
 try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' }), page = await context.newPage(), errors = [];
  context.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/recorrido.html'); await page.evaluate(() => document.fonts.ready); await page.waitForFunction(() => document.querySelector('h1').textContent === 'Recorrido breve'); await frames(page);
  await check('four native stops expose estimated times and honest reading scope', async () => {
   assert.equal(await page.locator('[data-journey-stop]').count(), 4); assert.equal(await page.locator('[data-journey-nav] a').count(), 4);
   assert.deepEqual(await page.locator('[data-journey-nav] a').evaluateAll(links => links.map(link => link.getAttribute('href'))), ids.map(id => '#' + id));
   assert.equal(await page.locator('h1').innerText(), 'Recorrido breve'); assert.match(await page.locator('#journey-scope').innerText(), /tiempos son orientativos/);
   assert.equal(await page.locator('.journey-time').count(), 4); for (const text of await page.locator('.journey-time').allTextContents()) assert.match(text, /Lectura estimada: (20|25) s/);
   for (const id of ids) assert.ok(await page.locator('#' + id).isVisible());
  });
  await check('time passing never scrolls the page or creates completion state', async () => {
   const before = await page.evaluate(() => ({ y: scrollY, storage: Object.entries(localStorage) }));
   await page.waitForTimeout(700);
   assert.deepEqual(await page.evaluate(() => ({ y: scrollY, storage: Object.entries(localStorage) })), before);
   assert.equal(await page.locator('[data-journey-nav] [aria-current="step"], [data-journey-nav] [role="progressbar"]').count(), 0);
  });
  for (const id of ids) await check('scroll location reflects ' + id + ' without modifying URL/focus', async () => {
   const oldUrl = page.url(); await page.locator('[data-journey-nav] a').first().focus();
   await page.evaluate(id => { const el = document.getElementById(id), header = document.querySelector('.site-header'); const axis = header.getBoundingClientRect().height + 40; scrollTo(0, scrollY + el.getBoundingClientRect().top - axis + 20); }, id);
   await page.waitForFunction(id => document.querySelector('[data-journey-nav] [aria-current="location"]')?.hash === '#' + id, id);
   assert.equal(await page.locator('[data-journey-nav] [aria-current]').count(), 1); assert.equal(page.url(), oldUrl);
   assert.equal(await page.locator('[data-journey-nav] a').first().evaluate(el => el === document.activeElement), true);
  });
  await check('keyboard Enter activates a real anchor and focuses its stop', async () => {
   await page.locator('[data-journey-nav] a[href="#caso-web"]').focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => location.hash === '#caso-web'); await frames(page);
   assert.equal(new URL(page.url()).hash, '#caso-web');
   assert.equal(await page.locator('#caso-web').evaluate(el => el === document.activeElement), true);
   await page.waitForFunction(() => document.querySelector('[data-journey-nav] [aria-current="location"]')?.hash === '#caso-web');
  });
  await check('direct historic page route and new stop hash remain readable', async () => {
   await page.goto(base + '/recorrido.html#caso-ad'); await frames(page);
   await page.waitForFunction(() => document.querySelector('[data-journey-nav] [aria-current="location"]')?.hash === '#caso-ad');
   assert.ok(await page.locator('#caso-ad').isVisible()); assert.match(await page.locator('#caso-ad').innerText(), /DCSync/);
  });
  await page.goto(base + '/index.html'); await page.evaluate(() => localStorage.setItem('iphobiuss:motion', 'paused')); await page.reload(); await frames(page);
  await check('portfolio hierarchy and case CTA target a visible real local section', async () => {
   assert.equal(await page.locator('.welcome-actions .primary').innerText(), 'Ver trabajos propios'); assert.equal(await page.locator('.welcome-actions .primary').getAttribute('href'), '#proyecto-destacado');
   assert.equal(await page.locator('.welcome-actions a').filter({ hasText: 'Ver casos' }).getAttribute('href'), '#casos');
   const cue = page.locator('.welcome-actions a[href="#casos"]'); assert.equal(await cue.innerText(), 'Ver casos HTB'); assert.equal(await cue.getAttribute('href'), '#casos'); assert.ok(await cue.isVisible());
   assert.equal(await page.locator('.session-shell').getAttribute('open'), null); assert.equal(await page.locator('[data-library]').getAttribute('open'), null); assert.equal(await page.locator('[data-intro][open]').count(), 0);
   await cue.focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => location.hash === '#casos'); await frames(page); assert.equal(new URL(page.url()).hash, '#casos'); assert.ok(await page.locator('#casos').isVisible());
   assert.equal(await cue.evaluate(el => el.getAnimations().length), 0);
  });
  await check('site motion remains paused and the terminal welcome needs no modal', async () => {
   assert.equal(await page.locator('html').getAttribute('data-paused'), '');
   assert.equal(await page.locator('[data-intro][open]').count(), 0);
   assert.ok(await page.locator('[data-hero-terminal]').isVisible());
   for (const state of await page.locator('[data-motion-toggle]').evaluateAll(els => els.map(el => el.getAttribute('aria-pressed')))) assert.equal(state, 'false');
  });
  assert.deepEqual(errors, []); await context.close();
  for (const mode of ['no-js', 'journey-blocked', 'site-blocked', 'reduced']) await check('static/native fallback: ' + mode, async () => {
   const ctx = await browser.newContext({ javaScriptEnabled: mode !== 'no-js', reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference', viewport: { width: 390, height: 844 } });
   ctx.setDefaultTimeout(10000); const p = await ctx.newPage(); const fallbackErrors = []; p.on('pageerror', e => fallbackErrors.push(e.message));
   if (mode === 'journey-blocked') await p.route('**/assets/js/journey.js', route => route.abort());
   if (mode === 'site-blocked') await p.route('**/assets/js/site.js', route => route.abort());
   await p.goto(base + '/recorrido.html');
   await p.locator('[data-intro][open]').waitFor({ state: 'hidden' });
   assert.equal(await p.locator('[data-journey-stop]').count(), 4); for (const link of await p.locator('[data-journey-nav] a').all()) assert.ok(await link.isVisible());
   if (mode === 'no-js' || mode === 'journey-blocked') assert.equal(await p.locator('[data-journey-nav] [aria-current]').count(), 0);
   await p.locator('[data-journey-nav] a[href="#caso-ad"]').focus(); await p.keyboard.press('Enter'); await p.waitForFunction(() => location.hash === '#caso-ad'); assert.equal(new URL(p.url()).hash, '#caso-ad');
   assert.ok(await p.locator('#caso-ad').isVisible());
   await p.goto(base + '/index.html'); if (mode !== 'no-js') { const skip = p.locator('[data-intro][open] [data-intro-skip]'); if (await skip.count()) await skip.click(); }
   const cue = p.locator('.welcome-actions a[href="#casos"]'); assert.ok(await cue.isVisible()); await cue.focus(); await p.keyboard.press('Enter'); await p.waitForFunction(() => location.hash === '#casos'); assert.equal(new URL(p.url()).hash, '#casos');
   assert.equal(await cue.evaluate(el => el.getAnimations().length), 0); assert.deepEqual(fallbackErrors, []); await ctx.close();
  });
  for (const theme of ['dark', 'paper', 'retro']) for (const width of [390, 1366]) for (const textScale of [100, 200]) await check(`reflow + WCAG axe ${theme}/${width}/${textScale}`, async () => {
   const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
   await ctx.addInitScript(theme => { if (theme === 'paper') localStorage.setItem('iphobiuss:theme', 'paper'); if (theme === 'retro') localStorage.setItem('iphobiuss:retro', 'on'); }, theme);
   ctx.setDefaultTimeout(10000); const p = await ctx.newPage();
   for (const route of ['recorrido.html', 'index.html']) {
    await p.goto(base + '/' + route); if (textScale === 200) await p.addStyleTag({ content: 'html{font-size:200%!important}' }); await p.evaluate(() => document.fonts.ready); await frames(p);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ' horizontal overflow');
    const selector = route === 'recorrido.html' ? '[data-journey-nav] a' : '.welcome-actions a[href="#casos"]';
    for (const link of await p.locator(selector).all()) { assert.ok(await link.isVisible()); assert.ok(await link.evaluate(el => el.getBoundingClientRect().height >= 44)); }
    { await p.evaluate(axeSource); const violations = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }).then(r => r.violations)); assert.deepEqual(violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []); }
   }
   await ctx.close();
  });
 } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
 fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({ summary: { total: results.length, passed: results.filter(r => r.passed).length, axe: true }, checks: results }, null, 2)); console.log(JSON.stringify({ total: results.length, passed: results.filter(r => r.passed).length, output }));
})().catch(async e => { if (browser) await browser.close().catch(() => {}); server.close(); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({ summary: { total: results.length, passed: results.filter(r => r.passed).length }, checks: results, fatal: e.stack }, null, 2)); console.error(e.stack); process.exitCode = 1; });
