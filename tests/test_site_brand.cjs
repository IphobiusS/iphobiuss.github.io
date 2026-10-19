/* Real responsive image selection: density, intrinsic ratio and no fallback download. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SITE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.SITE_BRAND_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_BRAND_OUTPUT || path.join(os.tmpdir(), 'iphobiuss-brand-' + process.pid));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const checks = []; let browser;
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(data);
  });
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.SITE_CHROMIUM ? { executablePath: process.env.SITE_CHROMIUM } : {}), args: ['--no-sandbox'] });
  for (const width of [390, 1440]) for (const [index, theme] of ['dark', 'paper', 'retro'].entries()) {
    const density = index + 1, context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: density, reducedMotion: 'reduce' });
    try {
      await context.addInitScript(theme => {
        if (theme === 'paper') localStorage.setItem('iphobiuss:theme', 'paper');
        if (theme === 'retro') localStorage.setItem('iphobiuss:retro', 'on');
      }, theme);
      const page = await context.newPage(), requested = [], errors = [];
      page.on('request', request => requested.push(new URL(request.url()).pathname)); page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/index.html');
      // V15.1: la tarjeta de la portada muestra la ilustración de report-gen (2:1) con variantes WebP.
      const image = page.locator('.report-art img'); await image.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready); await image.evaluate(image => image.decode());
      const actual = await image.evaluate(image => ({ source: new URL(image.currentSrc).pathname, width: image.getBoundingClientRect().width,
        height: image.getBoundingClientRect().height, naturalRatio: image.naturalWidth / image.naturalHeight, density: devicePixelRatio }));
      const widths = [480, 720, 960, 1440, 1774];
      const expected = widths.find(candidate => candidate >= Math.ceil(actual.width * density)) || 1774;
      assert.equal(actual.source, '/assets/img/report-gen-ilustracion-' + expected + '.webp');
      assert.ok(Math.abs(actual.width / actual.height - 2) < 0.01, 'Artwork ratio is preserved');
      assert.ok(Math.abs(actual.naturalRatio - 2) < 0.01);
      if (expected !== 1774) assert.ok(!requested.includes('/assets/img/report-gen-ilustracion-1774.webp'), 'The full-size variant is only fetched when needed');
      assert.deepEqual(errors, []);
      const capture = `brand-${theme}-${width}-${density}x.png`;
      await page.locator('.report-art').screenshot({ path: path.join(output, capture), animations: 'disabled' });
      checks.push({ width, density, theme, ...actual, capture });
    } finally { await context.close(); }
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ browser: browser.version(), checks }, null, 2) + '\n');
  console.log('Responsive artwork: ' + checks.length + '/' + checks.length + ' passed; captures in ' + output);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
});
