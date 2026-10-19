/* Bounded, optional terminal intro: real browser navigation, failure paths and reflow. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { axeSource } = require('./qa-deps.cjs');
const root = path.resolve(process.env.SITE_INTRO_DIST || path.join(__dirname, '../dist'));
const output = path.resolve(process.env.SITE_INTRO_OUTPUT || path.join(__dirname, '../audit-v14.5/intro'));
fs.mkdirSync(output, { recursive: true });
const checks = []; let browser, base;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
const save = fatal => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({
  total: checks.length, passed: checks.filter(check => check.passed).length,
  browser: browser?.version(), checks, ...(fatal ? { fatal: String(fatal.stack || fatal) } : {})
}, null, 2) + '\n');
const check = async (name, fn) => {
  try { const detail = await fn(); checks.push({ name, passed: true, ...detail }); console.log('PASS ' + name); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); throw error; }
};

// Observe before application scripts, without changing the clock or the product's timers.
// Native-method hooks capture an actual opening even when a rapid dismissal occurs in one task.
function observeIntro(options) {
  const audit = window.__introAudit = { documentId: Math.random().toString(36), events: [], csp: [], pageshow: [] };
  let last = false;
  const record = (dialog, origin) => {
    if (!dialog?.matches('[data-site-intro]')) return;
    if (dialog.open !== last) {
      last = dialog.open;
      audit.events.push({ open: last, at: performance.now(), origin });
    }
  };
  for (const name of ['showModal', 'show', 'close']) {
    const native = HTMLDialogElement.prototype[name];
    HTMLDialogElement.prototype[name] = function (...args) {
      const result = native.apply(this, args); record(this, name); return result;
    };
  }
  new MutationObserver(() => record(document.querySelector('[data-site-intro]'), 'mutation')).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
  document.addEventListener('securitypolicyviolation', event => audit.csp.push(event.violatedDirective));
  addEventListener('pageshow', event => audit.pageshow.push({ persisted: event.persisted, at: performance.now() }));
  if (options.textScale === 200) {
    const scale = () => document.documentElement?.style.setProperty('font-size', '200%', 'important');
    scale(); new MutationObserver(scale).observe(document, { childList: true });
  }
  if (options.theme === 'paper') localStorage.setItem('iphobiuss:theme', 'paper');
  if (options.theme === 'retro') localStorage.setItem('iphobiuss:retro', 'on');
  if (options.paused) localStorage.setItem('iphobiuss:motion', 'paused');
  for (const name of options.denied || []) Object.defineProperty(window, name, { get() { throw new DOMException('Storage denied for test', 'SecurityError'); } });
}
async function fresh(options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 1440, height: 900 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference', javaScriptEnabled: options.javascript !== false });
  context.setDefaultTimeout(7000);
  if (options.javascript !== false) await context.addInitScript(observeIntro, options);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors };
}
const state = page => page.evaluate(() => ({ ...window.__introAudit, now: performance.now(), open: !!document.querySelector('[data-site-intro]')?.open, navigation: performance.getEntriesByType('navigation')[0]?.type }));
const opened = page => page.waitForFunction(() => !!document.querySelector('[data-site-intro]')?.open);
const closed = page => page.waitForFunction(() => document.querySelector('[data-site-intro]') && !document.querySelector('[data-site-intro]').open);
async function clean(page, errors) {
  assert.deepEqual(errors, [], 'no uncaught JavaScript errors');
  assert.deepEqual(await page.evaluate(() => window.__introAudit.csp), [], 'no CSP violations');
  assert.equal(await page.locator('[data-site-intro][open]').count(), 0);
  assert.ok(await page.locator('main h1').isVisible());
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-site-intro]')), false, 'focus does not remain in a closed intro');
}
function expectOneCycle(audit) {
  assert.deepEqual(audit.events.map(event => event.open), [true, false]);
  const duration = audit.events[1].at - audit.events[0].at;
  // The 500 ms exit starts at 2 s; an independent 2.6 s deadline covers missing
  // transition events. The navigation guard is separate from this visible time.
  assert.ok(duration <= 3000, 'intro must promptly release the page; measured ' + duration + ' ms');
  return { durationMs: Math.round(duration), navigation: audit.navigation };
}
async function noOpening(page) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(150);
  const audit = await state(page);
  assert.deepEqual(audit.events, [], 'this arrival must not play an intro');
  assert.equal(audit.open, false);
  return audit;
}
async function dismiss(page) {
  await opened(page);
  await page.locator('[data-intro-skip]').click();
  await closed(page);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ ...(process.env.SITE_CHROMIUM ? { executablePath: process.env.SITE_CHROMIUM } : {}), headless: true, args: ['--no-sandbox'] });

  await check('first arrival opens once and releases the page automatically', async () => {
    const { context, page, errors } = await fresh();
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' }); await opened(page);
    const rainBefore = await page.locator('.intro-rain>span').first().evaluate(node => getComputedStyle(node).transform);
    await page.waitForTimeout(140);
    const rainAfter = await page.locator('.intro-rain>span').first().evaluate(node => getComputedStyle(node).transform);
    assert.notEqual(rainAfter, rainBefore, 'the decorative symbols visibly move down while the terminal is open');
    const beforeExit = await page.locator('[data-site-intro]').evaluate(dialog => ({ opacity: getComputedStyle(dialog).opacity, backdrop: getComputedStyle(dialog, '::backdrop').opacity }));
    assert.deepEqual(beforeExit, { opacity: '1', backdrop: '1' }, 'the site remains fully covered before the deliberate reveal');
    await page.waitForFunction(() => document.querySelector('[data-site-intro]').hasAttribute('data-intro-leaving'));
    await page.waitForTimeout(170);
    // V14.11: the exit is a `clear` wipe. Midway, part of the screen is uncovered and the
    // native backdrop has already stepped aside, so it cannot conceal the reveal.
    const midway = await page.locator('[data-site-intro]').evaluate(dialog => ({ open: dialog.open, modal: dialog.matches(':modal'), clip: getComputedStyle(dialog).clipPath, backdrop: Number(getComputedStyle(dialog, '::backdrop').opacity), welcome: Number(getComputedStyle(dialog.querySelector('.intro-line-ready')).opacity), card: getComputedStyle(dialog.querySelector('.intro-card')).transform }));
    const uncovered = (/inset\(0(?:px)? 0(?:px)? ([\d.]+)%/.exec(midway.clip) || [])[1];
    assert.equal(midway.open, true); assert.equal(midway.modal, true, 'the native modal remains active while it clears');
    assert.ok(Number(uncovered) > 0 && Number(uncovered) < 100, 'the screen is partly cleared, neither covered nor gone: ' + midway.clip);
    assert.ok(midway.backdrop < 1, 'the native backdrop steps aside, so it cannot conceal the reveal');
    assert.equal(midway.welcome, 1, 'the welcome line finishes before the exit starts');
    assert.notEqual(midway.card, 'none', 'the terminal moves gently as it leaves');
    await page.screenshot({ path: path.join(output, 'intro-reveal-midpoint.png') });
    await closed(page);
    const result = expectOneCycle(await state(page));
    assert.ok(result.durationMs >= 2400, 'the intended intro actually played');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('iphobiuss:intro')), '1');
    await page.screenshot({ path: path.join(output, 'intro-reveal-complete.png') });
    await clean(page, errors); await context.close(); return { ...result, beforeExit, midway };
  });

  for (const action of ['button', 'Escape', 'reduced-motion']) await check('exit can still be interrupted immediately: ' + action, async () => {
    const { context, page, errors } = await fresh();
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' }); await opened(page);
    await page.waitForFunction(() => document.querySelector('[data-site-intro]').hasAttribute('data-intro-leaving'));
    const before = await page.evaluate(() => performance.now());
    if (action === 'button') {
      // A moving target is intentionally clickable during the transition; use
      // its actual position without waiting for Playwright's stability heuristic.
      const box = await page.locator('[data-intro-skip]').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else if (action === 'Escape') await page.keyboard.press('Escape');
    else await page.emulateMedia({ reducedMotion: 'reduce' });
    await closed(page);
    const audit = await state(page), elapsed = audit.events[1].at - before;
    assert.ok(elapsed < 300, 'an explicit interruption must not wait for the rest of the fade: ' + elapsed);
    if (action !== 'reduced-motion') assert.equal(await page.locator('a.skip').evaluate(link => link === document.activeElement), true, 'deliberate skips move focus to the existing skip link');
    await clean(page, errors); await context.close(); return { ...expectOneCycle(audit), interruptionMs: Math.round(elapsed) };
  });

  await check('missing transition events still release the page by the independent deadline', async () => {
    const { context, page, errors } = await fresh();
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' }); await opened(page);
    await page.evaluate(() => document.querySelector('[data-site-intro]').addEventListener('transitionend', event => event.stopImmediatePropagation(), { capture: true }));
    await closed(page);
    const result = expectOneCycle(await state(page));
    assert.ok(result.durationMs >= 2550, 'the safety deadline, rather than a transition event, closes the dialog');
    await clean(page, errors); await context.close(); return result;
  });

  for (const action of ['button', 'Escape']) await check('immediate dismissal by ' + action, async () => {
    const { context, page, errors } = await fresh();
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' }); await opened(page);
    assert.ok(await page.locator('[data-site-intro]').evaluate(dialog => dialog.matches(':modal')), 'native modal');
    assert.ok(await page.locator('[data-site-intro]').evaluate(dialog => dialog.contains(document.activeElement)), 'keyboard focus is inside modal');
    const before = await page.evaluate(() => performance.now());
    if (action === 'button') await page.locator('[data-intro-skip]').click(); else await page.keyboard.press('Escape');
    await closed(page); const audit = await state(page), result = expectOneCycle(audit);
    assert.ok(audit.events[1].at - before < 500, 'dismissal is immediate');
    await clean(page, errors); await context.close(); return result;
  });

  await check('reload replays; internal navigation and history return do not', async () => {
    const { context, page, errors } = await fresh();
    await page.goto(base + '/index.html'); await dismiss(page);
    await page.reload(); await dismiss(page);
    const home = await state(page); assert.equal(home.navigation, 'reload'); expectOneCycle(home);
    await page.locator('.terminal-directory a[href="guias.html"]').click(); await page.waitForURL('**/guias.html');
    await noOpening(page); await clean(page, errors);
    await page.goBack(); await closed(page);
    const back = await state(page);
    if (back.documentId === home.documentId) assert.deepEqual(back.events, home.events, 'bfcache restoration does not replay');
    else { assert.equal(back.navigation, 'back_forward'); assert.deepEqual(back.events, []); }
    await clean(page, errors); await context.close();
    return { reloadReplays: true, internalNavigationReplays: false, historyReplays: false, bfcacheUsed: back.documentId === home.documentId };
  });

  for (const fragment of ['casos', 'terminal-lab']) await check('direct fragment stays directly accessible: ' + fragment, async () => {
    const { context, page, errors } = await fresh();
    await page.goto(base + '/index.html#' + fragment); await noOpening(page);
    assert.ok(await page.locator('#' + fragment).isVisible());
    assert.equal(new URL(page.url()).hash, '#' + fragment);
    await page.reload(); await noOpening(page); await clean(page, errors);
    await context.close(); return { reloadAlsoSkips: true };
  });

  for (const mode of ['reduced-motion', 'stored-pause']) await check('respects ' + mode, async () => {
    const { context, page, errors } = await fresh({ reduced: mode === 'reduced-motion', paused: mode === 'stored-pause' });
    await page.goto(base + '/index.html'); await noOpening(page);
    await page.reload(); await noOpening(page); await clean(page, errors);
    await context.close(); return { animatedIntroOmitted: true };
  });

  await check('no JavaScript leaves the native document usable', async () => {
    const { context, page } = await fresh({ javascript: false, width: 320 });
    await page.goto(base + '/index.html');
    assert.equal(await page.locator('[data-site-intro]').getAttribute('open'), null);
    assert.equal(await page.locator('[data-site-intro]').isVisible(), false);
    assert.ok(await page.locator('main h1').isVisible());
    await page.locator('.terminal-directory a[href="guias.html"]').click(); await page.waitForURL('**/guias.html');
    assert.ok(await page.locator('main h1').isVisible()); await context.close();
    return { navigationUsable: true, modalInitiallyClosed: true };
  });

  for (const asset of ['css', 'js']) await check('blocked intro.' + asset + ' cannot trap the page', async () => {
    const { context, page, errors } = await fresh();
    await page.route('**/assets/' + asset + '/intro.' + asset, route => route.abort());
    await page.goto(base + '/index.html'); await closed(page);
    const audit = await state(page);
    if (asset === 'css') assert.deepEqual(audit.events, [], 'unstyled intro must remain closed');
    else expectOneCycle(audit);
    await clean(page, errors);
    await page.locator('.terminal-directory a[href="guias.html"]').click(); await page.waitForURL('**/guias.html');
    assert.ok(await page.locator('main h1').isVisible());
    await context.close(); return { cycle: audit.events, nativeNavigationUsable: true };
  });

  await check('late intro controller cannot reopen an already completed intro', async () => {
    const { context, page, errors } = await fresh();
    let release;
    const controller = new Promise(resolve => { release = resolve; });
    await page.route('**/assets/js/intro.js', async route => { await controller; await route.continue(); });
    await page.goto(base + '/index.html', { waitUntil: 'commit' }); await opened(page); await closed(page);
    const before = await state(page); expectOneCycle(before);
    release(); await page.waitForLoadState('load'); await page.waitForTimeout(150);
    assert.deepEqual((await state(page)).events, before.events);
    await clean(page, errors); await context.close(); return { controllerArrivedAfterClose: true, reopened: false };
  });

  for (const denied of [['sessionStorage'], ['localStorage'], ['sessionStorage', 'localStorage']]) await check('storage unavailable: ' + denied.join('+'), async () => {
    const { context, page, errors } = await fresh({ denied });
    await page.goto(base + '/index.html'); await closed(page);
    expectOneCycle(await state(page)); await clean(page, errors);
    await page.locator('.terminal-directory a[href="guias.html"]').click(); await page.waitForURL('**/guias.html');
    await noOpening(page); await clean(page, errors);
    await page.reload(); await closed(page); expectOneCycle(await state(page)); await clean(page, errors);
    await context.close(); return { denied, reloadWorks: true, internalNavigationReplays: false };
  });

  for (const language of ['es', 'en']) await check('appearance preference disables and re-enables the intro: ' + language, async () => {
    const { context, page, errors } = await fresh({ width: 390 });
    const route = language === 'en' ? '/english.html' : '/index.html';
    await page.goto(base + route); await closed(page); expectOneCycle(await state(page));
    await page.evaluate(axeSource);
    await page.locator('[data-appearance]>summary').click();
    const preference = page.locator('[data-intro-preference]');
    const preferenceAxeStates = [];
    const inspectOpenPanel = async state => {
      assert.equal(await page.locator('[data-appearance]').getAttribute('open'), '', 'audit the actually opened appearance panel');
      const result = await page.evaluate(async () => {
        const panel = document.querySelector('[data-appearance]');
        const result = await window.axe.run(panel, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return { violations: result.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) })), incomplete: result.incomplete.map(issue => issue.id) };
      });
      assert.deepEqual(result.violations, [], 'appearance panel ' + language + '/' + state + ' includes its visible state in the accessible button name');
      preferenceAxeStates.push({ state, ...result });
    };
    assert.equal(await preference.getAttribute('aria-pressed'), 'true');
    const enabledText = await page.locator('[data-intro-preference-state]').innerText();
    await inspectOpenPanel('enabled');
    await preference.click(); assert.equal(await preference.getAttribute('aria-pressed'), 'false');
    assert.notEqual(await page.locator('[data-intro-preference-state]').innerText(), enabledText);
    await inspectOpenPanel('disabled');
    assert.equal(await page.evaluate(() => localStorage.getItem('iphobiuss:intro')), 'off');
    await page.reload(); await noOpening(page);
    await page.locator('[data-appearance]>summary').click(); assert.equal(await preference.getAttribute('aria-pressed'), 'false');
    await preference.click(); assert.equal(await preference.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('iphobiuss:intro')), 'on');
    await page.reload(); await closed(page); const result = expectOneCycle(await state(page));
    await clean(page, errors); await context.close(); return { ...result, language, optOutPersists: true, optInPersists: true, preferenceAxeStates };
  });

  await check('appearance option and explanation remain reachable at 320 px and 200% text', async () => {
    const { context, page, errors } = await fresh({ width: 320, textScale: 200, reduced: true });
    await page.goto(base + '/index.html'); await noOpening(page);
    await page.locator('[data-appearance]>summary').click();
    const preference = page.locator('[data-intro-preference]');
    await preference.scrollIntoViewIfNeeded(); await preference.focus();
    const bounds = await preference.evaluate(button => {
      const rect = button.getBoundingClientRect(), panel = button.closest('.appearance-panel'), box = panel.getBoundingClientRect();
      return { button: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }, panel: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight }, width: innerWidth, height: innerHeight, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    assert.equal(bounds.horizontalOverflow, false);
    assert.ok(bounds.button.top >= Math.max(0, bounds.panel.top) - 1 && bounds.button.bottom <= Math.min(bounds.height, bounds.panel.bottom) + 1, 'preference is inside the visible scroll panel');
    assert.ok(bounds.button.left >= -1 && bounds.button.right <= bounds.width + 1);
    await page.keyboard.press('Enter'); assert.equal(await preference.getAttribute('aria-pressed'), 'false');
    const note = page.locator('[data-intro-preference-note]'); await note.scrollIntoViewIfNeeded();
    assert.ok(await note.evaluate(node => { const r = node.getBoundingClientRect(), panel = node.closest('.appearance-panel').getBoundingClientRect(); return r.top >= Math.max(0, panel.top) - 1 && r.bottom <= Math.min(innerHeight, panel.bottom) + 1; }), 'explanation can be read inside the panel');
    const screenshot = 'appearance-dark-320-text200.png'; await page.screenshot({ path: path.join(output, screenshot) });
    await page.keyboard.press('Escape'); assert.equal(await page.locator('[data-appearance]').getAttribute('open'), null);
    await clean(page, errors); await context.close(); return { bounds, screenshot, keyboardToggleWorks: true };
  });

  for (const theme of ['dark', 'paper', 'retro']) for (const width of [320, 1440]) for (const textScale of [100, 200]) await check(`intro reflow ${theme}/${width}/${textScale}`, async () => {
    const { context, page, errors } = await fresh({ theme, width, textScale });
    // Loading axe before the document keeps its source compilation outside the short visible interval.
    await context.addInitScript(axeSource);
    await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' }); await opened(page);
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.locator('[data-site-intro]').evaluate(dialog => {
      const box = dialog.getBoundingClientRect(), skip = dialog.querySelector('[data-intro-skip]'), button = skip.getBoundingClientRect();
      const titlebar = dialog.querySelector('.intro-titlebar').getBoundingClientRect();
      const rain = dialog.querySelector('.intro-rain');
      const backdrop = getComputedStyle(dialog, '::backdrop');
      const opacity = { dialog: getComputedStyle(dialog).backgroundColor, backdrop: backdrop.backgroundColor, backdropOpacity: backdrop.opacity };
      const cornerTargets = [[1, 1], [innerWidth - 1, 1], [1, innerHeight - 1], [innerWidth - 1, innerHeight - 1]].map(([x, y]) => document.elementFromPoint(x, y) === dialog);
      const matrix = { count: rain.children.length, decorative: rain.getAttribute('aria-hidden') === 'true', animation: getComputedStyle(rain.firstElementChild).animationName, movement: getComputedStyle(rain.firstElementChild).transform };
      const clipped = [];
      const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode;
        if (!text.textContent.trim() || text.parentElement.closest('.sr-only,.intro-rain')) continue;
        const style = getComputedStyle(text.parentElement);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const range = document.createRange(); range.selectNodeContents(text);
        for (const rect of range.getClientRects()) if (rect.width && (rect.left < box.left - 1 || rect.right > box.right + 1)) clipped.push(text.textContent.trim());
      }
      // Animated opacity makes axe's screenshot contrast check inconclusive. Inspect
      // the actual resolved opaque foreground/background pairs for their final state.
      const rgb = color => {
        const values = color.match(/[\d.]+/g).map(Number);
        if (!color.startsWith('rgb') || (values.length === 4 && values[3] !== 1 && values[3] !== 0)) throw new Error('Unexpected non-opaque color: ' + color);
        return values;
      };
      const luminance = values => values.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const contrast = [...dialog.querySelectorAll('.intro-titlebar,.intro-terminal,.intro-prompt,.intro-marker,.intro-line-ready,.intro-footer p,.intro-skip')].map(node => {
        const foreground = getComputedStyle(node).color;
        let ancestor = node, background;
        while (ancestor) {
          const color = getComputedStyle(ancestor).backgroundColor, components = rgb(color);
          if (components.length === 3 || components[3] === 1) { background = color; break; }
          ancestor = ancestor.parentElement;
        }
        if (!background) throw new Error('No solid intro background found');
        const a = luminance(rgb(foreground)), b = luminance(rgb(background));
        return { selector: node.className || node.tagName, foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
      });
      return { open: dialog.open, opacity, cornerTargets, matrix, dialog: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, scrollTop: dialog.scrollTop }, titlebar: { top: titlebar.top, bottom: titlebar.bottom }, button: { width: button.width, height: button.height, top: button.top, bottom: button.bottom }, viewport: { width: innerWidth, height: innerHeight }, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, clipped, finalStateContrast: contrast };
    });
    assert.equal(geometry.open, true, 'geometry measured while the intro is visible');
    assert.deepEqual(geometry.opacity, { dialog: 'rgb(2, 8, 6)', backdrop: 'rgb(2, 8, 6)', backdropOpacity: '1' }, 'both fullscreen dialog and native backdrop are completely opaque');
    assert.deepEqual(geometry.cornerTargets, [true, true, true, true], 'the intro covers every viewport corner');
    assert.equal(geometry.matrix.decorative, true); assert.equal(geometry.matrix.count, 30);
    assert.equal(geometry.matrix.animation, 'intro-rain'); assert.notEqual(geometry.matrix.movement, 'none');
    assert.equal(geometry.horizontalOverflow, false); assert.deepEqual(geometry.clipped, []);
    assert.ok(geometry.dialog.left >= -1 && geometry.dialog.right <= width + 1, 'dialog fits viewport width');
    assert.ok(geometry.dialog.top >= -1 && geometry.dialog.bottom <= 901, 'dialog fits viewport height');
    assert.equal(geometry.dialog.scrollTop, 0, 'autofocus must not scroll the dialog header away');
    assert.ok(geometry.titlebar.top >= geometry.dialog.top - 1 && geometry.titlebar.bottom <= geometry.dialog.bottom + 1, 'titlebar stays visible');
    assert.ok(geometry.button.height >= 44 && geometry.button.width >= 44, 'skip has a touch-sized target');
    assert.ok(geometry.button.top >= 0 && geometry.button.bottom <= 901, 'skip remains in view');
    for (const pair of geometry.finalStateContrast) assert.ok(pair.ratio >= 4.5, pair.selector + ': final-state contrast must meet AA, measured ' + pair.ratio);
    const axe = await page.evaluate(async () => {
      const dialog = document.querySelector('[data-site-intro]'), wasOpen = dialog.open;
      const result = await window.axe.run(dialog, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      return { wasOpen, remainedOpen: dialog.open, violations: result.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) })), incomplete: result.incomplete.map(issue => issue.id) };
    });
    assert.equal(axe.wasOpen, true, 'axe starts on the visible dialog');
    assert.equal(axe.remainedOpen, true, 'axe finishes before automatic dismissal');
    assert.deepEqual(axe.violations, []);
    let screenshot;
    if ((textScale === 100 && ((width === 1440 && ['dark', 'paper'].includes(theme)) || (width === 320 && theme === 'dark'))) || (textScale === 200 && width === 320 && theme === 'dark')) {
      screenshot = `intro-${theme}-${width}${textScale === 200 ? '-text200' : ''}.png`;
      // Capture the completed decorative lines, without extending the real intro.
      const remaining = await page.evaluate(() => 1750 - (performance.now() - window.__introAudit.events[0].at));
      if (remaining > 0) await page.waitForTimeout(remaining);
      assert.ok(await page.locator('[data-site-intro]').evaluate(dialog => dialog.open));
      await page.screenshot({ path: path.join(output, screenshot), fullPage: false });
      assert.ok(await page.locator('[data-site-intro]').evaluate(dialog => dialog.open), 'capture completes before dismissal');
    }
    await closed(page); const timing = expectOneCycle(await state(page)); await clean(page, errors);
    await context.close(); return { geometry, axe, ...timing, ...(screenshot ? { screenshot } : {}) };
  });

  save(); await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({ passed: checks.length, output }));
})().catch(async error => { save(error); await browser?.close().catch(() => {}); server.close(); console.error(error.stack); process.exitCode = 1; });
