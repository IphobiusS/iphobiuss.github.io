/* Cross-engine functional journeys and cold mobile resource budgets.
 * Playwright WebKit is an engine test, not a claim of native Safari coverage.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), os = require('node:os');
const playwright = require('playwright');
const { axeSource } = require('./qa-deps.cjs');
const root = path.resolve(process.env.SITE_COMPAT_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_COMPAT_OUTPUT || path.join(__dirname, '../audit-v14.6/compatibility'));
const budget = JSON.parse(fs.readFileSync(path.join(__dirname, 'performance_budget.json'), 'utf8'));
const engines = (process.env.SITE_COMPAT_BROWSERS || 'firefox,webkit').split(',');
const headed = process.env.SITE_COMPAT_HEADED === '1';
assert.ok(engines.length && engines.every(name => ['chromium', 'firefox', 'webkit'].includes(name)), 'Unknown browser engine');
const routes = fs.readdirSync(root).filter(file => file.endsWith('.html')).sort();
assert.ok(routes.length, 'Build the website before running browser checks');
const distributionFiles = {};
function fingerprintDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Published resources must not be symlinks');
    if (entry.isDirectory()) fingerprintDirectory(file);
    else if (entry.isFile()) distributionFiles[path.relative(root, file).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
}
fingerprintDirectory(root);
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
  sourceRevision: process.env.GITHUB_SHA || null,
  operatingSystem: { platform: process.platform, release: os.release(), architecture: process.arch },
  requestedEngines: engines, versions, browserMode: headed ? 'headed' : 'headless', testedRoutes: routes, budgets: budget,
  distribution: { fileCount: Object.keys(distributionFiles).length, files: distributionFiles },
  completedEngines,
  completeRequestedEngineCoverage: engines.every(name => completedEngines.includes(name)),
  completeRequiredEngineCoverage: ['firefox', 'webkit'].every(name => completedEngines.includes(name)),
  limitations: ['WebKit is not native Safari.', 'Automated accessibility checks are not a human screen-reader evaluation.', 'Byte/request budgets are not field Web Vitals or network-time guarantees.'],
  passed: results.filter(result => result.passed).length, total: results.length, results,
  ...(fatal ? { fatal: String(fatal.stack || fatal) } : {})
}, null, 2) + '\n');
const check = async (name, action) => {
  try { const detail = await action(); results.push({ engine, name, passed: true, ...detail }); console.log(`PASS ${engine}: ${name}`); }
  catch (error) { results.push({ engine, name, passed: false, error: error.message, ...(error.evidence ? { evidence: error.evidence } : {}) }); throw error; }
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
// Observe the complete native intro inside the page, before product scripts run.
// No driver round trip is required during the 500 ms fade, and no clock, style,
// timer or transition is altered. If no intermediate frame exists, this fails.
function observeNativeIntro() {
  const trace = window.__compatIntro = { openedAt: null, closedAt: null, frames: [], events: [] };
  let active = null, frame = null;
  const number = value => Number(Number(value).toFixed(6));
  const snapshot = origin => {
    if (!active) return null;
    const style = getComputedStyle(active), backdrop = getComputedStyle(active, '::backdrop');
    const welcome = active.querySelector('.intro-line-ready');
    const sample = {
      at: number(performance.now()), origin, open: active.open,
      modal: active.matches(':modal'), leaving: active.hasAttribute('data-intro-leaving'),
      opacity: number(style.opacity), backdrop: number(backdrop.opacity),
      welcome: welcome ? number(getComputedStyle(welcome).opacity) : null,
      focusInside: active.contains(document.activeElement), visibility: document.visibilityState
    };
    trace.frames.push(sample);
    return sample;
  };
  const sampleFrame = () => {
    frame = null;
    snapshot('animation-frame');
    if (active?.open) frame = requestAnimationFrame(sampleFrame);
  };
  const nativeShow = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function (...args) {
    const result = nativeShow.apply(this, args);
    if (this.matches('[data-site-intro]')) {
      active = this;
      trace.openedAt = number(performance.now());
      trace.events.push({ type: 'showModal', at: trace.openedAt });
      snapshot('showModal');
      if (frame === null) frame = requestAnimationFrame(sampleFrame);
    }
    return result;
  };
  const nativeClose = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.close = function (...args) {
    const isIntro = this === active, wasOpen = this.open;
    if (isIntro) snapshot('before-close');
    const result = nativeClose.apply(this, args);
    if (isIntro && wasOpen) {
      trace.closedAt = number(performance.now());
      trace.events.push({ type: 'close', at: trace.closedAt });
      snapshot('after-close');
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    }
    return result;
  };
  for (const type of ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel', 'cancel']) {
    document.addEventListener(type, event => {
      if (!active || event.target !== active) return;
      trace.events.push({ type, at: number(performance.now()), property: event.propertyName || null,
        pseudoElement: event.pseudoElement || '', elapsedTime: event.elapsedTime ?? null });
      snapshot(type);
    }, true);
  }
  new MutationObserver(mutations => {
    if (active && mutations.some(mutation => mutation.target === active)) snapshot('attribute-change');
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['open', 'data-intro-leaving', 'hidden'] });
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  for (engine of engines) {
    const executablePath = process.env['SITE_' + engine.toUpperCase()];
    browser = await playwright[engine].launch({ headless: !headed, timeout: 30000, ...(executablePath ? { executablePath } : {}), ...(engine === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
    versions[engine] = browser.version();
    await check('Matrix modal opens, reveals the page and releases keyboard focus', async () => {
      const state = await fresh({ reducedMotion: 'no-preference' }); const { page, context } = state;
      await context.addInitScript(observeNativeIntro);
      let automaticTrace;
      try {
        await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
        // The stored terminal state can be read after closure without missing the
        // visual evidence that the observer collected from the first rendered frame.
        await page.waitForFunction(() => typeof window.__compatIntro?.closedAt === 'number');
        automaticTrace = await page.evaluate(() => window.__compatIntro);
        assert.deepEqual(automaticTrace.events.filter(event => ['showModal', 'close'].includes(event.type)).map(event => event.type), ['showModal', 'close']);
        assert.ok(automaticTrace.frames.some(frame => frame.origin === 'showModal' && frame.open && frame.modal && frame.focusInside), 'Native opening must actually capture keyboard focus');
        assert.ok(automaticTrace.frames.some(frame => frame.open && !frame.leaving && frame.opacity === 1 && frame.backdrop === 1), 'The site must remain opaque before the reveal');
        const fade = automaticTrace.frames.find(frame => frame.origin === 'animation-frame' && frame.open && frame.modal && frame.leaving && frame.opacity > 0 && frame.opacity < 1 && frame.backdrop > 0 && frame.backdrop < 1 && frame.welcome === 1);
        assert.ok(fade, 'No rendered frame shows both intro surfaces fading together after Bienvenido');
        assert.equal(await page.locator('main h1').isVisible(), true);
        assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-site-intro]')), false);
        await settled(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('[data-site-intro]')?.open);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-site-intro]').evaluate(dialog => dialog.open), false);
        assert.equal(await page.locator('a.skip').evaluate(link => link === document.activeElement), true);
        await settled(page); await healthy(state);
        fs.writeFileSync(path.join(output, engine + '-intro-trace.json'), JSON.stringify(automaticTrace, null, 2) + '\n');
        console.log(JSON.stringify({ engine, browserMode: headed ? 'headed' : 'headless', introSamples: automaticTrace.frames.length, fadeWitness: fade, closedAt: automaticTrace.closedAt }));
        await context.close(); return { automaticReveal: true, escapeDismissal: true, fade, introTrace: automaticTrace };
      } catch (error) {
        const currentTrace = await page.evaluate(() => window.__compatIntro).catch(failure => ({ unavailable: failure.message }));
        error.evidence = { browserMode: headed ? 'headed' : 'headless', automaticTrace: automaticTrace || null, currentTrace };
        fs.writeFileSync(path.join(output, engine + '-intro-trace.json'), JSON.stringify(error.evidence, null, 2) + '\n');
        console.error('INTRO DIAGNOSTIC ' + JSON.stringify(error.evidence));
        throw error;
      }
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
      const journeys = [];
      let current = { route: null, phase: 'created' };
      const inspectDocument = () => page.locator('html').evaluate(() => ({
        url: location.href, title: document.title, readyState: document.readyState,
        htmlClass: document.documentElement.className, bodyPresent: !!document.body,
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent),
        cvCount: document.querySelectorAll('a[download][href="downloads/cv-sebastian-latorre.pdf"]').length,
        cvLinks: [...document.querySelectorAll('a[download]')].map(node => ({ html: node.outerHTML, connected: node.isConnected,
          display: getComputedStyle(node).display, visibility: getComputedStyle(node).visibility,
          box: { x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height } })),
        activeElement: document.activeElement?.outerHTML.slice(0, 1000),
        bodyHTML: document.body?.innerHTML || '', csp: window.__csp || []
      }));
      const logSummary = entry => ({ ...entry, document: entry.document ? { ...entry.document,
        bodyHTML: entry.document.bodyHTML.slice(0, 2500), bodyHTMLLength: entry.document.bodyHTML.length,
        bodyEnd: entry.document.bodyHTML.slice(-1500) } : null });
      try {
        for (const route of ['index.html', 'english.html']) {
          current = { route, phase: 'navigation', urlBefore: page.url() };
          const response = await page.goto(base + '/' + route);
          current.response = response ? { url: response.url(), status: response.status(), headers: response.headers() } : null;
          current.phase = 'document-inspection';
          console.log('CV NAVIGATION ' + JSON.stringify({ engine, javascript, ...current, actualURL: page.url() }));
          assert.equal(response?.status(), 200, 'CV introduction must return HTTP 200: ' + route);
          assert.equal(page.url(), base + '/' + route, 'CV introduction must retain its expected URL');
          current.document = await inspectDocument();
          console.log('CV DOCUMENT ' + JSON.stringify({ engine, javascript, route, title: current.document.title,
            readyState: current.document.readyState, cvCount: current.document.cvCount, htmlClass: current.document.htmlClass }));
          assert.ok(current.document.cvCount >= 1, 'A native CV link must exist on ' + route);
          if (!javascript) assert.equal(current.document.htmlClass.split(/\s+/).includes('js'), false, 'Author scripts must stay disabled');
          const cv = page.locator('a[download][href="downloads/cv-sebastian-latorre.pdf"]').first();
          current.phase = 'focus';
          await cv.focus();
          assert.equal(await cv.evaluate(node => node === document.activeElement), true, 'Native CV link must receive keyboard focus');
          current.phase = 'download';
          const pending = page.waitForEvent('download'); await page.keyboard.press('Enter'); const download = await pending;
          assert.equal(await download.failure(), null); assert.equal(download.suggestedFilename(), 'cv-sebastian-latorre.pdf');
          assert.ok(fs.readFileSync(await download.path()).equals(fs.readFileSync(path.join(root, 'downloads/cv-sebastian-latorre.pdf'))));
          current.phase = 'complete'; journeys.push(current);
        }
        if (!javascript) {
          current = { route: 'buscar.html', phase: 'native-search-fallback' };
          await page.goto(base + '/buscar.html'); assert.ok(await page.locator('.search-fallback a').count() >= routes.length - 2);
          assert.ok(await page.locator('.search-fallback').isVisible());
        }
        // Firefox reports a navigation download as NS_BINDING_ABORTED; the completed,
        // byte-checked Download object above is the authoritative download outcome.
        state.failed = state.failed.filter(item => !item.url.endsWith('/downloads/cv-sebastian-latorre.pdf'));
        await healthy(state); await context.close(); return { downloads: 2, identicalPDF: true, nativeFallback: !javascript,
          journeys: journeys.map(entry => ({ route: entry.route, status: entry.response.status, cvCount: entry.document.cvCount, completed: entry.phase === 'complete' })) };
      } catch (error) {
        // Keep the pre-focus DOM even if the driver's utility context itself is
        // unavailable; synchronous URL/network records never need that context.
        error.evidence = { engine, javascript, browserMode: headed ? 'headed' : 'headless', current,
          actualURL: page.url(), pageClosed: page.isClosed(), journeys,
          pageErrors: state.errors, failedRequests: state.failed, badResponses: state.badResponses, requests: state.requests };
        fs.writeFileSync(path.join(output, engine + '-cv-js-' + javascript + '-diagnostic.json'), JSON.stringify(error.evidence, null, 2) + '\n');
        console.error('CV DIAGNOSTIC ' + JSON.stringify({ ...error.evidence, current: logSummary(current), journeys: journeys.map(logSummary) }));
        throw error;
      }
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
