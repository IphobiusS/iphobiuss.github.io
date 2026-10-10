/* Real HTTP evidence remains inspectable with keyboard, without JS and at 200% text. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { axeSource } = require('./qa-deps.cjs');
const root = path.resolve(process.env.SITE_HTTP_CASE_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_HTTP_CASE_OUTPUT || path.join(__dirname, '../audit-v14.8/http-case'));
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
  await check('All eight explorer choices preserve complete recorded responses without requests', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto(base + '/api-acceso.html#explorador');
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#explorador').scrollIntoViewIfNeeded();
    const before = requests.length;
    for (const identity of ['alice', 'bruno']) for (const object of ['101', '202']) for (const method of ['GET', 'PATCH']) {
      await page.locator('#http-identity').selectOption(identity);
      await page.locator('#http-object').selectOption(object);
      await page.locator('#http-method').selectOption(method);
      await page.locator('[data-http-form] button[type=submit]').click();
      const panel = page.locator('[data-http-result]:visible');
      assert.equal(await panel.count(), 1);
      assert.equal(await panel.getAttribute('data-http-result'), `${identity}:${object}:${method}`);
      const source = await panel.getAttribute('data-http-source');
      const captured = evidence.results.find(row => row.id === source);
      for (const [index, mode] of ['vulnerable', 'fixed'].entries()) {
        const article = panel.locator('article').nth(index);
        assert.deepEqual(await article.locator('pre code').allTextContents(), captured[mode].trace.map(step => step.response.body));
        for (const step of captured[mode].trace) assert.match(await article.innerText(), new RegExp('HTTP ' + step.response.status));
      }
      assert.match(await page.locator('[data-http-state]').innerText(), /no se ha ejecutado una nueva solicitud/);
      const url = new URL(page.url());
      assert.equal(url.searchParams.get('http_identity'), identity);
      assert.equal(url.searchParams.get('http_object'), object);
      assert.equal(url.searchParams.get('http_method'), method);
    }
    assert.deepEqual(requests.slice(before), []);
    assert.deepEqual(errors, []);
    await page.close(); return { combinations: 8, interactionRequests: 0 };
  });
  await check('Explorer works with keyboard, deep links, reload and Back/Forward', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto(base + '/api-acceso.html#explorador');
    await page.locator('#http-identity').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.locator('#http-object').focus(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
    await page.locator('#http-method').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.locator('[data-http-form] button[type=submit]').focus(); await page.keyboard.press('Enter');
    const selected = () => page.locator('[data-http-result]:visible').getAttribute('data-http-result');
    assert.equal(await selected(), 'bruno:101:PATCH');
    const bookmark = page.url();
    await page.reload(); assert.equal(await selected(), 'bruno:101:PATCH');
    await page.locator('[data-http-form] button[type=reset]').click();
    assert.equal(await selected(), 'alice:202:GET');
    await page.goBack(); assert.equal(await selected(), 'bruno:101:PATCH');
    assert.equal(page.url(), bookmark);
    assert.equal(await page.locator('#http-identity').inputValue(), 'bruno');
    await page.goForward(); assert.equal(await selected(), 'alice:202:GET');
    await page.locator('[data-http-result]:visible > a').click();
    await page.waitForFunction(() => document.getElementById('evidencia-alice_cross_read').open);
    await page.goBack(); assert.equal(await selected(), 'alice:202:GET');
    await page.close();
  });
  await check('Unrecognized and duplicated URL values cannot invent an observed scenario', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    for (const query of ['http_identity=bruno&http_method=DELETE', 'http_identity=bruno&http_identity=alice', 'http_object=%3Cimg%20src=x%3E']) {
      await page.goto(base + '/api-acceso.html?' + query + '#explorador');
      assert.equal(await page.locator('[data-http-result]:visible').getAttribute('data-http-result'), 'alice:202:GET');
      assert.match(await page.locator('[data-http-state]').innerText(), /Selección de URL no válida/);
      assert.equal(await page.locator('[data-http-explorer] img').count(), 0);
    }
    await page.close();
  });
  for (const mode of ['no-js', 'script-blocked']) await check('Explorer fallback retains recorded comparison: ' + mode, async () => {
    const context = await browser.newContext({ javaScriptEnabled: mode !== 'no-js', viewport: { width: 320, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    if (mode === 'script-blocked') await page.route('**/assets/js/http-case.js', route => route.abort());
    await page.goto(base + '/api-acceso.html?http_identity=bruno#explorador');
    assert.equal(await page.locator('#http-identity').isDisabled(), true);
    assert.equal(await page.locator('[data-http-result]:visible').getAttribute('data-http-result'), 'alice:202:GET');
    assert.match(await page.locator('[data-http-state]').innerText(), /comparación inicial/);
    assert.match(await page.locator('[data-http-result]:visible').innerText(), /SYNTHETIC_BRUNO_202/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await context.close();
  });
  await check('Storage and History denied leave the comparison usable and explain the link limitation', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      for (const name of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, name, { value() { throw new DOMException('denied', 'SecurityError'); } });
      History.prototype.pushState = () => { throw new DOMException('denied', 'SecurityError'); };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/api-acceso.html#explorador');
    await page.locator('#http-method').selectOption('PATCH');
    await page.locator('[data-http-form] button[type=submit]').click();
    assert.equal(await page.locator('[data-http-result]:visible').getAttribute('data-http-result'), 'alice:202:PATCH');
    assert.match(await page.locator('[data-http-state]').innerText(), /no permitió actualizar el enlace/);
    assert.deepEqual(errors, []);
    await context.close();
  });
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
      await page.locator('#explorador').scrollIntoViewIfNeeded();
      await page.locator('#http-method').selectOption('PATCH');
      await page.locator('[data-http-form] button[type=submit]').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Explorer fits the page');
      const controls = await page.locator('[data-http-form] select,[data-http-form] button').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, height: box.height, scroll: node.scrollWidth, client: node.clientWidth };
      }));
      assert.ok(controls.every(box => box.left >= 0 && box.right <= size.width + 1 && box.height >= 44 && box.scroll <= box.client + 1), 'Explorer controls fit at enlarged text');
      const clippedOptions = await page.locator('[data-http-form] select').evaluateAll(nodes => nodes.flatMap(node => {
        const style = getComputedStyle(node), context = document.createElement('canvas').getContext('2d');
        context.font = style.font;
        const available = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 22;
        return [...node.options].filter(option => context.measureText(option.textContent).width > available).map(option => option.textContent);
      }));
      assert.deepEqual(clippedOptions, [], 'Native select labels remain fully readable');
      const explorerAxe = await page.evaluate(() => axe.run(document.querySelector('#explorador'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then(result => ({ violations: result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), incomplete: result.incomplete.map(item => item.id) })));
      assert.deepEqual(explorerAxe.violations, []);
      await page.locator('#explorador').screenshot({ path: path.join(output, 'explorer-' + theme + '-' + size.width + '-' + size.scale + '.png') });
      if (size.width === 320) await page.locator('[data-http-form]').screenshot({ path: path.join(output, 'form-' + theme + '-320-200.png') });
      await page.locator('#evidencia-alice_cross_write').screenshot({ path: path.join(output, theme + '-' + size.width + '-' + size.scale + '.png') });
      if (theme === 'dark' && size.width === 1440) await page.locator('#hipotesis').screenshot({ path: path.join(output, 'hypotheses-1440.png') });
      await context.close(); return { accessibility, explorerAxe, disclosures: geometry.length };
    });
  }
  for (const filename of ['recorrido.html', 'english.html']) await check('Professional route foregrounds the own HTTP case without JavaScript: ' + filename, async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(base + '/' + filename);
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%', 'important'));
    const ownCase = page.locator(filename === 'english.html' ? '#cases > article' : '#caso-web');
    assert.equal(await ownCase.locator('a').first().getAttribute('href'), 'api-acceso.html#explorador');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (filename === 'english.html') {
      assert.match(await ownCase.innerText(), new RegExp(evidence.summary.scenarios + ' recorded scenarios'));
      assert.match(await ownCase.innerText(), new RegExp(evidence.summary.http_exchanges + ' HTTP exchanges'));
      assert.match(await ownCase.innerText(), /not a client engagement/);
      assert.match(await ownCase.innerText(), /timing side channels/);
      assert.equal(await ownCase.locator('a[href="api-acceso.html#explorador"]').getAttribute('hreflang'), 'es');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '100%', 'important'));
    await page.locator(filename === 'english.html' ? '#cases' : '.journey').screenshot({ path: path.join(output, filename.replace('.html', '') + '-1440.png') });
    await context.close();
  });
  save(); await browser.close(); await new Promise(resolve => server.close(resolve)); console.log(JSON.stringify({ passed: checks.length, output }));
})().catch(async error => { save(error); await browser?.close().catch(() => {}); server.close(); console.error(error.stack); process.exitCode = 1; });
