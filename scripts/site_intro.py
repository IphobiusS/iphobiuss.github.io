"""A short, optional terminal entrance; ordinary navigation never waits for it."""
import base64
import hashlib
import re

from lxml import html


# This small bootstrap owns opening, skipping and the deadline. The deferred
# controller only manages preferences: losing its request cannot strand a modal.
# The document contains a closed, hidden native dialog, so blocked JS is harmless.
BOOTSTRAP = r'''(() => {
  'use strict';
  const dialog = document.querySelector('[data-site-intro]');
  const root = document.documentElement;
  if (!dialog || typeof dialog.showModal !== 'function') return;
  let seen = false, stored = true, disabled = false, paused = false;
  try {
    seen = sessionStorage.getItem('iphobiuss:intro') === '1';
    sessionStorage.setItem('iphobiuss:intro', '1');
  } catch { stored = false; }
  try {
    disabled = localStorage.getItem('iphobiuss:intro') === 'off';
    paused = localStorage.getItem('iphobiuss:motion') === 'paused';
  } catch {}
  let type = '', internal = false;
  try { type = performance.getEntriesByType('navigation')[0]?.type || ''; } catch {}
  try { internal = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch {}
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const printing = typeof matchMedia === 'function' ? matchMedia('print') : null;
  if (disabled || paused || root.hasAttribute('data-paused') || !reduced || reduced.matches || printing?.matches || document.hidden || location.hash || type === 'back_forward') return;
  if (type !== 'reload' && (internal || (stored && seen))) return;
  // Late CSS cannot introduce a modal after the visitor has begun using the page.
  // The local stylesheet declares this guard; a missing stylesheet means no intro.
  if (performance.now() > 1800 || getComputedStyle(dialog).getPropertyValue('--site-intro-ready').trim() !== '1') return;
  let closed = false, timer;
  const close = (reason) => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    if (dialog.open) dialog.close();
    dialog.hidden = true;
    document.removeEventListener('visibilitychange', visibility);
    removeEventListener('pagehide', leave);
    removeEventListener('beforeprint', print);
    reduced.removeEventListener?.('change', reduce);
    printing?.removeEventListener?.('change', printChange);
    // Automatic completion preserves the browser's normal starting focus. A
    // deliberate skip takes the keyboard to the site's existing skip link.
    if (reason === 'skip' || reason === 'escape') {
      document.querySelector('a.skip')?.focus({preventScroll: true});
    }
  };
  const visibility = () => { if (document.hidden) close('hidden'); };
  const leave = () => close('pagehide');
  const print = () => close('print');
  const reduce = () => { if (reduced.matches) close('reduced-motion'); };
  const printChange = () => { if (printing.matches) close('print'); };
  dialog.querySelector('[data-intro-skip]').addEventListener('click', () => close('skip'));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close('escape'); });
  dialog.addEventListener('close', () => close('closed'), {once: true});
  document.addEventListener('visibilitychange', visibility);
  addEventListener('pagehide', leave);
  addEventListener('beforeprint', print);
  reduced.addEventListener?.('change', reduce);
  printing?.addEventListener?.('change', printChange);
  window.__iphobiussIntro = {close};
  dialog.hidden = false;
  try { dialog.showModal(); } catch { close('unavailable'); return; }
  timer = setTimeout(() => close('complete'), 1120);
})();'''


def refresh_script_hashes(tree):
    """Hash the final translated scripts, retaining the rest of the CSP policy."""
    policy = tree.xpath('//meta[@http-equiv="Content-Security-Policy"]')[0]
    hashes = []
    for script in tree.xpath('//script[not(@src)]'):
        digest = base64.b64encode(hashlib.sha256((script.text or '').encode()).digest()).decode()
        value = f"'sha256-{digest}'"
        if value not in hashes:
            hashes.append(value)
    content = re.sub(r"(?<=script-src )[^;]+", "'self' " + ' '.join(hashes), policy.get('content'))
    policy.set('content', content)


def enhance_document(filename, tree):
    english = tree.get('lang') == 'en'
    labels = {
        'name': 'Portfolio entrance' if english else 'Entrada al portafolio',
        'description': 'Entering the lab…' if english else 'Entrando al laboratorio…',
        'skip': 'Skip intro' if english else 'Omitir entrada',
        'welcome': 'Welcome.' if english else 'Bienvenido.',
        'cases': 'cases/' if english else 'casos/',
        'tools': 'tools/' if english else 'herramientas/',
        'preference': 'Entrance animation' if english else 'Animación de entrada',
        'state': 'On' if english else 'Activa',
        'note': ('On entry or reload. Respects paused and reduced motion.' if english else
                 'Al entrar o recargar. Respeta la pausa y el movimiento reducido.'),
    }
    dialog = html.fragment_fromstring(f'''<dialog id="site-intro" class="site-intro" data-site-intro data-intro hidden aria-label="{labels['name']}" aria-describedby="intro-description">
      <div class="intro-titlebar"><span class="intro-window-marks" aria-hidden="true"><i></i><i></i><i></i></span><span>iphobiuss:~</span></div>
      <div class="intro-terminal" aria-hidden="true">
        <div class="intro-command"><span class="intro-prompt">$</span><span class="intro-typed">./portfolio</span><span class="intro-cursor"></span></div>
        <div class="intro-line intro-line-cases"><span class="intro-marker">→</span> {labels['cases']}</div>
        <div class="intro-line intro-line-tools"><span class="intro-marker">→</span> {labels['tools']}</div>
        <div class="intro-line intro-line-ready"><span class="intro-prompt">&gt;</span> {labels['welcome']}</div>
      </div>
      <div class="intro-footer"><p id="intro-description">{labels['description']}</p><button class="button intro-skip" type="button" data-intro-skip autofocus>{labels['skip']}<span aria-hidden="true"> ↵</span></button></div>
    </dialog>''')
    body = tree.find('body')
    body.insert(0, dialog)
    bootstrap = html.Element('script')
    bootstrap.text = BOOTSTRAP
    body.insert(1, bootstrap)
    prefix = '/' if filename == '404.html' else ''
    head = tree.find('head')
    head.append(html.Element('link', rel='stylesheet', href=prefix + 'assets/css/intro.css'))
    head.append(html.Element('script', src=prefix + 'assets/js/intro.js', defer='defer'))
    for panel in tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," appearance-panel ")]'):
        panel.append(html.fragment_fromstring(f'''<button type="button" class="icon-button intro-preference" data-intro-preference aria-label="{labels['preference']}" aria-pressed="true" aria-describedby="intro-preference-note" hidden><svg class="tgl-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m5 7 5 5-5 5M13 17h6"/></svg><span class="tgl-text">{labels['preference']} <span data-intro-preference-state aria-hidden="true">{labels['state']}</span></span></button>'''))
        panel.append(html.fragment_fromstring(f'<p id="intro-preference-note" class="intro-preference-note" data-intro-preference-note role="status" hidden>{labels["note"]}</p>'))
    refresh_script_hashes(tree)
