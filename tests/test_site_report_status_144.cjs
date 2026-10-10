/* The public status must stay tied to the download and readable without a live service. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { axeSource } = require('./qa-deps.cjs');
const root = path.resolve(process.env.SITE_STATUS_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_STATUS_OUTPUT || path.join(__dirname, '../audit-v14.4/status'));
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/report-gen-status.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/report-gen.json'), 'utf8'));
const expectedRuns = snapshot.checks.map(check => `${snapshot.repository}/actions/runs/${check.run_id}`).sort();
const pages = { es: ['proyectos.html', 'report-gen-verificacion'], en: ['report-gen-en.html', 'report-gen-verification'] };
fs.mkdirSync(output, { recursive: true });
const checks = []; let browser;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => { if (err) return res.writeHead(404).end(); res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(data); });
});
const check = async (name, fn) => { const detail = await fn(); checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); };
const save = fatal => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ total: checks.length, passed: checks.length, browser: browser?.version(), sourceCommit: snapshot.source_commit, checks, ...(fatal ? { fatal: String(fatal.stack || fatal) } : {}) }, null, 2));
const captureCard = async (page, filename) => {
  const card = page.locator('[data-report-status]');
  // Test at the ordinary viewport first, then give the screenshot enough real
  // viewport height: oversized element captures can leave an unpainted footer.
  const box = await card.boundingBox(), viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, Math.ceil(box.height) + 200) });
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: path.join(output, filename), animations: 'disabled' });
};
const inspectCard = async (page, language) => {
  const card = page.locator('[data-report-status]');
  assert.equal(await card.count(), 1);
  assert.equal(await card.getAttribute('id'), pages[language][1]);
  assert.equal(await card.getAttribute('data-source-commit'), snapshot.source_commit);
  assert.equal(await card.getAttribute('data-reviewed-on'), snapshot.reviewed_on);
  assert.equal(await card.locator('[data-status-version]').innerText(), report.version);
  assert.equal(await card.locator('time').getAttribute('datetime'), snapshot.reviewed_on);
  assert.equal(await card.locator('code').innerText(), report.source_commit);
  const urls = await card.locator('a').evaluateAll(links => links.map(link => link.href));
  assert.deepEqual(urls.filter(url => url.includes('/actions/runs/')).sort(), expectedRuns);
  assert.ok(urls.includes(`${snapshot.repository}/commit/${report.source_commit}`));
  if (report.distribution === 'github-release') {
    const release = card.locator(`a[href="${report.release.html_url}"]`);
    assert.equal(await release.count(), 1);
    assert.ok(await release.isVisible(), 'The reviewed release link is visible in both languages');
  }
  assert.ok(urls.filter(url => url.includes('/blob/')).every(url => url.includes(`/blob/${report.source_commit}/`)));
  assert.match(await card.locator('.report-status-pending').innerText(), /Microsoft Word/);
  assert.match(await card.locator('.report-status-pending').innerText(), language === 'en' ? /five usability sessions/ : /cinco sesiones de usabilidad/);
  assert.match(await card.locator('.report-status-intro').innerText(), language === 'en' ? /dated review/ : /revisión fechada/);
  assert.equal(await card.locator('script,img,iframe,video,canvas').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page has no horizontal overflow');
  assert.deepEqual(await card.evaluate(node => [...node.querySelectorAll('h2,h3,p,dt,dd,code,a')].filter(element => element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).display !== 'inline').map(element => element.outerHTML.slice(0,160))), [], 'Status text is not clipped');
};
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ ...(process.env.SITE_CHROMIUM ? { executablePath: process.env.SITE_CHROMIUM } : {}), headless: true, args: ['--no-sandbox'] });
  await check('Dated evidence matches the source-pinned, reviewed download', async () => {
    assert.equal(snapshot.version, report.version); assert.equal(snapshot.source_commit, report.source_commit);
    if (report.distribution === 'github-release') {
      assert.deepEqual(report.release, snapshot.release);
      assert.equal(report.release.source_commit, snapshot.source_commit);
      assert.equal(report.release.tag, `v${report.version}`);
      assert.equal(report.download, `${snapshot.repository}/releases/download/v${report.version}/report-gen-${report.version}-${snapshot.source_commit.slice(0,12)}.zip`);
      assert.equal(report.download_sha256, report.release.sha256);
      assert.match(report.download_sha256, /^[a-f0-9]{64}$/);
      assert.equal(report.download_bytes, report.release.bytes);
      assert.ok(Number.isSafeInteger(report.download_bytes) && report.download_bytes > 0);
    } else {
      assert.equal(report.download, `${snapshot.repository}/archive/${snapshot.source_commit}.zip`);
    }
    assert.equal(snapshot.checks.length, 4);
    for (const item of snapshot.checks) { assert.equal(item.head_sha, report.source_commit); assert.equal(item.conclusion, 'success'); assert.ok(item.completed_at.slice(0,10) <= snapshot.reviewed_on); }
    return { runs: expectedRuns, reviewedOn: snapshot.reviewed_on };
  });
  for (const language of ['es', 'en']) for (const theme of ['dark', 'paper', 'retro']) for (const width of [320, 1440]) await check(`Status card ${language}/${theme}/${width}`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(theme => {
      if (theme === 'paper') localStorage.setItem('iphobiuss:theme', 'paper');
      if (theme === 'retro') localStorage.setItem('iphobiuss:retro', 'on');
      window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective));
    }, theme);
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
    await page.goto(`${base}/${pages[language][0]}#${pages[language][1]}`);
    await page.evaluate(() => document.fonts.ready);
    await inspectCard(page, language);
    assert.equal(await page.locator('.report-status-details').getAttribute('open'), null);
    await page.locator('.report-status-details>summary').click();
    assert.ok(await page.locator('.report-status-checks').isVisible());
    await inspectCard(page, language);
    assert.equal(await page.locator('html').getAttribute('lang'), language);
    assert.ok(requests.every(url => url.startsWith(base + '/')), 'Viewing evidence does not contact GitHub or a tracking service');
    await page.evaluate(axeSource);
    const axe = await page.evaluate(() => window.axe.run('[data-report-status]', { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }).then(result => ({ violations: result.violations.map(v => ({id:v.id,nodes:v.nodes.map(n=>n.target)})), incomplete: result.incomplete.map(v=>v.id) })));
    assert.deepEqual(axe.violations, []); assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.__csp), []);
    await page.locator('.report-status-details>summary').click();
    const screenshot = `status-${language}-${theme}-${width}.png`;
    await captureCard(page, screenshot);
    await context.close(); return { axe, screenshot };
  });
  for (const language of ['es', 'en']) await check('Native reading without JavaScript: ' + language, async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
    const page = await context.newPage(); await page.goto(`${base}/${pages[language][0]}#${pages[language][1]}`);
    await inspectCard(page, language);
    await page.locator('.report-status-details>summary').click();
    assert.ok(await page.locator('.report-status-checks').isVisible());
    await inspectCard(page, language);
    await context.close(); return { staticEvidence: true };
  });
  for (const language of ['es', 'en']) await check('Status with text enlarged to 200%: ' + language, async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); await page.goto(`${base}/${pages[language][0]}#${pages[language][1]}`);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await inspectCard(page, language);
    const factBoxes = await page.locator('.report-status-facts>div').evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect(); return { top: box.top, bottom: box.bottom };
    }));
    assert.ok(factBoxes[1].top >= factBoxes[0].bottom, 'Enlarged facts have separate rows so the review date remains readable');
    await page.locator('.report-status-details>summary').click();
    await inspectCard(page, language);
    await page.locator('.report-status-details>summary').click();
    const screenshot = `status-${language}-text-200.png`;
    await captureCard(page, screenshot);
    await context.close(); return { screenshot };
  });
  await check('Homepage evidence link reaches the public card without JavaScript', async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
    const page = await context.newPage(); await page.goto(base + '/index.html');
    await page.locator('.readme-project-links a[href="proyectos.html#report-gen-verificacion"]').click();
    assert.equal(new URL(page.url()).hash, '#report-gen-verificacion');
    await inspectCard(page, 'es');
    await context.close(); return { nativeNavigation: true };
  });
  save(); console.log(`${checks.length}/${checks.length} report-gen status checks passed`);
})().catch(error => { save(error); console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.close(); });
