/* S05/S11: documented SVG relations, visible text and optional home-only CRT. */
'use strict';
const { openAppearance } = require('./qa-interactions.cjs');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { chromium } = require(process.env.SITE_PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(__dirname, '..'), root = path.resolve(process.env.SITE_FOCAL_DIST || path.join(project, 'dist'));
const output = path.resolve(process.env.SITE_FOCAL_OUTPUT || path.join(__dirname, 'site-graph-scanlines-134-results.json'));
const graphData = JSON.parse(fs.readFileSync(path.join(project, 'content/attack-graphs.json'), 'utf8'));
const { axeSource } = require('./qa-deps.cjs');
const hashSources = () => Object.fromEntries(fs.readdirSync(root, { recursive: true }).filter(file => fs.statSync(path.join(root, file)).isFile()).sort().map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
const sourcesBefore = hashSources(); const results = []; let browser;
const check = async (name, fn) => { console.log(name); try { const detail = await fn(); results.push({ name, passed: true, ...(detail || {}) }); } catch (error) { results.push({ name, passed: false, error: error.message }); throw error; } };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => { const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname)); if (!file.startsWith(root + path.sep)) return res.writeHead(403).end(); fs.readFile(file, (error, data) => { if (error) res.writeHead(404).end(); else { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(data); } }); });
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const crt = page => page.evaluate(() => { const after = getComputedStyle(document.body, '::after'); return { content: after.content, display: after.display, background: after.backgroundImage, pointerEvents: after.pointerEvents, theme: document.documentElement.dataset.retro }; });
const present = state => state.content !== 'none' && state.content !== 'normal' && state.display !== 'none';
const newContext = async (options = {}) => {
 const { theme = 'dark', paused = false, ...contextOptions } = options;
 const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, ...contextOptions }); context.setDefaultTimeout(10000);
 if (contextOptions.javaScriptEnabled !== false) await context.addInitScript(({ theme, paused }) => { localStorage.setItem('iphobiuss:intro', 'seen'); if (theme === 'retro') localStorage.setItem('iphobiuss:retro', 'on'); if (theme === 'paper') localStorage.setItem('iphobiuss:theme', 'paper'); if (paused) localStorage.setItem('iphobiuss:motion', 'paused'); }, { theme, paused });
 return context;
};
const verifyGraph = async (page, guide) => {
 const graph = graphData[guide], holder = page.locator(`[data-case-graph="${guide}"]`);
 assert.equal(await holder.count(), 1); assert.ok(await holder.isVisible());
 const nodeIds = graph.nodes.map(node => node.id);
 assert.deepEqual(await holder.locator('[data-graph-step]').evaluateAll(els => els.map(el => el.dataset.graphStep)), nodeIds);
 for (const variant of ['wide', 'narrow']) {
  const svg = holder.locator('.graph-' + variant); assert.equal(await svg.getAttribute('aria-hidden'), 'true'); assert.equal(await svg.getAttribute('focusable'), 'false');
  assert.deepEqual(await svg.locator('[data-graph-node]').evaluateAll(els => els.map(el => el.dataset.graphNode)), nodeIds);
  assert.deepEqual(await svg.locator('[data-graph-edge]').evaluateAll(els => els.map(el => ({ from: el.dataset.from, to: el.dataset.to, label: el.dataset.graphEdge }))), graph.edges);
 }
 for (const step of await holder.locator('[data-graph-step]').all()) assert.ok(await step.isVisible());
 assert.equal(await holder.locator('.graph-relation').count(), graph.edges.length);
 for (const [index, edge] of graph.edges.entries()) { const relation = await holder.locator('.graph-relation').nth(index).innerText(); assert.ok(relation.includes(edge.label)); assert.ok(relation.includes(`paso ${String(index + 1).padStart(2, '0')} al ${String(index + 2).padStart(2, '0')}`)); }
 assert.equal(await holder.locator('.graph-source-links a').count(), graph.nodes.reduce((sum, node) => sum + node.evidence.length, 0));
 for (const link of await holder.locator('.graph-source-links a').all()) { const href = await link.getAttribute('href'); const url = new URL(href, 'http://localhost/'); assert.equal(url.pathname, '/' + guide + '.html'); const html = fs.readFileSync(path.join(root, guide + '.html'), 'utf8'); assert.ok(html.includes(`id="${url.hash.slice(1)}"`)); }
 const text = await holder.innerText(); assert.ok(text.includes(graph.scope)); assert.ok(text.includes(graph.limit)); if (guide === 'forest') { assert.ok(text.includes('DCSync no equivale a pertenecer a Domain Admins')); assert.ok(text.includes('membresía anidada, no un permiso directo')); }
 const repeated = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(el => el.id); return ids.filter((id, i) => ids.indexOf(id) !== i); }); assert.deepEqual(repeated, []);
};
const writeResults = fatal => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({ summary: { total: results.length, passed: results.filter(row => row.passed).length, axeExecuted: !!axeSource }, checks: results, sourcesBefore, sourcesAfter: hashSources(), ...(fatal ? { fatal: fatal.stack } : {}) }, null, 2) + '\n'); };
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port;
 browser = await chromium.launch({ executablePath: process.env.SITE_CHROMIUM, headless: true, args: ['--no-sandbox'] });
 try {
  for (const paused of [false, true]) for (const reducedMotion of ['no-preference', 'reduce']) await check(`CRT scope and preference ${paused ? 'paused' : 'running'}/${reducedMotion}`, async () => {
   const context = await newContext({ theme: 'retro', paused, reducedMotion }), page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
   for (const route of ['index.html', 'cap-caso.html', 'forest-caso.html', 'cap.html', 'forest.html', 'tecnicas.html']) {
    await page.goto(base + '/' + route); await frames(page); const state = await crt(page); assert.equal(state.theme, 'on');
    assert.equal(present(state), route === 'index.html' && !paused && reducedMotion === 'no-preference', route + ' unexpected CRT'); if (present(state)) { assert.equal(state.pointerEvents, 'none'); assert.match(state.background, /repeating-linear-gradient/); }
   }
   assert.deepEqual(errors, []); await context.close();
  });
  await check('keyboard appearance, motion, persistence and honest scope feedback', async () => {
   const context = await newContext(), page = await context.newPage(); await page.goto(base + '/index.html');
   const skip = page.locator('[data-intro][open] [data-intro-skip]'); if (await skip.count()) await skip.click();
   await openAppearance(page); const retro = page.locator('.header-tools [data-retro-toggle]'); await retro.focus(); await page.keyboard.press('Enter'); await frames(page); assert.equal(present(await crt(page)), true); assert.match(await page.locator('#action-status').innerText(), /solo en portada/);
   const motion = page.locator('.header-tools [data-motion-toggle]'); await motion.focus(); await page.keyboard.press('Space'); await frames(page); assert.equal(present(await crt(page)), false); assert.equal(await page.locator('html').getAttribute('data-paused'), '');
   await page.reload(); await frames(page); assert.equal(present(await crt(page)), false); assert.equal(await retro.getAttribute('aria-pressed'), 'true');
   await page.goto(base + '/cap-caso.html'); await openAppearance(page); const paper = page.locator('.header-tools [data-paper-toggle]'); await paper.focus(); await page.keyboard.press('Enter'); assert.equal(await paper.getAttribute('aria-pressed'), 'true');
   const readRetro = page.locator('.header-tools [data-retro-toggle]'); await readRetro.focus(); await page.keyboard.press('Enter'); assert.equal(await paper.getAttribute('aria-pressed'), 'false'); assert.equal(present(await crt(page)), false); assert.match(await page.locator('#action-status').innerText(), /Esta lectura no tiene líneas CRT/);
   await page.locator('.graph-source-links a').first().focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/cap.html#idor'); assert.equal(new URL(page.url()).pathname, '/cap.html'); assert.equal(new URL(page.url()).hash, '#idor'); await context.close();
  });
  for (const theme of ['dark', 'paper', 'retro']) for (const width of [320, 390, 1366]) for (const textScale of [100, 200]) for (const guide of ['cap', 'forest']) await check(`graph semantics + reflow + axe ${guide}/${theme}/${width}/${textScale}`, async () => {
   const context = await newContext({ theme, reducedMotion: 'reduce', viewport: { width, height: 900 } }), page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
   await page.goto(base + '/' + guide + '-caso.html'); if (textScale === 200) await page.evaluate(() => { const sheet = new CSSStyleSheet(); sheet.replaceSync('html{font-size:200%!important}'); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; }); await page.evaluate(() => document.fonts.ready); await frames(page); await verifyGraph(page, guide);
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow'); assert.equal(present(await crt(page)), false);
   const holder = page.locator('[data-case-graph]'); assert.equal(await holder.locator(width <= 700 ? '.graph-narrow' : '.graph-wide').isVisible(), true); assert.equal(await holder.locator(width <= 700 ? '.graph-wide' : '.graph-narrow').isVisible(), false);
   const diagram = await holder.locator(width <= 700 ? '.graph-narrow' : '.graph-wide').boundingBox(); assert.ok(diagram.width > 150 && diagram.height > 50);
   const labelGeometry = await holder.locator(width <= 700 ? '.graph-narrow' : '.graph-wide').evaluate(svg => [...svg.querySelectorAll('[data-graph-node]')].map(node => {
    const key = node.querySelector('.graph-node-key').getBBox(), rect = node.querySelector('rect').getBBox();
    const labels = [...node.querySelectorAll('.graph-node-label tspan')].map(label => { const box = label.getBBox(); return { text: label.textContent, verticalGap: box.y - key.y - key.height, contained: box.x >= rect.x && box.y >= rect.y && box.x + box.width <= rect.x + rect.width && box.y + box.height <= rect.y + rect.height }; });
    return { node: node.dataset.graphNode, keyContained: key.x >= rect.x && key.y >= rect.y && key.x + key.width <= rect.x + rect.width && key.y + key.height <= rect.y + rect.height, labels };
   }));
   for (const geometry of labelGeometry) { assert.ok(geometry.keyContained, geometry.node + ' number outside its box'); for (const label of geometry.labels) { assert.ok(label.contained, geometry.node + ' text outside its box'); assert.ok(label.verticalGap >= 2, geometry.node + ' number and label need a distinct row'); } }
   for (const link of await holder.locator('.graph-source-links a').all()) assert.ok(await link.evaluate(el => el.getBoundingClientRect().height >= 44));
   let axe; { await page.evaluate(axeSource); axe = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then(result => ({ violations: result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), incomplete: result.incomplete.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })) }))); assert.deepEqual(axe.violations, []); }
   if (process.env.SITE_FOCAL_SCREENSHOTS && width === 390 && textScale === 200 && theme !== 'retro') { fs.mkdirSync(process.env.SITE_FOCAL_SCREENSHOTS, { recursive: true }); await holder.screenshot({ path: path.join(process.env.SITE_FOCAL_SCREENSHOTS, `${guide}-${theme}-${width}-${textScale}.png`) }); }
   assert.deepEqual(errors, []); await context.close(); return { axe, diagram, labelGeometry };
  });
  for (const mode of ['no-js', 'site-blocked', 'motion-blocked', 'storage-blocked']) await check('native SVG and visible text fallback: ' + mode, async () => {
   const context = await newContext({ theme: 'retro', javaScriptEnabled: mode !== 'no-js', viewport: { width: 320, height: 900 } }), page = await context.newPage();
   if (mode === 'site-blocked') await page.route('**/assets/js/site.js', route => route.abort()); if (mode === 'motion-blocked') await page.route('**/assets/js/motion.js', route => route.abort()); if (mode === 'storage-blocked') await context.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('disabled', 'SecurityError'); } }); });
   for (const guide of ['cap', 'forest']) { await page.goto(base + '/' + guide + '-caso.html'); await verifyGraph(page, guide); assert.equal(present(await crt(page)), false); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
   await page.locator('.graph-source-links a').first().focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/forest.html#asrep'); assert.equal(new URL(page.url()).pathname, '/forest.html'); await context.close();
  });
  for (const theme of ['dark', 'paper', 'retro']) await check('print has directed graph, text and no CRT: ' + theme, async () => {
   const context = await newContext({ theme }), page = await context.newPage(); await page.emulateMedia({ media: 'print' });
   await page.goto(base + '/index.html'); assert.equal(present(await crt(page)), false); for (const guide of ['cap', 'forest']) { await page.goto(base + '/' + guide + '-caso.html'); await verifyGraph(page, guide); assert.equal(await page.locator('.graph-wide').isVisible(), true); assert.equal(await page.locator('.graph-narrow').isVisible(), false); assert.equal(await page.locator('.graph-wide').evaluate(el => getComputedStyle(el).color), 'rgb(17, 17, 17)'); } await context.close();
  });
  assert.deepEqual(hashSources(), sourcesBefore);
 } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
 writeResults(); console.log(JSON.stringify({ total: results.length, passed: results.filter(row => row.passed).length, output }));
})().catch(async error => { if (browser) await browser.close().catch(() => {}); server.close(); writeResults(error); console.error(error.stack); process.exitCode = 1; });
