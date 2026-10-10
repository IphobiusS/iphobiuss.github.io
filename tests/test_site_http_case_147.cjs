/* Real HTTP evidence remains inspectable with keyboard, without JS and at 200% text. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { axeSource } = require('./qa-deps.cjs');
const root = path.resolve(process.env.SITE_HTTP_CASE_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_HTTP_CASE_OUTPUT || path.join(__dirname, '../audit-v14.7/http-case'));
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'downloads/http-access-resultados.json'), 'utf8'));
const checks = []; let browser;
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return res.writeHead(404).end();
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(bytes);
  });
});
const check = async (name, action) => {
  try { checks.push({ name, passed: true, ...(await action() || {}) }); console.log('PASS ' + name); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); throw error; }
};
const save = error => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ summary: { total: checks.length, passed: checks.filter(item => item.passed).length, browser: browser?.version() }, checks, ...(error ? { error: error.stack } : {}) }, null, 2) + '\n');
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.SITE_CHROMIUM, headless: true, args: ['--no-sandbox'] });
  for (const enabled of [true, false]) await check('All captured exchanges open with keyboard and JavaScript ' + enabled, async () => {
    const context = await browser.newContext({ javaScriptEnabled: enabled, reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    assert.equal((await page.goto(base + '/api-acceso.html')).status(), 200);
    assert.equal(await page.locator('[data-http-scenario]').count(), evidence.summary.scenarios);
    let exchanges = 0;
    for (const scenario of evidence.results) {
      const entry = page.locator('[data-http-scenario="' + scenario.id + '"]');
      const summary = entry.locator(':scope > summary');
      await summary.focus(); await page.keyboard.press('Enter');
      assert.equal(await entry.evaluate(node => node.open), true, scenario.id + ' native open');
      const blocks = entry.locator('pre code'); assert.equal(await blocks.count(), 2);
      for (const [index, mode] of ['vulnerable', 'fixed'].entries()) {
        const visible = await blocks.nth(index).textContent();
        for (const step of scenario[mode].trace) {
          assert.ok(visible.includes(step.request.method + ' ' + step.request.path));
          assert.ok(visible.includes('Estado HTTP observado: ' + step.response.status));
          assert.ok(visible.includes(step.response.body), scenario.id + ' preserves complete observed body');
          exchanges++;
        }
      }
      await summary.focus(); await page.keyboard.press('Space');
      assert.equal(await entry.evaluate(node => node.open), false, scenario.id + ' native close');
    }
    assert.equal(exchanges, evidence.summary.http_exchanges); assert.deepEqual(errors, []);
    await context.close(); return { scenarios: evidence.summary.scenarios, exchanges, keyboard: 'Enter and Space' };
  });
  await check('Walkthrough anchors reveal the matching captured scenario', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto(base + '/api-acceso.html');
    const link = page.locator('#recorrido a[href="#evidencia-alice_cross_write"]');
    await link.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('evidencia-alice_cross_write').open);
    assert.match(await page.locator('#evidencia-alice_cross_write').innerText(), /PATCH \/reports\/202/);
    await page.close();
  });
  for (const theme of ['dark', 'paper', 'retro']) for (const size of [{ width: 320, scale: 200 }, { width: 1440, scale: 100 }]) {
    await check('Opened evidence reflows and passes axe ' + theme + '/' + size.width + '/' + size.scale, async () => {
      const context = await browser.newContext({ viewport: { width: size.width, height: 900 }, reducedMotion: 'reduce' });
      await context.addInitScript(theme => {
        if (theme === 'paper') localStorage.setItem('iphobiuss:theme', 'paper');
        if (theme === 'retro') localStorage.setItem('iphobiuss:retro', 'on');
      }, theme);
      const page = await context.newPage(); await page.goto(base + '/api-acceso.html#evidencia-alice_cross_write');
      if (size.scale === 200) await page.addStyleTag({ content: 'html{font-size:200%!important}' });
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No page overflow');
      const geometry = await page.locator('[data-http-scenario] > summary').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, height: box.height, scroll: node.scrollWidth, client: node.clientWidth };
      }));
      assert.ok(geometry.every(box => box.left >= 0 && box.right <= size.width + 1 && box.height >= 44 && box.scroll <= box.client + 1), 'Disclosures fit and remain tappable');
      const splitWords = await page.locator('[data-http-scenario] > summary > span').evaluateAll(nodes => nodes.flatMap(node => {
        const text = node.firstChild;
        return [...text.textContent.matchAll(/\S+/g)].flatMap(word => {
          const range = document.createRange(); range.setStart(text, word.index); range.setEnd(text, word.index + word[0].length);
          return new Set([...range.getClientRects()].map(box => Math.round(box.top))).size > 1 ? [word[0]] : [];
        });
      }));
      assert.deepEqual(splitWords, [], 'Scenario headings wrap between whole words');
      await page.evaluate(axeSource);
      const accessibility = await page.evaluate(() => axe.run(document.querySelector('.article-content'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then(result => ({ violations: result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), incomplete: result.incomplete.map(item => item.id) })));
      assert.deepEqual(accessibility.violations, []);
      await page.locator('#evidencia-alice_cross_write').screenshot({ path: path.join(output, theme + '-' + size.width + '-' + size.scale + '.png') });
      if (theme === 'dark' && size.width === 1440) await page.locator('#hipotesis').screenshot({ path: path.join(output, 'hypotheses-1440.png') });
      await context.close(); return { accessibility, disclosures: geometry.length };
    });
  }
  save(); await browser.close(); await new Promise(resolve => server.close(resolve)); console.log(JSON.stringify({ passed: checks.length, output }));
})().catch(async error => { save(error); await browser?.close().catch(() => {}); server.close(); console.error(error.stack); process.exitCode = 1; });
