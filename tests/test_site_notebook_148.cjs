/* Notebook data loss regressions: real tabs, write locks, raw recovery and failed storage. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require(process.env.SITE_PLAYWRIGHT_MODULE || 'playwright');
const { axeSource } = require('./qa-deps.cjs');
const root = path.resolve(process.env.SITE_NOTEBOOK_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_NOTEBOOK_OUTPUT || path.join(__dirname, 'site-notebook-148-results.json'));
const key = 'iphobiuss:notebook:v1', checks = [], contexts = [], errors = []; let browser, base;
const item = (url = 'cap.html', note = '', title = url) => ({ url, title, note, updated: '2026-10-10T00:00:00.000Z' });
const book = (items = [], reading = []) => ({ version: 1, items, reading });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => { const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname); if (!file.startsWith(root + path.sep)) return res.writeHead(403).end(); fs.readFile(file, (error, data) => { if (error) return res.writeHead(404).end(); res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(data); }); });
const check = async (name, run) => { if (process.env.SITE_NOTEBOOK_FILTER && !name.includes(process.env.SITE_NOTEBOOK_FILTER)) return; const row = { name, passed: false }; checks.push(row); try { row.detail = await run(); row.passed = true; console.log('PASS ' + name); } catch (error) { row.error = error.stack; throw error; } finally { for (const context of contexts.splice(0)) await context.close(); } };
async function setup(value = book([item('cap.html', 'Nota original'), item('forest.html', 'Nota Forest')]), init) {
 const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 960 } }); contexts.push(context);
 if (init) await context.addInitScript(init);
 const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); await page.goto(base + '/404.html');
 if (value !== null) await page.evaluate(({ key, value }) => localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)), { key, value });
 await page.goto(base + '/cuaderno.html'); await ready(page); return { context, page };
}
async function ready(page) { await page.waitForFunction(() => document.documentElement.classList.contains('notebook-ready')); }
const raw = page => page.evaluate(key => localStorage.getItem(key), key);
const stored = async page => JSON.parse(await raw(page));
const note = (page, url = 'cap.html') => page.locator('[data-notebook-note="' + url + '"]');
const status = page => page.locator('[data-notebook-status]').innerText();
const save = (page, url = 'cap.html') => note(page, url).locator('xpath=ancestor::article').getByRole('button', { name: /Guardar (?:nota|mi borrador sobre la versión revisada)/ }).click();
async function other(context, route = 'cuaderno.html') { const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); await page.goto(base + '/' + route); return page; }
async function seed(page, value) { await page.evaluate(({ key, value }) => localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)), { key, value }); }
async function exported(page, selector) { const pending = page.waitForEvent('download'); await page.locator(selector).click(); const download = await pending; return { bytes: fs.readFileSync(await download.path(), 'utf8'), filename: download.suggestedFilename() }; }
async function review(page, value) { await page.locator('[data-notebook-import]').click(); await page.locator('[data-notebook-import-file]').setInputFiles({ name: 'copy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }); await page.waitForFunction(() => !document.querySelector('[data-notebook-import-apply]').disabled); }
async function hold(context) { const locker = await other(context, '404.html'); await locker.evaluate(key => { window.readyLock = new Promise(resolve => { navigator.locks.request(key, () => new Promise(done => { window.releaseLock = done; resolve(); })); }); return window.readyLock; }, key); return locker; }
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
 browser = await chromium.launch({ executablePath: process.env.SITE_CHROMIUM || process.env.RG_CHROMIUM_EXECUTABLE, headless: true, args: ['--no-sandbox'] });
 await check('saving a note keeps the keyboard on its action and the next Tab in its item', async () => {
  const { page } = await setup(); await note(page).fill('Nota guardada con teclado');
  const button = note(page).locator('xpath=ancestor::article').getByRole('button', { name: 'Guardar nota', exact: true });
  await button.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).items[0].note === 'Nota guardada con teclado');
  assert.equal(await button.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab'); assert.equal(await page.locator('[data-notebook-copy="cap.html"]').evaluate(el => el === document.activeElement), true);
 });
 await check('external updates preserve focused actions and manual Markdown selection', async () => {
  const { context, page } = await setup(), b = await other(context, '404.html');
  const copy = page.locator('[data-notebook-copy="cap.html"]'); await copy.focus();
  await seed(b, book([item('cap.html', 'Nota original'), item('forest.html', 'Cambio 1')]));
  await page.waitForFunction(() => document.querySelector('[data-notebook-note="forest.html"]').value === 'Cambio 1');
  assert.equal(await copy.evaluate(el => el === document.activeElement), true);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('denied'); } } }));
  await copy.click(); const manual = page.locator('[data-notebook-markdown="cap.html"]'), before = await manual.inputValue();
  await manual.evaluate(el => el.setSelectionRange(2, 12, 'backward'));
  await seed(b, book([item('cap.html', 'Nota original'), item('forest.html', 'Cambio 2')]));
  await page.waitForFunction(() => document.querySelector('[data-notebook-note="forest.html"]').value === 'Cambio 2');
  assert.equal(await manual.isVisible(), true); assert.equal(await manual.inputValue(), before);
  assert.deepEqual(await manual.evaluate(el => [el === document.activeElement, el.selectionStart, el.selectionEnd, el.selectionDirection]), [true, 2, 12, 'backward']);
 });
 await check('delayed clipboard denial still exposes its snapshot after a cross-tab update', async () => {
  const { context, page } = await setup(), b = await other(context, '404.html');
  await note(page).fill('Texto elegido antes del permiso');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => new Promise((resolve, reject) => { window.pendingCopy = { text, resolve, reject }; }) } }));
  await page.locator('[data-notebook-copy="cap.html"]').click();
  const snapshot = await page.evaluate(() => window.pendingCopy.text);
  await seed(b, book([item('cap.html', 'Nota original'), item('forest.html', 'Actualización mientras se pide permiso')]));
  await page.waitForFunction(() => document.querySelector('[data-notebook-note="forest.html"]').value.includes('permiso'));
  await note(page).fill('Borrador posterior que no se ha copiado');
  await page.evaluate(() => window.pendingCopy.reject(Error('Permission denied')));
  await page.waitForFunction(() => document.querySelector('[data-notebook-status]').textContent.includes('Markdown está seleccionado'));
  const manual = page.locator('[data-notebook-markdown="cap.html"]');
  assert.equal(await manual.isVisible(), true, 'A pending browser permission must not target a detached fallback');
  assert.equal(await manual.inputValue(), snapshot);
  assert.deepEqual(await manual.evaluate(el => [el === document.activeElement, el.selectionStart, el.selectionEnd]), [true, 0, snapshot.length]);
  assert.equal(await note(page).inputValue(), 'Borrador posterior que no se ha copiado');
 });
 await check('older clipboard failures cannot replace a more recent copy or revive a cleared notebook', async () => {
  const { page } = await setup();
  await page.evaluate(() => { window.pendingCopies = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => new Promise((resolve, reject) => { window.pendingCopies.push({ text, resolve, reject }); }) } }); });
  await note(page).fill('Primera selección'); await page.locator('[data-notebook-copy="cap.html"]').click();
  await note(page).fill('Segunda selección'); await page.locator('[data-notebook-copy="cap.html"]').click();
  await page.evaluate(() => window.pendingCopies[1].reject(Error('denied')));
  const manual = page.locator('[data-notebook-markdown="cap.html"]'); await manual.waitFor({ state: 'visible' });
  const latest = await manual.inputValue(); assert.match(latest, /Segunda selección/);
  await page.evaluate(async () => { window.pendingCopies[0].reject(Error('denied')); await Promise.resolve(); });
  assert.equal(await manual.inputValue(), latest, 'A stale permission result cannot replace the newer snapshot');
  await page.locator('[data-notebook-copy="cap.html"]').click();
  await page.locator('[data-notebook-clear]').click(); await page.locator('[data-notebook-clear-yes]').click();
  await page.waitForFunction(() => localStorage.getItem('iphobiuss:notebook:v1') === null);
  await page.evaluate(async () => { window.pendingCopies[2].reject(Error('denied')); await Promise.resolve(); });
  assert.equal(await page.locator('[data-notebook-markdown]').count(), 0);
  assert.match(await status(page), /Cuaderno eliminado/);
 });
 await check('invalid control characters never poison saved notes or unrelated entries', async () => {
  const { page } = await setup(), original = await raw(page); await note(page).fill('Pegado\u000bcon control'); await save(page);
  await page.waitForFunction(() => document.querySelector('[data-notebook-status]').textContent.includes('entrada inválida'));
  assert.equal(await raw(page), original); assert.equal(await note(page).inputValue(), 'Pegado\u000bcon control'); assert.equal(await note(page, 'forest.html').inputValue(), 'Nota Forest');
  await page.reload(); await ready(page); assert.equal(await note(page).inputValue(), 'Nota original'); assert.equal(await note(page, 'forest.html').inputValue(), 'Nota Forest');
 });
 await check('malformed original is exported exactly and reviewed recovery never overwrites it', async () => {
  const damaged = JSON.stringify(book([item('cap.html', 'Roto\u000bpero conservado'), item('forest.html', 'Válido 🐕')]), null, 2), { page } = await setup(damaged);
  assert.equal(await note(page).count(), 0); assert.ok(await page.locator('[data-notebook-recovery]').isVisible());
  assert.deepEqual(await exported(page, '[data-notebook-export="json"]'), { bytes: damaged, filename: 'iphobiuss-cuaderno-original.json' });
  assert.equal((await exported(page, '[data-notebook-recovery-raw]')).bytes, damaged);
  await page.locator('[data-notebook-recovery-review]').click(); assert.match(await page.locator('[data-notebook-recovery-summary]').innerText(), /1 favoritos.*1 entradas excluidas/);
  const recovered = JSON.parse((await exported(page, '[data-notebook-recovery-clean]')).bytes); assert.deepEqual(recovered, book([item('forest.html', 'Válido 🐕')])); assert.equal(await raw(page), damaged);
  await page.locator('[data-notebook-clear]').click(); await page.locator('[data-notebook-clear-yes]').click(); await page.waitForFunction(() => localStorage.getItem('iphobiuss:notebook:v1') === null);
  await review(page, recovered); await page.locator('[data-notebook-import-apply]').click(); await page.waitForFunction(() => document.querySelectorAll('[data-notebook-note]').length === 1); assert.deepEqual(await stored(page), recovered);
 });
 await check('invalid JSON and unknown schemas can be downloaded but are not guessed or replaced', async () => {
  for (const damaged of ['{"version":1,"items":[', JSON.stringify({ version: 2, items: [item()], reading: [] })]) {
   const { page } = await setup(damaged); assert.equal((await exported(page, '[data-notebook-recovery-raw]')).bytes, damaged); await page.locator('[data-notebook-recovery-review]').click(); assert.equal(await page.locator('[data-notebook-recovery-clean]').count(), 0); assert.equal(await raw(page), damaged);
  }
 });
 await check('removal in another tab preserves, downloads and explicitly restores unsaved draft', async () => {
  const { context, page } = await setup(), draft = 'Borrador valioso\nAún sin guardar 🐕'; await note(page).fill(draft);
  const b = await other(context, 'cap.html'); await b.locator('[data-bookmark="cap.html"]').click(); await page.waitForSelector('[data-notebook-orphan="cap.html"]');
  assert.equal(await note(page).count(), 0); assert.equal(await page.locator('[data-notebook-orphan]').inputValue(), draft); assert.equal((await stored(page)).items.length, 1);
  const copy = JSON.parse((await exported(page, '[data-notebook-orphan-download]')).bytes); assert.equal(copy.items[0].note, draft);
  await page.locator('[data-notebook-restore]').click(); await page.waitForSelector('[data-notebook-note="cap.html"]'); assert.equal(await note(page).inputValue(), draft); assert.equal((await stored(page)).items.find(i => i.url === 'cap.html').note, 'Nota original');
  await save(page); await page.waitForFunction(() => JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).items.find(i => i.url === 'cap.html').note.startsWith('Borrador valioso'));
  assert.equal(await page.locator('[data-notebook-orphans]').count(), 0);
 });
 await check('re-added favorite does not silently adopt an orphan draft and requires conflict review', async () => {
  const { context, page } = await setup(); await note(page).fill('Borrador A'); const b = await other(context, '404.html'); await seed(b, book([item('forest.html', 'Nota Forest')])); await page.waitForSelector('[data-notebook-orphan]');
  await seed(b, book([item('cap.html', 'Nueva nota externa'), item('forest.html', 'Nota Forest')])); await page.waitForSelector('[data-notebook-note="cap.html"]'); assert.equal(await note(page).inputValue(), 'Nueva nota externa');
  await page.locator('[data-notebook-restore]').click(); await page.waitForSelector('[data-notebook-conflict]'); assert.equal(await note(page).inputValue(), 'Borrador A'); assert.equal(await page.locator('[data-notebook-conflict]').inputValue(), 'Nueva nota externa'); assert.equal((await stored(page)).items[0].note, 'Nueva nota externa');
  await save(page); await page.waitForFunction(() => JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).items[0].note === 'Borrador A');
 });
 await check('simultaneous notes require explicit review and reject a newer update while save waits', async () => {
  const { context, page } = await setup(); await note(page).fill('Mi borrador'); const b = await other(context); await note(b).fill('Versión B'); await save(b); await page.waitForSelector('[data-notebook-conflict]');
  assert.equal(await note(page).inputValue(), 'Mi borrador'); assert.equal(await page.locator('[data-notebook-conflict]').inputValue(), 'Versión B');
  const locker = await hold(context); await save(page); await seed(b, book([item('cap.html', 'Versión C'), item('forest.html', 'Nota Forest')])); await locker.evaluate(() => window.releaseLock());
  await page.waitForFunction(() => document.querySelector('[data-notebook-status]').textContent.includes('Revisa ambas versiones'));
  assert.equal((await stored(page)).items[0].note, 'Versión C'); assert.equal(await note(page).inputValue(), 'Mi borrador'); assert.equal(await page.locator('[data-notebook-conflict]').inputValue(), 'Versión C');
 });
 await check('stale tab saves preserve new favorites even when storage events are delayed', async () => {
  const { context, page } = await setup(book([item('cap.html', 'Anterior')]), () => window.addEventListener('storage', event => event.stopImmediatePropagation()));
  const b = await other(context, 'forest.html'); await b.locator('[data-bookmark="forest.html"]').click(); await b.waitForFunction(() => JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).items.length === 2);
  assert.equal(await note(page, 'forest.html').count(), 0); await note(page).fill('Editada'); await save(page); await page.waitForFunction(() => JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).items[0].note === 'Editada'); assert.equal((await stored(page)).items.length, 2);
 });
 await check('simultaneous bookmark additions share one storage lock and both survive', async () => {
  const { context, page } = await setup(book()); await page.goto(base + '/cap.html'); const b = await other(context, 'forest.html'), locker = await hold(context);
  await Promise.all([page.locator('[data-bookmark="cap.html"]').click(), b.locator('[data-bookmark="forest.html"]').click()]); await locker.evaluate(() => window.releaseLock());
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).items.length === 2); assert.deepEqual((await stored(page)).items.map(i => i.url).sort(), ['cap.html', 'forest.html']);
 });
 await check('reading progress rereads storage instead of deleting newer bookmarks', async () => {
  const { context, page } = await setup(book(), () => window.addEventListener('storage', event => event.stopImmediatePropagation())); await page.goto(base + '/cap.html'); const b = await other(context, '404.html'); await seed(b, book([item('forest.html', 'Nueva') ]));
  await page.evaluate(() => { document.querySelector('.article-content section[id]').scrollIntoView(); window.dispatchEvent(new Event('scroll')); });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).reading.length === 1); assert.equal((await stored(page)).items[0].note, 'Nueva');
 });
 await check('queued old storage events and sessionStorage changes cannot roll back the notebook', async () => {
  const { page } = await setup(); await page.evaluate(({ key, newer, older }) => { localStorage.setItem(key, JSON.stringify(newer)); dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage, newValue: JSON.stringify(older) })); dispatchEvent(new StorageEvent('storage', { key, storageArea: sessionStorage, newValue: null })); }, { key, newer: book([item('cap.html', 'Nueva')]), older: book() });
  assert.equal(await note(page).inputValue(), 'Nueva'); assert.equal((await stored(page)).items[0].note, 'Nueva');
 });
 await check('quota failure retains current data and later external updates do not discard it', async () => {
  const { context, page } = await setup(); await page.evaluate(key => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('full', 'QuotaExceededError'); return original.call(this, k, v); }; }, key);
  await note(page).fill('Solo memoria'); await save(page); await page.waitForFunction(() => document.querySelector('[data-notebook-status]').textContent.includes('solo durará'));
  assert.equal((await stored(page)).items[0].note, 'Nota original'); const b = await other(context, '404.html'); await seed(b, book([item('cap.html', 'Cambio externo')])); await page.waitForFunction(() => document.querySelector('[data-notebook-status]').textContent.includes('cuaderno temporal'));
  assert.equal(await note(page).inputValue(), 'Solo memoria'); assert.equal(JSON.parse((await exported(page, '[data-notebook-export="json"]')).bytes).items[0].note, 'Solo memoria');
 });
 await check('invalid external update keeps live notes and offers both original and session exports', async () => {
  const { context, page } = await setup(), b = await other(context, '404.html'), damaged = '{invalid'; await seed(b, damaged); await page.waitForSelector('[data-notebook-recovery]');
  assert.equal(await note(page).inputValue(), 'Nota original'); assert.equal((await exported(page, '[data-notebook-export="json"]')).bytes, damaged); assert.equal(JSON.parse((await exported(page, '[data-notebook-recovery-session]')).bytes).items[0].note, 'Nota original'); assert.equal(await raw(page), damaged);
 });
 await check('denied storage and absent write-lock support honestly keep local session only', async () => {
  for (const mode of ['denied', 'locks', 'locks-denied']) {
   const { page } = await setup(null, mode === 'denied' ? () => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }) : mode === 'locks' ? () => Object.defineProperty(navigator, 'locks', { value: undefined }) : () => Object.defineProperty(navigator, 'locks', { value: { request: async () => { throw new DOMException('denied', 'SecurityError'); } } }));
   await page.goto(base + '/cap.html'); await page.locator('[data-bookmark="cap.html"]').click(); await page.waitForFunction(() => document.querySelector('[data-bookmark="cap.html"]').getAttribute('aria-pressed') === 'true'); assert.match(await status(page), /solo durará/); if (mode !== 'denied') assert.equal(await raw(page), null);
  }
 });
 await check('cancelled import waiting for a storage lock never commits', async () => {
  const { context, page } = await setup(), original = await raw(page); await review(page, book([item('knife.html', 'No importar')])); const locker = await hold(context); await page.locator('[data-notebook-import-apply]').click(); await page.locator('[data-notebook-import-cancel]').click(); await locker.evaluate(() => window.releaseLock());
  // Acquiring the same lock establishes that the cancelled callback has finished.
  await locker.evaluate(key => navigator.locks.request(key, () => {}), key); assert.equal(await raw(page), original); assert.equal(await note(page, 'knife.html').count(), 0);
 });
 await check('cancelled deletion waiting for a storage lock leaves the notebook intact', async () => {
  const { context, page } = await setup(), original = await raw(page), locker = await hold(context); await page.locator('[data-notebook-clear]').click(); await page.locator('[data-notebook-clear-yes]').click(); await page.locator('[data-notebook-clear-cancel]').click(); await locker.evaluate(() => window.releaseLock()); await locker.evaluate(key => navigator.locks.request(key, () => {}), key); assert.equal(await raw(page), original); assert.equal(await note(page).inputValue(), 'Nota original');
 });
 await check('failed import keeps its reviewed file and can be retried after quota clears', async () => {
  const { page } = await setup(), original = await raw(page); await review(page, book([item('knife.html', 'Importar tras reintento')]));
  await page.evaluate(key => { const original = Storage.prototype.setItem; let fail = true; Storage.prototype.setItem = function(k, v) { if (k === key && fail) { fail = false; throw new DOMException('full', 'QuotaExceededError'); } return original.call(this, k, v); }; }, key);
  await page.locator('[data-notebook-import-apply]').click(); await page.waitForFunction(() => document.querySelector('[data-notebook-import-preview]').textContent.includes('almacenamiento está lleno')); assert.equal(await raw(page), original); assert.ok(await page.locator('[data-notebook-import-apply]').isEnabled());
  await page.locator('[data-notebook-import-apply]').click(); await page.waitForSelector('[data-notebook-note="knife.html"]'); assert.equal((await stored(page)).items.length, 3);
 });
 await check('changed invalid storage between import review and apply remains untouched', async () => {
  const { page } = await setup(); await review(page, book([item('knife.html')])); const damaged = JSON.stringify({ version: 99 }); await seed(page, damaged); await page.locator('[data-notebook-import-apply]').click();
  await page.waitForFunction(() => document.querySelector('[data-notebook-import-preview]').textContent.includes('original local')); assert.equal(await raw(page), damaged); assert.equal(await note(page, 'knife.html').count(), 0); assert.ok(await page.locator('[data-notebook-recovery]').isVisible());
 });
 await check('invalid imported URLs, controls and duplicate identities reject the entire import', async () => {
  const { page } = await setup(), original = await raw(page); await page.locator('[data-notebook-import]').click();
  const bad = [book([item('../cap.html')]), book([item('cap.html#%0Bbad')]), book([item('cap.html', '\u000b')]), book([item('cap.html'), item('cap.html')]), book([], [item('cap.html#one'), item('cap.html#two')])];
  for (const value of bad) { await page.locator('[data-notebook-import-file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }); await page.waitForFunction(() => /entrada inválida|repetidos/.test(document.querySelector('[data-notebook-import-preview]').textContent)); assert.ok(await page.locator('[data-notebook-import-apply]').isDisabled()); assert.equal(await raw(page), original); }
 });
 await check('explicit notebook deletion also clears orphan drafts from this tab', async () => {
  const { context, page } = await setup(); await note(page).fill('Borrador'); const b = await other(context, '404.html'); await seed(b, book()); await page.waitForSelector('[data-notebook-orphan]'); await page.locator('[data-notebook-clear]').click(); await page.locator('[data-notebook-clear-yes]').click(); await page.waitForFunction(() => !document.querySelector('[data-notebook-orphans]')); assert.equal(await raw(page), null); assert.equal(await note(page).count(), 0);
 });
 await check('recovery and conflict controls remain accessible at 320px and 200 percent text', async () => {
  const incomplete = [];
  for (const theme of ['dark', 'paper']) {
   const { context, page } = await setup(); await page.setViewportSize({ width: 320, height: 960 }); await page.evaluate(theme => { if (theme === 'paper') document.documentElement.dataset.theme = 'paper'; else delete document.documentElement.dataset.theme; }, theme);
   await note(page).fill('Borrador conservado'); const b = await other(context, '404.html'); await seed(b, book([item('cap.html', 'Cambio para comparar')])); await page.waitForSelector('[data-notebook-conflict]'); await seed(b, book()); await page.waitForSelector('[data-notebook-orphan]'); await seed(b, JSON.stringify(book([item('forest.html', 'Válido'), item('knife.html', 'Inválido\u000b')]))); await page.waitForSelector('[data-notebook-recovery]'); await page.locator('[data-notebook-recovery-review]').click();
   assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'paper' ? 'paper' : null);
   const doubled = await page.evaluate(() => { const nodes = [document.documentElement, document.body, ...document.body.querySelectorAll('*')].filter(node => node instanceof HTMLElement && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)), sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize)); nodes.forEach((node, index) => node.style.setProperty('font-size', sizes[index] * 2 + 'px', 'important')); return nodes.every((node, index) => Math.abs(parseFloat(getComputedStyle(node).fontSize) - sizes[index] * 2) < .02); }); assert.equal(doubled, true);
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); await page.evaluate(axeSource); const result = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })); assert.deepEqual(result.violations, []); incomplete.push({ theme, rules: result.incomplete.map(row => row.id) });
   const skipState = await page.evaluate(() => { document.activeElement?.blur(); const el = document.querySelector('.skip'), rect = el.getBoundingClientRect(); return { active: document.activeElement.tagName, transform: getComputedStyle(el).transform, y: rect.y, height: rect.height }; }); incomplete[incomplete.length - 1].skipState = skipState; fs.mkdirSync(path.dirname(output), { recursive: true }); await page.locator('[data-notebook-recovery]').evaluate(el => { const header = document.querySelector('.site-header').getBoundingClientRect(); scrollTo(0, el.getBoundingClientRect().top + scrollY - header.height - 16); }); await page.screenshot({ path: path.join(path.dirname(output), 'notebook-recovery-' + theme + '-320-200.png') }); await page.locator('[data-notebook-orphans]').evaluate(el => { const header = document.querySelector('.site-header').getBoundingClientRect(); scrollTo(0, el.getBoundingClientRect().top + scrollY - header.height - 16); }); await page.screenshot({ path: path.join(path.dirname(output), 'notebook-orphans-' + theme + '-320-200.png') });
  }
  return { incomplete, browser: browser.version(), notes: 'Automated axe incomplete results are retained, not counted as passes.' };
 });
 assert.deepEqual(errors, []);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { for (const context of contexts.splice(0)) await context.close(); await browser?.close(); server.close(); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({ checks, passed: checks.filter(row => row.passed).length, failed: checks.filter(row => !row.passed).length, errors }, null, 2) + '\n'); });
