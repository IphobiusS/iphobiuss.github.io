/* Home terminal: native routes, optional session, keyboard targets and readable reflow. */
'use strict';
const { openAppearance, openLibrary, openTerminal } = require('./qa-interactions.cjs');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { chromium } = require(process.env.SITE_PLAYWRIGHT_MODULE || process.env.REPORT_GEN_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.SITE_HOME_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_HOME_OUTPUT || path.join(__dirname, 'site-home-actions-136-results.json'));
const { axeSource } = require('./qa-deps.cjs');
const hashFiles = () => Object.fromEntries(fs.readdirSync(root, { recursive: true }).filter(file => fs.statSync(path.join(root, file)).isFile()).sort().map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
const before = hashFiles(), checks = []; let browser;
const heroLinks = '.welcome-actions a,.welcome-links a,.terminal-directory a,[data-open-session]';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => { const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested)); if (!file.startsWith(root + path.sep)) return res.writeHead(403).end(); fs.readFile(file, (error, data) => { if (error) return res.writeHead(404).end(); res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(data); }); });
const check = async (name, action) => { console.log(name); try { const detail = await action(); checks.push({ name, passed: true, ...(detail || {}) }); } catch (error) { checks.push({ name, passed: false, error: error.message }); throw error; } };
const ready = async page => { await page.evaluate(() => document.fonts.ready); const skip = page.locator('[data-intro][open] [data-intro-skip]'); if (await skip.count()) await skip.click(); };
const expectActions = async page => {
 assert.deepEqual(await page.locator('.welcome-actions .button').evaluateAll(nodes => nodes.map(node => [node.textContent.trim(), node.getAttribute('href')])), [['Ver proyectos', 'proyectos.html#report-gen'], ['Ver casos', '#casos']]);
 const secondary = page.locator('.welcome-links a'); assert.equal(await secondary.count(), 2);
 assert.deepEqual(await secondary.evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), ['#contacto', 'recorrido.html']);
 const external = page.locator('.home-contact a[href*="linkedin.com"]');
 assert.equal(await external.getAttribute('target'), '_blank'); assert.match(await external.getAttribute('rel'), /\bnoopener\b/);
 assert.match(await external.textContent(), /abre otra pestaña/);
 assert.deepEqual(await page.locator('.home-presentation>.shell').evaluateAll(nodes => nodes.map(node => node.className)), ['welcome shell','shell home-featured','shell casos','shell home-certifications','shell lab','shell home-contact']);
 assert.equal(await page.locator('.session-shell').getAttribute('open'), null);
 assert.equal(await page.locator('[data-library]').getAttribute('open'), null);
 assert.equal(await page.locator('[data-intro][open]').count(), 0);
 assert.equal(await page.locator('.welcome-links .button').count(), 0);
 const hero = page.locator('[data-hero-terminal]');
 assert.ok(await hero.isVisible(), 'terminal is visible from initial render');
 assert.equal(await hero.locator('h1').count(), 1);
 assert.equal(await hero.evaluate(node => !!node.closest('details')), false, 'hero is not a disclosure');
 assert.deepEqual(await hero.locator('.terminal-directory a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), ['guias.html', 'tecnicas.html', 'herramientas.html']);
 assert.equal(await hero.locator('[data-open-session]').getAttribute('href'), '#terminal-lab');
 assert.equal(await page.locator('[data-intro][open]').count(), 0, 'intro is closed before using the page');
 assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page overflow');
 const bounds = await page.locator(heroLinks).evaluateAll(nodes => nodes.map(node => {
  const rect = node.getBoundingClientRect(), style = getComputedStyle(node), ranges = [];
  const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); while (walk.nextNode()) { const text = walk.currentNode; if (!text.textContent.trim() || text.parentElement.closest('.sr-only')) continue; const range = document.createRange(); range.selectNodeContents(text); ranges.push(...range.getClientRects()); }
  return { label: node.innerText, x: rect.x, width: rect.width, height: rect.height, clipped: ranges.some(box => box.left < rect.left - 1 || box.right > rect.right + 1 || box.top < rect.top - 1 || box.bottom > rect.bottom + 1), underline: style.textDecorationLine };
 }));
 for (const item of bounds) { assert.ok(item.height >= 44, item.label + ': small target'); assert.ok(!item.clipped, item.label + ': text clipped'); assert.ok(item.x >= -1 && item.x + item.width <= (await page.evaluate(() => innerWidth)) + 1, item.label + ': outside viewport'); }
 for (const item of bounds.slice(2, 4)) assert.match(item.underline, /underline/);
 return bounds;
};
const axe = async page => { await page.evaluate(axeSource); const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then(result => ({ violations: result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })) }))); assert.deepEqual(result.violations, []); return { executed: true, ...result }; };
const write = fatal => { fs.mkdirSync(path.dirname(output), { recursive: true }); const after = hashFiles(); fs.writeFileSync(output, JSON.stringify({ summary: { total: checks.length, passed: checks.filter(row => row.passed).length, axeExecuted: !!axeSource, browser: browser?.version() }, checks, sourcesBefore: before, sourcesAfter: after, sourcesUnchanged: JSON.stringify(before) === JSON.stringify(after), ...(fatal ? { fatal: fatal.stack } : {}) }, null, 2) + '\n'); };
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port;
 browser = await chromium.launch({ executablePath: process.env.SITE_CHROMIUM || process.env.REPORT_GEN_CHROMIUM || process.env.RG_CHROMIUM_EXECUTABLE, headless: true, args: ['--no-sandbox'] });
 try {
  for (const theme of ['dark', 'paper', 'retro']) for (const width of [320, 390, 768, 1440]) for (const textScale of [100, 200]) await check(`home actions reflow, keyboard order and axe ${theme}/${width}/${textScale}`, async () => {
   const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }); context.setDefaultTimeout(10000);
   await context.addInitScript(theme => { sessionStorage.setItem('iphobiuss:intro', '1'); if (theme === 'paper') localStorage.setItem('iphobiuss:theme', 'paper'); if (theme === 'retro') localStorage.setItem('iphobiuss:retro', 'on'); }, theme);
   const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); await page.goto(base + '/index.html');
   if (textScale === 200) await page.addStyleTag({ content: 'html{font-size:200%!important}' }); await ready(page); const bounds = await expectActions(page);
   const links = page.locator(heroLinks); assert.equal(await links.count(), 8); await links.first().focus();
   for (let index = 0; index < 8; index++) { assert.ok(await links.nth(index).evaluate(node => node === document.activeElement), 'keyboard order ' + index); assert.ok(await links.nth(index).evaluate(node => node.matches(':focus-visible')), 'visible keyboard focus ' + index); assert.ok(await links.nth(index).evaluate(node => { const r = node.getBoundingClientRect(), header = document.querySelector('.site-header')?.getBoundingClientRect(); return r.top >= (header?.bottom || 0) - 1 && r.bottom <= innerHeight + 1; }), 'focused target remains fully visible ' + index); if (index < 7) await page.keyboard.press('Tab'); }
   // Tab to the footer may leave an unfocused 48 px action partly beyond the viewport.
   // Measure the full document from a stable scroll position; no nodes or axe rules are excluded.
   await page.evaluate(() => { scrollTo(0, 0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
   const accessibility = await axe(page); assert.deepEqual(errors, []);
   let screenshot;
   if (process.env.SITE_HOME_SCREENSHOTS && (([390, 1440].includes(width) && textScale === 100) || (width === 320 && textScale === 200))) { fs.mkdirSync(process.env.SITE_HOME_SCREENSHOTS, { recursive: true }); screenshot = path.join(process.env.SITE_HOME_SCREENSHOTS, `home-actions-${theme}-${width}-${textScale}.png`); await page.locator('[data-hero-terminal]').screenshot({ path: screenshot }); }
   await context.close(); return { bounds, axe: accessibility, ...(screenshot ? { screenshot } : {}) };
  });
  for (const mode of ['normal', 'no-js', 'site-blocked', 'storage-denied']) await check('home destinations and terminal remain native and usable: ' + mode, async () => {
   const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce', javaScriptEnabled: mode !== 'no-js' }); context.setDefaultTimeout(10000);
   if (mode === 'storage-denied') await context.addInitScript(() => { for (const method of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, method, { value() { throw new DOMException('Storage access denied', 'SecurityError'); } }); });
   else if (mode !== 'no-js') await context.addInitScript(() => sessionStorage.setItem('iphobiuss:intro', '1'));
   const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); if (mode === 'site-blocked') await page.route('**/assets/js/site.js', route => route.abort());
   for (const target of ['#casos', '#contacto']) { await page.goto(base + '/index.html'); await ready(page); const actual = page.locator(`.welcome-actions a[href="${target}"],.welcome-links a[href="${target}"]`); assert.equal(await actual.count(), 1); await actual.focus(); await page.keyboard.press('Enter'); await page.waitForFunction(hash => location.hash === hash, target); assert.ok(await page.locator(target).isVisible()); }
   await page.goto(base + '/index.html'); await ready(page); await page.locator('.welcome-actions a[href="proyectos.html#report-gen"]').focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/proyectos.html#report-gen'); assert.ok(await page.locator('#report-gen').isVisible());
   await page.goto(base + '/index.html'); await ready(page); await page.locator('.welcome-links a[href="recorrido.html"]').focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/recorrido.html'); assert.equal(await page.locator('h1').innerText(), 'Recorrido breve');
   await page.goto(base + '/index.html'); await ready(page); const contact = page.locator('.home-contact a[href*="linkedin.com"]'), expectedUrl = await contact.getAttribute('href'); await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>External navigation boundary</title>' })); const popupPromise = context.waitForEvent('page'); await contact.focus(); await page.keyboard.press('Enter'); const popup = await popupPromise; await popup.waitForURL(expectedUrl); assert.equal(await popup.evaluate(() => opener === null), true); assert.equal(new URL(page.url()).pathname, '/index.html'); await popup.close();
   for (const target of ['guias.html', 'tecnicas.html', 'herramientas.html']) { await page.goto(base + '/index.html'); await ready(page); const route = page.locator(`.terminal-directory a[href="${target}"]`); await route.focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/' + target); assert.equal(await page.locator('h1').count(), 1); }
   await page.goto(base + '/index.html'); await ready(page);
   const sessionLink = page.locator('[data-open-session]'), disclosure = page.locator('#terminal-lab'), summary = disclosure.locator(':scope>summary');
   await sessionLink.focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => location.hash === '#terminal-lab');
   if (mode === 'no-js' || mode === 'site-blocked') { await summary.focus(); if (await disclosure.getAttribute('open') === null) await page.keyboard.press('Enter'); }
   else { await page.waitForFunction(() => document.querySelector('#terminal-lab').open && document.querySelector('#terminal-lab>summary') === document.activeElement); assert.ok(await summary.evaluate(node => node === document.activeElement), 'session link moves keyboard focus to summary'); }
   assert.ok(await page.locator('[data-session]').isVisible());
   assert.equal(await page.locator('[data-session]').evaluate(node => node.classList.contains('boot')), false, 'navigation never autoplays');
   if (mode === 'normal' || mode === 'storage-denied') {
    assert.ok(await page.locator('[data-session]').evaluate(node => node.classList.contains('done')));
    await summary.focus(); await page.keyboard.press('Enter'); assert.equal(await disclosure.getAttribute('open'), null);
    await sessionLink.focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => document.querySelector('#terminal-lab').open && document.querySelector('#terminal-lab>summary') === document.activeElement); assert.ok(await summary.evaluate(node => node === document.activeElement), 'same-hash link reopens session and restores focus');
    await page.reload(); await ready(page); await page.waitForFunction(() => location.hash === '#terminal-lab' && document.querySelector('#terminal-lab').open && document.querySelector('#terminal-lab>summary') === document.activeElement);
    assert.ok(await page.locator('#terminal-lab>summary').evaluate(node => node === document.activeElement), 'direct fragment arrival gives focus to session summary');
   }
   assert.deepEqual(errors, []); await context.close(); return { destinations: 9, externalRequestStubbed: true, sessionAutoplay: false, storageDenied: mode === 'storage-denied' };
  });
  await check('optional disclosures preserve keyboard, themes, focus and motion preferences', async () => {
   const context = await browser.newContext({ viewport: { width: 390, height: 900 } }); context.setDefaultTimeout(10000);
   const page = await context.newPage(); await page.goto(base + '/index.html'); await ready(page);
   assert.equal(await page.locator('[data-intro][open]').count(), 0);
   await openAppearance(page); await page.keyboard.press('Tab');
   const paper = page.locator('[data-paper-toggle]'), retro = page.locator('[data-retro-toggle]');
   assert.ok(await paper.evaluate(node => node === document.activeElement)); await page.keyboard.press('Space');
   assert.equal(await paper.getAttribute('aria-pressed'), 'true');
   await page.keyboard.press('Tab'); assert.ok(await retro.evaluate(node => node === document.activeElement)); await page.keyboard.press('Enter');
   assert.equal(await retro.getAttribute('aria-pressed'), 'true'); assert.equal(await paper.getAttribute('aria-pressed'), 'false');
   await page.keyboard.press('Escape'); assert.equal(await page.locator('[data-appearance]').getAttribute('open'), null);
   assert.ok(await page.locator('[data-appearance]>summary').evaluate(node => node === document.activeElement));
   await openAppearance(page); await page.mouse.click(8, 100); assert.equal(await page.locator('[data-appearance]').getAttribute('open'), null);
   await openLibrary(page); await page.locator('.tree [data-folder="guias"]').focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => location.hash === '#guias');
   assert.equal(new URL(page.url()).hash, '#guias'); assert.ok(await page.locator('#guias').isVisible());
   await openTerminal(page); await page.waitForFunction(() => document.querySelector('[data-session]').classList.contains('done'));
   assert.equal(await page.locator('[data-session]').evaluate(node => node.classList.contains('boot')), false);
   assert.equal(await page.locator('[data-intro][open]').count(), 0);
   await page.evaluate(() => { window.__heroBeforeReplay = document.querySelector('[data-hero-terminal]').outerHTML; window.__heroReplayMutations = []; window.__heroReplayObserver = new MutationObserver(records => window.__heroReplayMutations.push(...records.map(record => record.type))); window.__heroReplayObserver.observe(document.querySelector('[data-hero-terminal]'), { subtree: true, childList: true, attributes: true, characterData: true }); });
   await page.locator('[data-motion-replay]').focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => document.querySelector('[data-session]').classList.contains('boot'));
   await page.waitForTimeout(250);
   assert.equal(await page.locator('[data-intro][open]').count(), 0);
   assert.equal(await page.locator('[data-motion-stage]').evaluate(node => node.classList.contains('boot')), false, 'replay stays within the optional session');
   assert.deepEqual(await page.evaluate(() => { window.__heroReplayObserver.disconnect(); return { changed: document.querySelector('[data-hero-terminal]').outerHTML !== window.__heroBeforeReplay, mutations: window.__heroReplayMutations }; }), { changed: false, mutations: [] });
   assert.ok(await page.locator('[data-motion-replay]').evaluate(node => node === document.activeElement), 'replay does not steal keyboard focus');
   await page.locator('.session-shell>summary').click(); await page.setViewportSize({ width: 1440, height: 900 });
   assert.equal(await page.locator('.session-shell').getAttribute('open'), null); assert.ok(await page.locator('.session-shell>summary').isVisible());
   await page.emulateMedia({ reducedMotion: 'reduce' }); await openTerminal(page);
   await page.waitForFunction(() => [...document.querySelectorAll('[data-motion-toggle],[data-motion-replay]')].every(node => node.disabled));
   assert.equal(await page.locator('[data-session]').evaluate(node => node.classList.contains('boot')), false);
   await context.close(); return { initialModal: false, sessionAutoplay: false, replayDoesNotMutateHero: true, rememberedTheme: true, foldedAtDesktop: true, reducedMotion: true };
  });
  assert.deepEqual(hashFiles(), before);
 } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
 write(); console.log(JSON.stringify({ total: checks.length, passed: checks.filter(row => row.passed).length, output }));
})().catch(async error => { if (browser) await browser.close().catch(() => {}); server.close(); write(error); console.error(error.stack); process.exitCode = 1; });
