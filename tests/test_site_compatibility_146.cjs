/* Cross-engine functional journeys and cold mobile resource budgets.
 * Playwright WebKit is an engine test, not a claim of native Safari coverage.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const playwright = require('playwright');
const { axeSource } = require('./qa-deps.cjs');
const root = path.resolve(process.env.SITE_COMPAT_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_COMPAT_OUTPUT || path.join(__dirname, '../audit-v14.6/compatibility'));
const budget = JSON.parse(fs.readFileSync(path.join(__dirname, 'performance_budget.json'), 'utf8'));
const engines = (process.env.SITE_COMPAT_BROWSERS || 'firefox,webkit').split(',');
assert.ok(engines.length && engines.every(name => ['chromium', 'firefox', 'webkit'].includes(name)), 'Unknown browser engine');
const routes = fs.readdirSync(root).filter(file => file.endsWith('.html')).sort();
assert.ok(routes.length, 'Build the website before running browser checks');
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const fileFor = url => path.resolve(root, '.' + (new URL(url).pathname === '/' ? '/index.html' : decodeURIComponent(new URL(url).pathname)));
const server = http.createServer((request, response) => {
  const file = fileFor('http://localhost' + request.url);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, content) => {
    if (error) return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length, 'Cache-Control': 'no-store' });
    response.end(content);
  });
});
const results = [], versions = {}, completedEngines = []; let browser, engine, base;
const save = fatal => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({
  requestedEngines: engines, versions, testedRoutes: routes, budgets: budget,
  completedEngines,
  completeRequiredEngineCoverage: ['firefox', 'webkit'].every(name => completedEngines.includes(name)),
  limitations: ['WebKit is not native Safari.', 'Automated accessibility checks are not a human screen-reader evaluation.', 'Byte/request budgets are not field Web Vitals or network-time guarantees.'],
  passed: results.filter(result => result.passed).length, total: results.length, results,
  ...(fatal ? { fatal: String(fatal.stack || fatal) } : {})
}, null, 2) + '\n');
const check = async (name, action) => {
  try { const detail = await action(); results.push({ engine, name, passed: true, ...detail }); console.log(`PASS ${engine}: ${name}`); }
  catch (error) { results.push({ engine, name, passed: false, error: error.message }); throw error; }
};
async function fresh(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', ...options });
  context.setDefaultTimeout(10000);
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', event => window.__csp.push(event.violatedDirective));
  });
  const page = await context.newPage(), errors = [], failed = [], requests = [], badResponses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  page.on('requestfailed', request => failed.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() }); });
  return { context, page, errors, failed, requests, badResponses };
}
async function healthy(state, { reflow = true } = {}) {
  assert.deepEqual(state.errors, [], 'Uncaught JavaScript error');
  assert.deepEqual(state.failed, [], 'Failed request');
  assert.deepEqual(state.badResponses, [], 'Error response');
  assert.deepEqual(await state.page.evaluate(() => window.__csp || []), [], 'CSP violation');
  if (reflow) assert.ok(await state.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal overflow');
}
async function settled(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}
async function audit(page) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then(result => ({ violations: result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), incomplete: result.incomplete.map(item => item.id) })));
  assert.deepEqual(result.violations, [], 'Automated accessibility violation');
  return result;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  for (engine of engines) {
    const executablePath = process.env['SITE_' + engine.toUpperCase()];
    browser = await playwright[engine].launch({ headless: true, timeout: 30000, ...(executablePath ? { executablePath } : {}), ...(engine === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
    versions[engine] = browser.version();
    await check('Matrix modal opens, reveals the page and releases keyboard focus', async () => {
      const state = await fresh({ reducedMotion: 'no-preference' }); const { page, context } = state;
      await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('[data-site-intro]')?.open);
      assert.ok(await page.locator('[data-site-intro]').evaluate(dialog => dialog.matches(':modal') && dialog.contains(document.activeElement)));
      await page.waitForFunction(() => { const dialog = document.querySelector('[data-site-intro]'); const opacity = Number(getComputedStyle(dialog).opacity), backdrop = Number(getComputedStyle(dialog, '::backdrop').opacity); return dialog.open && dialog.hasAttribute('data-intro-leaving') && opacity > 0 && opacity < 1 && backdrop > 0 && backdrop < 1; });
      const fade = await page.locator('[data-site-intro]').evaluate(dialog => ({ welcome: getComputedStyle(dialog.querySelector('.intro-line-ready')).opacity, backdrop: getComputedStyle(dialog, '::backdrop').opacity }));
      assert.equal(fade.welcome, '1');
      await page.waitForFunction(() => !document.querySelector('[data-site-intro]').open);
      assert.equal(await page.locator('main h1').isVisible(), true);
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-site-intro]')), false);
      await settled(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('[data-site-intro]')?.open);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-site-intro]').evaluate(dialog => dialog.open), false);
      assert.equal(await page.locator('a.skip').evaluate(link => link === document.activeElement), true);
      await settled(page); await healthy(state); await context.close(); return { automaticReveal: true, escapeDismissal: true, fade };
    });
    await check('Keyboard menu, native links, theme controls and persisted appearance', async () => {
      const state = await fresh(); const { page, context } = state;
      await page.goto(base + '/index.html');
      assert.equal(await page.locator('[data-site-intro][open]').count(), 0, 'Reduced motion bypasses the intro');
      const menu = page.locator('button.menu-toggle'); await menu.focus(); await page.keyboard.press('Enter');
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      assert.ok(await page.evaluate(() => !!document.activeElement?.closest('#site-nav')));
      const guides = page.locator('#site-nav a[href="guias.html"]'); await guides.focus(); await page.keyboard.press('Enter');
      await page.waitForURL('**/guias.html');
      assert.equal(await page.locator('button.menu-toggle').getAttribute('aria-expanded'), 'false');
      await page.locator('[data-appearance]>summary').click(); await page.locator('[data-paper-toggle]').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'paper');
      await page.reload(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'paper');
      await page.locator('[data-appearance]>summary').click(); await page.locator('[data-retro-toggle]').click();
      assert.equal(await page.locator('html').getAttribute('data-retro'), 'on');
      assert.equal(await page.locator('html').getAttribute('data-theme'), null);
      await page.locator('[data-retro-toggle]').click(); assert.equal(await page.locator('html').getAttribute('data-retro'), 'off');
      await healthy(state); const axe = await audit(page); await context.close(); return { themes: ['dark', 'paper', 'retro'], keyboardNavigation: true, axe };
    });
    await check('Search filters, shared URL, result activation and history navigation', async () => {
      const state = await fresh(); const { page, context } = state;
      await page.goto(base + '/buscar.html');
      await page.waitForFunction(() => document.documentElement.classList.contains('search-ready'));
      await page.locator('input[name=q]').fill('cap'); await page.locator('input[name=q]').press('Enter');
      await page.locator('#search-type').selectOption('casos'); await page.locator('#search-language').selectOption('en');
      await page.waitForFunction(() => document.querySelectorAll('#search-results a').length === 1);
      assert.equal(await page.locator('#search-results a').getAttribute('href'), 'cap-case-en.html');
      const share = new URL(page.url()); assert.equal(share.searchParams.get('q'), 'cap'); assert.equal(share.searchParams.get('tipo'), 'casos'); assert.equal(share.searchParams.get('idioma'), 'en');
      await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('search-ready'));
      assert.equal(await page.locator('#search-type').inputValue(), 'casos'); assert.equal(await page.locator('#search-language').inputValue(), 'en');
      await page.locator('#search-results a').focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/cap-case-en.html');
      await page.goBack(); await page.waitForFunction(() => document.documentElement.classList.contains('search-ready'));
      assert.equal(await page.locator('#search-language').inputValue(), 'en');
      await page.locator('[data-search-filters-clear]').click(); assert.equal(await page.locator('#search-language').inputValue(), '');
      await settled(page); await healthy(state); const axe = await audit(page); await context.close(); return { search: true, sharedState: true, history: true, axe };
    });
    for (const javascript of [true, false]) await check('Public CV download and native reading, JavaScript ' + javascript, async () => {
      const state = await fresh({ javaScriptEnabled: javascript }); const { page, context } = state;
      for (const route of ['index.html', 'english.html']) {
        await page.goto(base + '/' + route);
        const cv = page.locator('a[download][href="downloads/cv-sebastian-latorre.pdf"]').first();
        await cv.focus(); const pending = page.waitForEvent('download'); await page.keyboard.press('Enter'); const download = await pending;
        assert.equal(await download.failure(), null); assert.equal(download.suggestedFilename(), 'cv-sebastian-latorre.pdf');
        assert.ok(fs.readFileSync(await download.path()).equals(fs.readFileSync(path.join(root, 'downloads/cv-sebastian-latorre.pdf'))));
      }
      if (!javascript) {
        await page.goto(base + '/buscar.html'); assert.ok(await page.locator('.search-fallback a').count() >= routes.length - 2);
        assert.ok(await page.locator('.search-fallback').isVisible());
      }
      // Firefox reports a navigation download as NS_BINDING_ABORTED; the completed,
      // byte-checked Download object above is the authoritative download outcome.
      state.failed = state.failed.filter(item => !item.url.endsWith('/downloads/cv-sebastian-latorre.pdf'));
      await healthy(state); await context.close(); return { downloads: 2, identicalPDF: true, nativeFallback: !javascript };
    });
    await check('Skill evidence and HTTP lab remain operable with keyboard and no JavaScript', async () => {
      const state = await fresh({ javaScriptEnabled: false }); const { page, context } = state;
      await page.goto(base + '/index.html');
      assert.equal(await page.locator('.skill-evidence-card').count(), 4);
      const evidence = await page.locator('.skill-evidence-card .skill-sources a:first-child').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
      for (const href of evidence) {
        await page.goto(base + '/index.html');
        const source = page.locator('.skill-sources a[href="' + href + '"]').first();
        await source.focus(); await page.keyboard.press('Enter'); await page.waitForURL(base + '/' + href);
        assert.ok(await page.locator('main h1').isVisible());
      }
      await page.goto(base + '/index.html');
      const lab = page.locator('.lab-shortcuts a[href="api-acceso.html"]');
      await lab.focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/api-acceso.html');
      const docker = page.locator('#reproducir details');
      await docker.locator(':scope>summary').focus(); await page.keyboard.press('Enter');
      assert.notEqual(await docker.getAttribute('open'), null);
      assert.match(await docker.innerText(), /docker run --rm --network none/);
      const downloads = ['http-access-lab.zip', 'http-access-resultados.json'];
      for (const filename of downloads) {
        const link = page.locator('a[download][href="downloads/' + filename + '"]');
        await link.focus(); const pending = page.waitForEvent('download'); await page.keyboard.press('Enter'); const download = await pending;
        assert.equal(await download.failure(), null); assert.equal(download.suggestedFilename(), filename);
        assert.ok(fs.readFileSync(await download.path()).equals(fs.readFileSync(path.join(root, 'downloads', filename))));
      }
      state.failed = state.failed.filter(item => !downloads.some(filename => item.url.endsWith('/downloads/' + filename)));
      await healthy(state); await context.close(); return { evidenceDestinations: evidence, nativeDockerDisclosure: true, identicalDownloads: downloads };
    });
    for (const theme of ['dark', 'paper', 'retro']) await check('Narrow reflow and accessibility at 200% text: ' + theme, async () => {
      const state = await fresh({ viewport: { width: 320, height: 900 } }); const { page, context } = state;
      await context.addInitScript(theme => {
        if (theme === 'paper') localStorage.setItem('iphobiuss:theme', 'paper');
        if (theme === 'retro') localStorage.setItem('iphobiuss:retro', 'on');
      }, theme);
      const inspected = [];
      for (const route of ['index.html', 'buscar.html', 'api-acceso.html'].filter(route => routes.includes(route))) {
        await page.goto(base + '/' + route);
        await settled(page); await page.addStyleTag({ content: 'html{font-size:200%!important}' });
        if (route === 'buscar.html') {
          await page.locator('#search-type').selectOption('herramientas');
          await page.locator('#search-language').selectOption('es');
          assert.ok((await page.locator('[data-search-filter-selection]').innerText()).includes('Herramientas'));
        }
        await healthy(state); inspected.push({ route, axe: await audit(page) });
      }
      await context.close(); return { viewport: '320×900', textScalePercent: 200, pages: inspected };
    });
    for (const route of routes) await check('Cold mobile page and resource budget: ' + route, async () => {
      const state = await fresh(); const { page, context } = state;
      const response = await page.goto(base + '/' + route); assert.equal(response.status(), 200);
      await settled(page);
      assert.equal(await page.locator('h1').count(), 1); assert.ok(['es', 'en'].includes(await page.locator('html').getAttribute('lang')));
      assert.equal(await page.locator('main').count(), 1); await healthy(state);
      assert.deepEqual(await page.locator('[id]').evaluateAll(nodes => { const ids = nodes.map(node => node.id); return ids.filter((id, index) => ids.indexOf(id) !== index); }), [], 'Duplicate IDs');
      const files = state.requests.map(url => { assert.equal(new URL(url).origin, base, 'Unexpected third-party runtime request'); const file = fileFor(url); assert.ok(file.startsWith(root + path.sep) && fs.statSync(file).isFile()); return file; });
      const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0);
      assert.ok(files.length <= budget.mobile_initial_requests, `Initial requests ${files.length} exceed ${budget.mobile_initial_requests}`);
      assert.ok(bytes <= budget.mobile_initial_bytes, `Initial uncompressed bytes ${bytes} exceed ${budget.mobile_initial_bytes}`);
      if (['index.html', 'buscar.html'].includes(route) || route.includes('acceso') || route.includes('competencia')) await page.screenshot({ path: path.join(output, engine + '-' + route.replace('.html', '') + '-mobile.png'), animations: 'disabled' });
      await context.close(); return { viewport: '390×844', initialRequests: files.length, uncompressedBytes: bytes };
    });
    const mobile = results.filter(result => result.engine === engine && 'initialRequests' in result);
    console.log(JSON.stringify({ engine, version: versions[engine], mobilePages: mobile.length,
      maximumInitialRequests: Math.max(...mobile.map(result => result.initialRequests)),
      maximumUncompressedBytes: Math.max(...mobile.map(result => result.uncompressedBytes)) }));
    await browser.close(); browser = undefined; completedEngines.push(engine); save();
  }
  save(); console.log(`Compatibility: ${results.length}/${results.length} passed across ${engines.join(', ')}.`);
})().catch(error => { save(error); console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
