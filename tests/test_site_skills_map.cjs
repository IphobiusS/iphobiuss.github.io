/* Verify that the evidence map is reachable, linked and usable at small sizes. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { axeSource } = require('./qa-deps.cjs');
const root = path.resolve(process.env.SITE_SKILLS_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_SKILLS_OUTPUT || path.join(__dirname, '../audit-v14.6/skills'));
const checks = []; let browser;
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
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
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.SITE_CHROMIUM, headless: true, args: ['--no-sandbox'] });
  await check('Every evidence link resolves to its intended public page or fragment', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto(base + '/index.html');
    const links = await page.locator('#habilidades a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    assert.equal(links.length, 8);
    for (const href of links) {
      const [file, fragment] = href.split('#');
      const response = await page.request.get(base + '/' + file);
      assert.equal(response.status(), 200, href);
      if (fragment) assert.ok((await response.text()).includes('id="' + fragment + '"'), href);
    }
    const scopedText = await page.locator('#habilidades').innerText();
    assert.match(scopedText, /PCAP original ni un retest/);
    assert.match(scopedText, /sin un LLM real/);
    assert.match(scopedText, /no representa un encargo de cliente/);
    await page.close(); return { linksChecked: links.length };
  });
  for (const enabled of [true, false]) await check('Keyboard opens evidence with JavaScript ' + enabled, async () => {
    const context = await browser.newContext({ javaScriptEnabled: enabled, reducedMotion: 'reduce', viewport: { width: 320, height: 900 } });
    const page = await context.newPage(); await page.goto(base + '/index.html#habilidades');
    const link = page.locator('#habilidades a').first();
    await link.focus(); assert.equal(await link.evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#habilidades a').nth(1).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter');
    await page.waitForURL(base + '/cap.html#idor');
    assert.ok(await page.locator('#idor').isVisible());
    await context.close(); return { nativeNavigation: true };
  });
  for (const theme of ['dark', 'paper', 'retro']) for (const size of [{ width: 320, scale: 200 }, { width: 1440, scale: 100 }]) {
    await check('Evidence map reflow and accessibility ' + theme + '/' + size.width + '/' + size.scale, async () => {
      const context = await browser.newContext({ viewport: { width: size.width, height: 900 }, reducedMotion: 'reduce' });
      await context.addInitScript(theme => {
        if (theme === 'paper') localStorage.setItem('iphobiuss:theme', 'paper');
        if (theme === 'retro') localStorage.setItem('iphobiuss:retro', 'on');
      }, theme);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/index.html#habilidades');
      if (theme === 'paper') assert.equal(await page.locator('html').getAttribute('data-theme'), 'paper');
      if (theme === 'retro') assert.equal(await page.locator('html').getAttribute('data-retro'), 'on');
      if (size.scale === 200) await page.addStyleTag({ content: 'html{font-size:200%!important}' });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('#habilidades').count(), 1);
      assert.equal(await page.locator('.skill-evidence-card').count(), 4);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal page overflow');
      const splitHeadings = await page.locator('#habilidades h2,#habilidades h3').evaluateAll(nodes => nodes.flatMap(node => {
        const failures = [], text = node.firstChild;
        for (const word of text.textContent.matchAll(/\S+/g)) {
          const range = document.createRange(); range.setStart(text, word.index); range.setEnd(text, word.index + word[0].length);
          if (new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1) failures.push(word[0]);
        }
        return failures;
      }));
      assert.deepEqual(splitHeadings, [], 'headings must wrap between whole words');
      const geometry = await page.locator('#habilidades a').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right, height: r.height, scroll: node.scrollWidth, client: node.clientWidth };
      }));
      assert.ok(geometry.every(r => r.left >= 0 && r.right <= size.width + 1 && r.height >= 44 && r.scroll <= r.client + 1), 'clipped or undersized evidence link');
      const cards = await page.locator('.skill-evidence-card').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left) };
      }));
      assert.equal(new Set(cards.map(r => r.left)).size, size.width === 320 ? 1 : 2);
      await page.evaluate(axeSource);
      const accessibility = await page.evaluate(() => axe.run(document.querySelector('#habilidades'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then(result => ({ violations: result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), incomplete: result.incomplete.map(item => item.id) })));
      assert.deepEqual(accessibility.violations, []);
      assert.deepEqual(errors, []);
      await page.locator('#habilidades').screenshot({ path: path.join(output, theme + '-' + size.width + '-' + size.scale + '.png') });
      await context.close(); return { accessibility, targets: geometry.length, columns: new Set(cards.map(r => r.left)).size };
    });
  }
  save(); await browser.close(); await new Promise(resolve => server.close(resolve)); console.log(JSON.stringify({ passed: checks.length, output }));
})().catch(async error => { save(error); await browser?.close().catch(() => {}); server.close(); console.error(error.stack); process.exitCode = 1; });
