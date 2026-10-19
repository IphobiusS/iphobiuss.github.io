/* Native CV access, concise case reading and source-linked engineering notes. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { axeSource } = require('./qa-deps.cjs');
const root = path.resolve(process.env.SITE_PORTFOLIO_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_PORTFOLIO_OUTPUT || path.join(__dirname, '../audit-v14.4/portfolio'));
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const checks = []; let browser;
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return res.writeHead(404).end();
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  });
});
const check = async (name, action) => {
  try { const detail = await action(); checks.push({ name, passed: true, ...(detail || {}) }); console.log('PASS ' + name); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); throw error; }
};
const save = error => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ summary: { total: checks.length, passed: checks.filter(item => item.passed).length, browser: browser?.version() }, checks, ...(error ? { error: error.stack } : {}) }, null, 2) + '\n');
const contextFor = async (options = {}) => {
  const { theme = 'dark', ...rest } = options;
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce', ...rest });
  context.setDefaultTimeout(10000);
  await context.addInitScript(theme => {
    if (theme === 'paper') localStorage.setItem('iphobiuss:theme', 'paper');
    if (theme === 'retro') localStorage.setItem('iphobiuss:retro', 'on');
  }, theme);
  return context;
};
const audit = async page => {
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow');
  const duplicates = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicates, []);
  await page.evaluate(axeSource);
  const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then(result => ({ violations: result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), incomplete: result.incomplete.map(item => item.id) })));
  assert.deepEqual(result.violations, []);
  return result;
};
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.SITE_CHROMIUM, headless: true, args: ['--no-sandbox'] });
  for (const enabled of [true, false]) await check('CV downloads from both introductions, JavaScript ' + enabled, async () => {
    const context = await contextFor({ javaScriptEnabled: enabled }); const page = await context.newPage();
    for (const [file, selector] of [['index.html', '.welcome-links'], ['english.html', '.portfolio-entry-links']]) {
      await page.goto(base + '/' + file);
      const cv = page.locator(selector + ' a[download]');
      assert.equal(await cv.getAttribute('href'), 'downloads/cv-sebastian-latorre.pdf');
      assert.ok(await cv.isVisible());
      const downloadPending = page.waitForEvent('download');
      await cv.focus(); await page.keyboard.press('Enter');
      const download = await downloadPending;
      assert.equal(download.suggestedFilename(), 'cv-sebastian-latorre.pdf');
      assert.equal(await download.failure(), null);
      assert.ok(fs.readFileSync(await download.path()).equals(fs.readFileSync(path.join(root, 'downloads/cv-sebastian-latorre.pdf'))));
    }
    await context.close(); return { downloads: 2, identicalToExistingPDF: true };
  });
  for (const file of ['cap-caso.html', 'forest-caso.html', 'cap-case-en.html', 'forest-case-en.html']) await check('Five-field overview and direct evidence navigation: ' + file, async () => {
    const context = await contextFor(); const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/' + file);
    assert.equal(await page.locator('[data-case-overview] dt').count(), 5);
    assert.equal(await page.locator('.case-support[open]').count(), 0, 'detail is optional initially');
    const targets = file.endsWith('-caso.html') ? ['hipotesis', 'evidencia'] : ['decision-1', 'decision-2', 'decision-3'];
    if (file.endsWith('-caso.html')) {
      assert.equal(await page.locator('[data-case-graph]').isVisible(), true);
      assert.equal(await page.locator('#expediente details').count(), 3);
      assert.ok(await page.locator('#expediente').evaluate(node => !!(node.compareDocumentPosition(document.querySelector('#mapa')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    }
    for (const id of targets) {
      await page.goto(base + '/' + file + '#' + id);
      await page.waitForFunction(id => document.getElementById(id).open, id);
      assert.ok(await page.locator('#' + id + ' .case-support-body').isVisible());
      assert.ok((await page.locator('#' + id + ' .case-support-body').innerText()).length > 150);
    }
    const source = page.locator('.case-support a[href*=".html#"]').first();
    if (await source.count()) {
      const href = await source.getAttribute('href');
      const target = href.split('#');
      const response = await page.request.get(base + '/' + target[0]);
      assert.equal(response.status(), 200);
      assert.ok((await response.text()).includes('id="' + target[1] + '"'));
    }
    assert.deepEqual(errors, []);
    await context.close(); return { directFragments: targets, graphPreserved: file.endsWith('-caso.html') };
  });
  for (const file of ['cap-caso.html', 'forest-case-en.html']) await check('No-JavaScript native case disclosure: ' + file, async () => {
    const context = await contextFor({ javaScriptEnabled: false }); const page = await context.newPage();
    const id = file.endsWith('-caso.html') ? 'evidencia' : 'decision-2';
    await page.goto(base + '/' + file + '#' + id);
    const disclosure = page.locator('#' + id);
    await disclosure.locator(':scope>summary').focus();
    if (!(await disclosure.getAttribute('open') !== null)) await page.keyboard.press('Enter');
    assert.ok(await disclosure.locator('.case-support-body').isVisible());
    assert.ok(await disclosure.locator('a').first().isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await context.close(); return { nativeKeyboard: true, visibleSources: true };
  });
  for (const file of ['bitacora.html', 'engineering-notes.html']) await check('Journal scope, language and sources: ' + file, async () => {
    const context = await contextFor({ javaScriptEnabled: false }); const page = await context.newPage();
    await page.goto(base + '/' + file);
    const language = file === 'bitacora.html' ? 'es' : 'en';
    assert.equal(await page.locator('html').getAttribute('lang'), language);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('.journal-entry').count(), 4);
    assert.equal(await page.locator('[data-journal-kind=project]').count(), 2);
    assert.equal(await page.locator('[data-journal-kind=lab]').count(), 2);
    assert.equal(await page.locator('link[rel=alternate][hreflang=es]').getAttribute('href'), 'https://iphobiuss.github.io/bitacora.html');
    assert.equal(await page.locator('link[rel=alternate][hreflang=en]').getAttribute('href'), 'https://iphobiuss.github.io/engineering-notes.html');
    assert.match(await page.locator('.journal-scope').innerText(), language === 'es' ? /fecha de revisión/ : /review date/);
    for (const href of await page.locator('.journal-sources a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))) {
      if (href.startsWith('https://')) { assert.match(href, /github\.com\/IphobiusS\/report-gen\/blob\/3596d3f55597f9ebb9437139f7437990a352df16\//); continue; }
      const [pathname, fragment] = href.split('#'); const response = await page.request.get(base + '/' + pathname);
      assert.equal(response.status(), 200, href);
      if (fragment) assert.ok((await response.text()).includes('id="' + fragment + '"'), href);
    }
    const schema = await page.locator('script[type="application/ld+json"]').evaluate(node => JSON.parse(node.textContent));
    assert.equal(schema.inLanguage, language); assert.equal(schema.dateModified, '2026-10-10');
    await context.close(); return { ownProjects: 2, labRetrospectives: 2, localizedMetadata: true, localSourcesChecked: true };
  });
  for (const theme of ['dark', 'paper', 'retro']) for (const size of [{ width: 320, scale: 200 }, { width: 1440, scale: 100 }]) await check('Portfolio reflow and accessibility ' + theme + '/' + size.width + '/' + size.scale, async () => {
    const context = await contextFor({ theme, viewport: { width: size.width, height: 900 } }); const page = await context.newPage(); const pages = [];
    for (const file of ['index.html', 'cap-caso.html', 'forest-case-en.html', 'bitacora.html', 'engineering-notes.html']) {
      await page.goto(base + '/' + file);
      if (size.scale === 200) await page.evaluate(() => { const sheet = new CSSStyleSheet(); sheet.replaceSync('html{font-size:200%!important}'); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; });
      if (file === 'cap-caso.html') await page.locator('#evidencia>summary').click();
      if (file === 'forest-case-en.html') await page.locator('#decision-2>summary').click();
      const axe = await audit(page);
      if (file === 'index.html') {
        const links = page.locator('.welcome-links a'); assert.equal(await links.count(), 3);
        const bounds = await links.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, height: r.height }; }));
        assert.ok(bounds.every(item => item.x >= 0 && item.right <= size.width + 1 && item.height >= 44));
        const fragmentedWords = await links.evaluateAll(nodes => nodes.flatMap(node => {
          const fragments = [], walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const text = walker.currentNode;
            for (const word of text.textContent.matchAll(/\S+/g)) {
              const range = document.createRange(); range.setStart(text, word.index); range.setEnd(text, word.index + word[0].length);
              const lines = new Set([...range.getClientRects()].map(rect => Math.round(rect.top)));
              if (lines.size > 1) fragments.push(word[0]);
            }
          }
          return fragments;
        }));
        assert.deepEqual(fragmentedWords, [], 'entry link labels must wrap between whole words');
        if (size.scale === 200) await page.locator('.welcome-links').screenshot({ path: path.join(output, 'cv-links-' + theme + '-' + size.width + '-' + size.scale + '.png') });
      }
      if (theme !== 'retro' && ((size.width === 1440 && ['index.html', 'cap-caso.html', 'bitacora.html'].includes(file)) || (size.width === 320 && ['index.html', 'engineering-notes.html'].includes(file)))) {
        await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
        await page.screenshot({ path: path.join(output, file.replace('.html', '') + '-' + theme + '-' + size.width + '-' + size.scale + '.png'), fullPage: file !== 'index.html' });
      }
      pages.push({ file, axe });
    }
    await context.close(); return { pages };
  });
  save(); await browser.close(); await new Promise(resolve => server.close(resolve)); console.log(JSON.stringify({ passed: checks.length, output }));
})().catch(async error => { save(error); await browser?.close().catch(() => {}); server.close(); console.error(error.stack); process.exitCode = 1; });
