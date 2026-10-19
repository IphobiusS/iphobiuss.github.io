/* Reproducible laboratory observations, not field Core Web Vitals or a phone test.
   SITE_EXPERIENCE_RUNS=1 is the bounded CI smoke run. Timings never gate CI. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), zlib = require('node:zlib'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SITE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.SITE_EXPERIENCE_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_EXPERIENCE_OUTPUT || path.join(os.tmpdir(), 'iphobiuss-experience-' + process.pid, 'results.json'));
const repetitions = Number(process.env.SITE_EXPERIENCE_RUNS || 3);
assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 10, 'SITE_EXPERIENCE_RUNS must be 1–10');
const profile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  cpuSlowdown: 4, latencyMs: 150, downloadBitsPerSecond: 1600000, uploadBitsPerSecond: 750000,
  browserCache: 'disabled', serverCompression: 'gzip level 6 for HTML/CSS/JS/JSON/SVG/XML', observationAfterLoadMs: 1000 };
const cases = [
  { route: 'index.html', intro: true }, { route: 'buscar.html', interaction: 'search' },
  { route: 'cuaderno.html', interaction: 'notebook' }, { route: 'report-gen-demo.html' }, { route: 'forest.html' }
];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const assets = new Map();
function inventory(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    const name = path.posix.join(relative, entry.name), file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Distribution contains a symlink: ' + name);
    if (entry.isDirectory()) return inventory(file, name);
    const bytes = fs.readFileSync(file), type = mime[path.extname(file)] || 'application/octet-stream';
    const compressed = /\.(html|css|js|json|svg|xml)$/.test(file) ? zlib.gzipSync(bytes, { level: 6 }) : null;
    assets.set('/' + name, { bytes, compressed, type });
    return [{ path: name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }];
  });
}
const inputs = inventory(root);
for (const entry of cases) assert.ok(assets.has('/' + entry.route), 'Build the site first: missing ' + entry.route);
const server = http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  const asset = assets.get(pathname === '/' ? '/index.html' : pathname);
  if (!asset) { response.writeHead(404).end(); return; }
  const gzip = asset.compressed && /\bgzip\b/.test(request.headers['accept-encoding'] || '');
  const bytes = gzip ? asset.compressed : asset.bytes;
  response.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'no-store', 'Content-Length': bytes.length,
    ...(gzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}) });
  response.end(bytes);
});
const result = { schema: 1, kind: 'controlled-laboratory-observation', generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpuModel: os.cpus()[0]?.model,
    logicalCpuCount: os.cpus().length, browser: null }, profile, repetitions, inputs, runs: [], summary: [],
  limitations: [
    'Desktop Chromium with an emulated mobile viewport and CDP throttling; no physical phone, Safari, human participant or screen reader was tested.',
    'The local gzip server isolates page work from DNS, TLS, CDN distance, packet loss and real mobile thermal/storage constraints.',
    'LCP is the last browser candidate before the stated observation cutoff. A modal may be its candidate; contentUncoveredMs separately records release of the Matrix overlay.',
    'CLS uses the largest session window (maximum 5 s, separated by more than 1 s), excluding shifts after recent input. It covers only the measured navigation window.',
    'Interaction latency starts at the trusted input event and ends after two animation frames following the expected DOM/storage result; this is a task-specific paint approximation, not INP.',
    'Long Tasks are reported individually and in total. They are not TBT or INP. Event Timing entries are raw browser observations, not a field percentile.',
    'Timings are descriptive and vary with host contention; CI gates functional outcomes and instrumentation availability, not millisecond thresholds.',
    'The three-run median (or the requested sample count) is a local sample, not a visitor percentile. Native and human protocols remain not_run until separately executed.'
  ] };
let browser;
function save(error) {
  if (error) result.fatal = String(error.stack || error);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
}

// Install before product scripts. No application timers or clocks are changed.
function observe(options) {
  const audit = window.__experience = { supported: PerformanceObserver.supportedEntryTypes, lcp: [], shifts: [], longTasks: [], events: [],
    intro: { openedAt: null, closedAt: null, opaque: false, fade: false, frames: [] }, interactions: [], csp: [] };
  const describe = element => element ? element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') +
    [...element.classList].slice(0, 2).map(name => '.' + name).join('') : null;
  const observeType = (type, receive, extra = {}) => {
    if (!audit.supported.includes(type)) return;
    new PerformanceObserver(list => list.getEntries().forEach(receive)).observe({ type, buffered: true, ...extra });
  };
  observeType('largest-contentful-paint', item => audit.lcp.push({ at: item.startTime, renderTime: item.renderTime, loadTime: item.loadTime,
    size: item.size, element: describe(item.element), url: item.url ? new URL(item.url).pathname : null }));
  observeType('layout-shift', item => audit.shifts.push({ at: item.startTime, value: item.value, hadRecentInput: item.hadRecentInput,
    sources: item.sources?.map(source => describe(source.node)) || [] }));
  observeType('longtask', item => audit.longTasks.push({ at: item.startTime, duration: item.duration, name: item.name }));
  observeType('event', item => audit.events.push({ name: item.name, at: item.startTime, duration: item.duration,
    processingStart: item.processingStart, processingEnd: item.processingEnd, interactionId: item.interactionId }), { durationThreshold: 16 });
  document.addEventListener('securitypolicyviolation', event => audit.csp.push(event.violatedDirective));
  if (!options.intro) localStorage.setItem('iphobiuss:intro', 'off');
  if (options.interaction === 'notebook') localStorage.setItem('iphobiuss:notebook:v1', JSON.stringify({ version: 1, items: [
    { url: 'cap.html', title: 'Cap', note: 'Nota de prueba', updated: '2026-10-10T00:00:00.000Z' }
  ], reading: [] }));
  let frame, lastFrame = -Infinity;
  function sample(dialog, force = false) {
    const now = performance.now();
    if (force || now - lastFrame >= 50) {
      lastFrame = now;
      const style = getComputedStyle(dialog), backdrop = getComputedStyle(dialog, '::backdrop');
      const opacity = Number(style.opacity), backdropOpacity = Number(backdrop.opacity);
      const value = { at: now, open: dialog.open, leaving: dialog.hasAttribute('data-intro-leaving'), opacity, backdropOpacity };
      audit.intro.frames.push(value);
      if (dialog.open && !value.leaving && opacity === 1 && backdropOpacity === 1) audit.intro.opaque = true;
      // V14.11: the exit clears the screen upward (clip-path) instead of fading it.
      const cleared = Number((/inset\(0(?:px)? 0(?:px)? ([\d.]+)%/.exec(getComputedStyle(dialog).clipPath) || [0, 0])[1]);
      if (dialog.open && value.leaving && cleared > 0 && cleared < 100 && backdropOpacity < 1) audit.intro.fade = true;
    }
    if (dialog.open) frame = requestAnimationFrame(() => sample(dialog));
  }
  for (const method of ['showModal', 'close']) {
    const native = HTMLDialogElement.prototype[method];
    HTMLDialogElement.prototype[method] = function (...args) {
      const watched = this.matches('[data-site-intro]'), wasOpen = this.open;
      const value = native.apply(this, args);
      if (watched && method === 'showModal' && this.open && !wasOpen) {
        audit.intro.openedAt = performance.now(); sample(this, true);
      }
      if (watched && method === 'close' && wasOpen && !this.open) {
        audit.intro.closedAt = performance.now(); cancelAnimationFrame(frame);
        requestAnimationFrame(() => requestAnimationFrame(() => { audit.intro.contentUncoveredMs = performance.now(); }));
      }
      return value;
    };
  }
}
function snapshot() {
  const source = window.__experience, shifts = source.shifts.filter(item => !item.hadRecentInput);
  let cls = 0, windowScore = 0, windowStart = -Infinity, previous = -Infinity;
  for (const shift of shifts) {
    if (shift.at - previous >= 1000 || shift.at - windowStart >= 5000) { windowStart = shift.at; windowScore = 0; }
    windowScore += shift.value; cls = Math.max(cls, windowScore); previous = shift.at;
  }
  const navigation = performance.getEntriesByType('navigation')[0];
  return { cutoffMs: performance.now(), supported: source.supported, navigation: { responseStart: navigation.responseStart,
    domContentLoadedMs: navigation.domContentLoadedEventEnd, loadMs: navigation.loadEventEnd },
    fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    lcp: source.lcp.at(-1) || null, lcpCandidates: source.lcp, cls, shifts: source.shifts,
    longTasks: source.longTasks, longTaskDurationMs: source.longTasks.reduce((total, item) => total + item.duration, 0),
    resources: performance.getEntriesByType('resource').map(item => ({ path: new URL(item.name).pathname, kind: item.initiatorType,
      transferBytes: item.transferSize, compressedBytes: item.encodedBodySize, decodedBytes: item.decodedBodySize, durationMs: item.duration })),
    intro: source.intro, eventTiming: source.events, csp: source.csp };
}
async function interaction(page, kind) {
  const selector = kind === 'search' ? 'input[name=q]' : '[data-notebook-note="cap.html"]';
  const note = 'Nota guardada en la prueba de rendimiento.';
  if (kind === 'notebook') await page.locator(selector).fill(note);
  else await page.locator(selector).focus();
  // Arm a capture listener before a real keyboard/click event; Playwright setup
  // and remote-driver round trips are outside the measured interval.
  await page.evaluate(({ kind, note }) => {
    const result = window.__experienceInteraction = { kind, complete: false };
    const eventType = kind === 'search' ? 'input' : 'click';
    const handler = event => {
      const target = kind === 'search' ? event.target.matches('input[name=q]') :
        event.target.closest('button')?.textContent === 'Guardar nota';
      if (!target || !event.isTrusted) return;
      document.removeEventListener(eventType, handler, true);
      result.startedAt = performance.now(); result.trusted = event.isTrusted;
      const expected = () => kind === 'search' ? document.querySelector('input[name=q]').value === 'cap' &&
        document.querySelectorAll('#search-results a').length > 0 && /\d+ resultados?/.test(document.querySelector('#search-count').textContent) :
        JSON.parse(localStorage.getItem('iphobiuss:notebook:v1')).items.find(item => item.url === 'cap.html').note === note;
      const watch = new MutationObserver(check);
      function check() {
        if (!expected() || result.resultAt !== undefined) return;
        result.resultAt = performance.now(); watch.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          result.observedAfterPaintAt = performance.now(); result.latencyMs = result.observedAfterPaintAt - result.startedAt; result.complete = true;
        }));
      }
      watch.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
      queueMicrotask(check);
    };
    document.addEventListener(eventType, handler, true);
  }, { kind, note });
  if (kind === 'search') await page.keyboard.insertText('cap');
  else await page.locator(selector).locator('xpath=ancestor::article').getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await page.waitForFunction(() => window.__experienceInteraction.complete);
  const measured = await page.evaluate(() => ({ ...window.__experienceInteraction, eventTiming: window.__experience.events }));
  assert.equal(measured.trusted, true); assert.ok(Number.isFinite(measured.latencyMs));
  return measured;
}
const median = values => { const sorted = values.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, ...(process.env.SITE_CHROMIUM ? { executablePath: process.env.SITE_CHROMIUM } : {}), args: ['--no-sandbox'] });
  result.environment.browser = browser.version();
  for (let repeat = 1; repeat <= repetitions; repeat++) for (const entry of cases) {
    const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: profile.isMobile, hasTouch: profile.hasTouch, reducedMotion: 'no-preference' });
    context.setDefaultTimeout(30000); context.setDefaultNavigationTimeout(45000);
    try {
      await context.addInitScript(observe, entry);
      const page = await context.newPage(), errors = [], failedRequests = [], responses = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => failedRequests.push({ path: new URL(request.url()).pathname, reason: request.failure()?.errorText }));
      page.on('response', response => { if (response.status() >= 400) responses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
      const client = await context.newCDPSession(page);
      await client.send('Network.enable'); await client.send('Network.setCacheDisabled', { cacheDisabled: true });
      await client.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latencyMs,
        downloadThroughput: profile.downloadBitsPerSecond / 8, uploadThroughput: profile.uploadBitsPerSecond / 8, connectionType: 'cellular4g' });
      await client.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
      const response = await page.goto(base + '/' + entry.route, { waitUntil: 'load' }); assert.equal(response.status(), 200);
      if (entry.intro) await page.waitForFunction(() => typeof window.__experience.intro.contentUncoveredMs === 'number');
      if (entry.interaction) await page.waitForFunction(kind => document.documentElement.classList.contains(kind === 'search' ? 'search-ready' : 'notebook-ready'), entry.interaction);
      await page.waitForTimeout(profile.observationAfterLoadMs);
      const measured = await page.evaluate(snapshot);
      assert.ok(measured.supported.includes('largest-contentful-paint') && measured.supported.includes('layout-shift'), 'Required performance observers must exist');
      assert.ok(measured.lcp && Number.isFinite(measured.lcp.at), 'A browser LCP candidate must be recorded');
      assert.ok(await page.locator('main h1').isVisible());
      if (entry.intro) { assert.ok(measured.intro.opaque, 'Matrix must cover the page'); assert.ok(measured.intro.fade, 'A frame must show the exit transition');
        assert.equal(await page.locator('[data-site-intro][open]').count(), 0); }
      const task = entry.interaction ? await interaction(page, entry.interaction) : null;
      let brand = null;
      if (entry.route === 'index.html') {
        brand = await page.locator('.report-art img').evaluate(async image => {
          await image.decode();
          return { currentSource: new URL(image.currentSrc).pathname, renderedWidth: image.getBoundingClientRect().width,
            renderedHeight: image.getBoundingClientRect().height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
            devicePixelRatio };
        });
        // V15.1: la ilustración de la tarjeta usa una variante proporcional a su ancho, nunca la de 1774 px en móvil 1×.
        assert.match(brand.currentSource, /report-gen-ilustracion-(480|720)\.webp$/, 'A 1× card must use a small derivative');
        assert.ok(!measured.resources.some(resource => resource.path === '/assets/img/report-gen-ilustracion-1774.webp'), 'Responsive browsers must not download the full-size variant');
      }
      assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(responses, []);
      assert.deepEqual(await page.evaluate(() => window.__experience.csp), []);
      result.runs.push({ route: entry.route, repeat, ...measured, interaction: task, brand, functionalChecks: 'passed' });
      save(); console.log(JSON.stringify({ route: entry.route, repeat, lcpMs: Math.round(measured.lcp.at), cls: measured.cls,
        contentUncoveredMs: measured.intro.contentUncoveredMs ?? null, interactionMs: task?.latencyMs ?? null }));
    } finally { await context.close(); }
  }
  result.summary = cases.map(entry => {
    const runs = result.runs.filter(run => run.route === entry.route);
    return { route: entry.route, samples: runs.length, medianLcpMs: median(runs.map(run => run.lcp.at)),
      maximumCls: Math.max(...runs.map(run => run.cls)), medianLongTaskDurationMs: median(runs.map(run => run.longTaskDurationMs)),
      medianContentUncoveredMs: entry.intro ? median(runs.map(run => run.intro.contentUncoveredMs)) : null,
      medianInteractionMs: entry.interaction ? median(runs.map(run => run.interaction.latencyMs)) : null };
  });
  save(); console.log('Experience laboratory observations: ' + output);
})().catch(error => { save(error); console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
});
