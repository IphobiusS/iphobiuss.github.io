/* Focused Chromium contracts for S08/S09/S10. Run with SITE_CHROMIUM and
   SITE_PLAYWRIGHT_MODULE; failures are fatal and missing browsers do not count as passes. */
const assert = require('node:assert/strict');
const { openAppearance, openTerminal } = require('./qa-interactions.cjs');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { axeSource } = require('./qa-deps.cjs');
const { chromium } = require(process.env.SITE_PLAYWRIGHT_MODULE || process.env.REPORT_GEN_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.SITE_NOTEBOOK_DIST || path.join(__dirname, '../dist'));
const key = 'iphobiuss:notebook:v1';
const item = (url, note = '') => ({ url, title: url.split('.')[0], note, updated: '2026-10-08T00:00:00.000Z' });
const book = (items = [], reading = []) => ({ version: 1, items, reading });
const results = [];
const check = async (name, fn) => { await fn(); results.push({ name, passed: true }); };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => { const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname)); if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; } fs.readFile(file, (err, data) => { if (err) res.writeHead(404).end(); else { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(data); } }); });
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = 'http://127.0.0.1:' + server.address().port;
 const browser = await chromium.launch({ executablePath: process.env.SITE_CHROMIUM || process.env.RG_CHROMIUM_EXECUTABLE || process.env.REPORT_GEN_CHROMIUM, headless: true, args: ['--no-sandbox'] });
 try {
  const context = await browser.newContext({ reducedMotion: 'reduce' }), page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/cuaderno.html');
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key, value: book([item('cap.html', 'Nota guardada')], [item('cap.html#idor')]) });
  await page.reload(); await page.locator('[data-notebook-note]').fill('Borrador sin guardar');
  await check('import preview preserves storage and dirty note', async () => {
   await page.locator('[data-notebook-import]').click();
   await page.locator('[data-notebook-import-file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(book([item('cap.html', 'Nota importada'), item('forest.html', 'Nuevo')], [item('cap.html#access'), item('forest.html#enum')]))) });
   await page.waitForFunction(() => !document.querySelector('[data-notebook-import-apply]').disabled);
   assert.equal(await page.locator('[data-notebook-note="cap.html"]').inputValue(), 'Borrador sin guardar');
   assert.equal(JSON.parse(await page.evaluate(key => localStorage.getItem(key), key)).items.length, 1);
  });
  await check('additive import keeps collisions and dirty note', async () => {
   await page.locator('[data-notebook-import-apply]').click();
   await page.waitForFunction(() => document.querySelector('[data-notebook-import-panel]').hidden);
   const value = JSON.parse(await page.evaluate(key => localStorage.getItem(key), key));
   assert.equal(value.items.length, 2); assert.equal(value.items[0].note, 'Nota guardada'); assert.equal(value.reading[0].url, 'cap.html#idor');
   assert.equal(await page.locator('[data-notebook-note="cap.html"]').inputValue(), 'Borrador sin guardar');
   assert.equal(await page.locator('[data-notebook-import]').getAttribute('aria-expanded'), 'false');
  });
  await check('Markdown copy denial exposes selectable current text without saving', async () => {
   await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('denied'); } } }));
   await page.locator('[data-notebook-copy="cap.html"]').click();
   const field = page.locator('[data-notebook-markdown="cap.html"]');
   assert.match(await field.inputValue(), /Borrador sin guardar/); assert.match(await field.inputValue(), /https:\/\/iphobiuss.github.io\/cap.html/);
   assert.equal(await field.evaluate(el => document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === el.value.length), true);
   assert.equal(JSON.parse(await page.evaluate(key => localStorage.getItem(key), key)).items[0].note, 'Nota guardada');
  });
  await check('catalog retomar opens exact section despite card title overlay', async () => {
   await page.goto(base + '/guias.html'); const panel = page.locator('[data-guide-progress="cap.html"]');
   assert.equal(await page.getByRole('group', { name: 'Cuaderno personal', exact: true }).count(), 1); assert.equal(await page.locator('.reader-toolbar').getAttribute('role'), 'group');
   assert.match(await panel.textContent(), /sección 3 de 8/);
   await panel.locator('a').click(); assert.equal(new URL(page.url()).hash, '#idor');
  });
  await check('slash allows Shift keyboard layouts and focuses search', async () => {
   await page.goto(base + '/buscar.html'); await page.locator('h1').click();
   const prevented = await page.evaluate(() => { const event = new KeyboardEvent('keydown', { key: '/', shiftKey: true, bubbles: true, cancelable: true }); document.body.dispatchEvent(event); return event.defaultPrevented; });
   assert.equal(prevented, true); assert.equal(await page.locator('input[name=q]').evaluate(el => el === document.activeElement), true);
  });
  await check('recent choice stores explicit submitted searches only', async () => {
   const field = page.locator('input[name=q]'); await field.fill('private draft'); await page.waitForTimeout(200); assert.equal(await page.evaluate(() => localStorage.getItem('iphobiuss:search-recents:v1')), null);
   await page.locator('.search-recents>summary').click(); await page.locator('[data-search-history-optin]').check(); await field.fill('dcsync'); await page.waitForTimeout(200); assert.equal(await page.evaluate(() => localStorage.getItem('iphobiuss:search-recents:v1')), null);
   await field.press('Enter'); assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('iphobiuss:search-recents:v1'))), ['dcsync']);
  });
  await check('recent clear and disabling choice erase persistent queries', async () => {
   await page.locator('[data-search-history-clear]').click(); assert.equal(await page.evaluate(() => localStorage.getItem('iphobiuss:search-recents:v1')), null);
   await page.locator('input[name=q]').press('Enter'); await page.locator('[data-search-history-optin]').uncheck(); assert.equal(await page.evaluate(() => localStorage.getItem('iphobiuss:search-recents:v1')), null); assert.equal(await page.evaluate(() => localStorage.getItem('iphobiuss:search-history:consent')), null);
  });
  await check('no JavaScript catalogue does not invent reading progress', async () => {
   const nojs = await browser.newContext({ javaScriptEnabled: false }), p = await nojs.newPage(); await p.goto(base + '/guias.html'); assert.equal(await p.locator('[data-guide-progress]').count(), 7); assert.equal(await p.locator('[data-guide-progress-message]').count(), 1); assert.match(await p.locator('[data-guide-progress-message]').textContent(), /requieren JavaScript/); for (const panel of await p.locator('[data-guide-progress]').all()) { assert.ok(await panel.isHidden()); assert.equal(await panel.textContent(), ''); } await nojs.close();
  });
  await check('generated long reading title survives reload and JSON export/import review', async () => {
   const generatedContext = await browser.newContext({ reducedMotion: 'reduce' }), generatedPage = await generatedContext.newPage();
   await generatedPage.route('**/cap.html', async route => { const response = await route.fetch(); let body = await response.text(); body = body.replace(/<h1\b[^>]*>/, '<h1 aria-label="' + 'A'.repeat(130) + '">'); body = body.replace(/(<h2\b[^>]*>)[^<]*(<\/h2>)/, '$1' + 'B'.repeat(100) + '$2'); await route.fulfill({ response, body }); });
   await generatedPage.goto(base + '/cap.html');
   await generatedPage.evaluate(() => { document.querySelector('.article-content section[id]').scrollIntoView(); window.dispatchEvent(new Event('scroll')); });
   await generatedPage.waitForFunction(key => { const raw = localStorage.getItem(key); return raw && JSON.parse(raw).reading.length === 1; }, key);
   const generated = JSON.parse(await generatedPage.evaluate(key => localStorage.getItem(key), key)); assert.equal(generated.reading[0].title.length, 160);
   await generatedPage.goto(base + '/cuaderno.html'); assert.equal(await generatedPage.locator('[data-notebook-resume] a').count(), 1);
   const downloadEvent = generatedPage.waitForEvent('download'); await generatedPage.locator('[data-notebook-export=\"json\"]').click(); const download = await downloadEvent;
   const exported = fs.readFileSync(await download.path()); assert.equal(JSON.parse(exported).reading[0].title, generated.reading[0].title);
   await generatedPage.locator('[data-notebook-import]').click(); await generatedPage.locator('[data-notebook-import-file]').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: exported });
   await generatedPage.waitForFunction(() => document.querySelector('[data-notebook-import-preview]').textContent.startsWith('Revisión:'));
   assert.match(await generatedPage.locator('[data-notebook-import-preview]').textContent(), /0 entradas nuevas y 1 coincidencias/); assert.equal(await generatedPage.locator('[data-notebook-import-apply]').isDisabled(), true);
   await generatedContext.close();
  });
  await check('maximum Unicode notebook export reviews intact and files above 4 MiB reject', async () => {
   const unicodeContext = await browser.newContext({ reducedMotion: 'reduce' }), unicodePage = await unicodeContext.newPage(); await unicodePage.goto(base + '/cuaderno.html');
   const names = ['guias','tecnicas','herramientas','fundamentos','setup','cap','knife','forest','vaccine','sauna','cascade','cap-caso','forest-caso','banco-lumbre','cuaderno','recorrido','report-gen-demo'];
   const favorites = Array.from({ length: 200 }, (_, index) => ({ url: 'cap.html#' + '中'.repeat(488) + String(index).padStart(3, '0'), title: '中'.repeat(160), note: '中'.repeat(2000), updated: '2026-10-08T00:00:00.000Z' }));
   const reading = names.map(name => ({ url: name + '.html#' + '中'.repeat(500 - (name + '.html#').length), title: '中'.repeat(160), note: '中'.repeat(2000), updated: '2026-10-08T00:00:00.000Z' }));
   const original = book(favorites, reading); await unicodePage.evaluate(({ key, original }) => localStorage.setItem(key, JSON.stringify(original)), { key, original }); await unicodePage.reload();
   assert.equal(await unicodePage.locator('[data-notebook-note]').count(), 200); const downloadEvent = unicodePage.waitForEvent('download'); await unicodePage.locator('[data-notebook-export=\"json\"]').click(); const download = await downloadEvent, exported = fs.readFileSync(await download.path());
   assert.ok(exported.length > 1024 * 1024 && exported.length < 2 * 1024 * 1024); assert.deepEqual(JSON.parse(exported), original);
   await unicodePage.locator('[data-notebook-import]').click(); await unicodePage.locator('[data-notebook-import-file]').setInputFiles({ name: 'max-unicode.json', mimeType: 'application/json', buffer: exported });
   await unicodePage.waitForFunction(() => document.querySelector('[data-notebook-import-preview]').textContent.startsWith('Revisión:'));
   assert.match(await unicodePage.locator('[data-notebook-import-preview]').textContent(), /0 entradas nuevas y 217 coincidencias/); assert.equal(await unicodePage.locator('[data-notebook-import-apply]').isDisabled(), true);
   const storedBefore = await unicodePage.evaluate(key => localStorage.getItem(key), key);
   await unicodePage.locator('[data-notebook-import-file]').setInputFiles({ name: 'oversized.json', mimeType: 'application/json', buffer: Buffer.alloc(4 * 1024 * 1024 + 1, 32) });
   await unicodePage.waitForFunction(() => document.querySelector('[data-notebook-import-preview]').textContent.includes('supera 4 MiB'));
   assert.equal(await unicodePage.locator('[data-notebook-import-apply]').isDisabled(), true); assert.equal(await unicodePage.evaluate(key => localStorage.getItem(key), key), storedBefore);
   await unicodeContext.close();
  });
  await check('serialized upper bound covers isolated surrogate code units and additive roundtrip', async () => {
   // Every accepted string unit takes at most 6 JSON bytes, including isolated surrogates.
   // This deliberately overestimates dates as escaped text; object/indent overhead is bounded per row.
   const bound = (200 + 40) * ((500 + 160 + 2000 + 24) * 6 + 200) + 200;
   assert.ok(bound < 4 * 1024 * 1024, 'Complete v1 schema serialized bound must stay below the file budget');
   const surrogateContext = await browser.newContext({ reducedMotion: 'reduce' }), surrogatePage = await surrogateContext.newPage(); await surrogatePage.goto(base + '/cuaderno.html');
   const notes = Array.from({ length: 200 }, (_, index) => item('cap.html#surrogate' + index, '\ud800'.repeat(2000)));
   await surrogatePage.locator('[data-notebook-import]').click();
   for (const entries of [notes.slice(0, 150), notes.slice(150)]) {
    const bytes = Buffer.from(JSON.stringify(book(entries))); assert.ok(bytes.length < 2 * 1024 * 1024);
    await surrogatePage.locator('[data-notebook-import-file]').setInputFiles({ name: 'part.json', mimeType: 'application/json', buffer: bytes });
    await surrogatePage.waitForFunction(() => !document.querySelector('[data-notebook-import-apply]').disabled); await surrogatePage.locator('[data-notebook-import-apply]').click(); await surrogatePage.waitForFunction(() => document.querySelector('[data-notebook-import-panel]').hidden);
    if (entries.length === 150) await surrogatePage.locator('[data-notebook-import]').click();
   }
   assert.equal(await surrogatePage.locator('[data-notebook-note]').count(), 200);
   const downloadEvent = surrogatePage.waitForEvent('download'); await surrogatePage.locator('[data-notebook-export=\"json\"]').click(); const download = await downloadEvent, exported = fs.readFileSync(await download.path());
   assert.ok(exported.length > 2 * 1024 * 1024 && exported.length < 4 * 1024 * 1024); assert.deepEqual(JSON.parse(exported).items, notes);
   await surrogatePage.reload(); assert.equal(await surrogatePage.locator('[data-notebook-note]').count(), 200); await surrogatePage.locator('[data-notebook-import]').click();
   await surrogatePage.locator('[data-notebook-import-file]').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: exported }); await surrogatePage.waitForFunction(() => document.querySelector('[data-notebook-import-preview]').textContent.startsWith('Revisión:'));
   assert.match(await surrogatePage.locator('[data-notebook-import-preview]').textContent(), /0 entradas nuevas y 200 coincidencias/); assert.equal(await surrogatePage.locator('[data-notebook-import-apply]').isDisabled(), true);
   await surrogateContext.close();
  });
  await check('animation labels stay stable with visual state shapes, toggles and reduced motion', async () => {
   const motionContext = await browser.newContext({ viewport: { width: 1366, height: 900 } }), motionPage = await motionContext.newPage();
   await motionContext.addInitScript(() => localStorage.setItem('iphobiuss:motion', 'paused'));
   await motionPage.goto(base + '/404.html'); await openAppearance(motionPage); const compact = motionPage.locator('[data-motion-toggle][data-compact]');
   assert.equal(await compact.getAttribute('aria-label'), 'Fondo animado'); assert.equal(await compact.getAttribute('aria-pressed'), 'false'); assert.equal(await compact.locator('[data-motion-indicator]').getAttribute('d'), 'M9 4v16M15 4v16');
   assert.equal(await compact.innerText(), 'Fondo animado'); await compact.click(); assert.equal(await compact.getAttribute('aria-label'), 'Fondo animado'); assert.equal(await compact.getAttribute('aria-pressed'), 'true'); assert.notEqual(await compact.locator('[data-motion-indicator]').getAttribute('d'), 'M9 4v16M15 4v16');
   await motionPage.goto(base + '/index.html'); await openTerminal(motionPage); const full = motionPage.locator('[data-motion-toggle]:not([data-compact])'); assert.equal(await full.count(), 1); assert.equal(await full.getAttribute('aria-label'), 'Animación del sitio'); assert.equal(await full.locator('span:not([aria-hidden])').first().textContent(), 'Animación del sitio');
   { await motionPage.evaluate(axeSource); const violations = await motionPage.evaluate(async () => (await axe.run(document, { runOnly: ['label-content-name-mismatch'] })).violations); assert.deepEqual(violations, []); }
   await motionPage.emulateMedia({ reducedMotion: 'reduce' }); await motionPage.waitForFunction(() => [...document.querySelectorAll('[data-motion-toggle]')].every(el => el.disabled)); assert.equal(await full.getAttribute('aria-label'), 'Animación del sitio'); assert.equal(await full.getAttribute('aria-pressed'), 'false'); assert.equal(await full.locator('[data-motion-indicator]').getAttribute('d'), 'M9 4v16M15 4v16');
   await motionContext.close();
  });
  await check('unknown stored schema remains unchanged after local bookmark action', async () => {
   await page.goto(base + '/cuaderno.html'); const future = JSON.stringify({ version: 2, items: [item('cap.html', 'Future stored content')], reading: [] });
   await page.evaluate(({ key, future }) => localStorage.setItem(key, future), { key, future });
   await page.goto(base + '/cap.html'); await page.locator('[data-bookmark=\"cap.html\"]').click();
   assert.equal(await page.evaluate(key => localStorage.getItem(key), key), future);
   assert.match(await page.locator('[data-notebook-status]').textContent(), /solo durará durante esta página/);
  });
  assert.deepEqual(errors, []); await context.close();
 } finally { await browser.close(); }
 fs.writeFileSync(path.resolve(process.env.SITE_CONTINUITY_OUTPUT || path.join(__dirname, 'site-continuity-results.json')), JSON.stringify({ browser: 'Chromium', checks: results, count: results.length }, null, 2) + '\n');
 console.log(JSON.stringify({ passed: results.length, failures: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
