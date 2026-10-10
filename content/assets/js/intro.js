/* Preference controls never open the dialog. Its inline bootstrap owns the
   entire entrance and closes it even when this file is absent or arrives late. */
(() => {
  'use strict';
  const root = document.documentElement;
  const button = document.querySelector('[data-intro-preference]');
  if (!button) return;
  const state = button.querySelector('[data-intro-preference-state]');
  const note = document.querySelector('[data-intro-preference-note]');
  const english = root.lang === 'en';
  const key = 'iphobiuss:intro';
  let enabled = true, saved = true;
  const close = reason => window.__iphobiussIntro?.close(reason);
  const read = () => { try { enabled = localStorage.getItem(key) !== 'off'; } catch {} };
  function render() {
    button.setAttribute('aria-pressed', String(enabled));
    state.textContent = english ? (enabled ? 'On' : 'Off') : (enabled ? 'Activa' : 'Desactivada');
    note.textContent = !saved
      ? (english ? 'This change applies to this page only; your browser could not save it.' : 'El cambio solo se aplica en esta página; el navegador no pudo guardarlo.')
      : enabled
        ? (english ? 'On entry or reload. Respects paused and reduced motion.' : 'Al entrar o recargar. Respeta la pausa y el movimiento reducido.')
        : (english ? 'Disabled on entry and reload. Enable it here whenever you want.' : 'Desactivada al entrar y recargar. Puedes activarla aquí cuando quieras.');
  }
  read();
  render();
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(key, enabled ? 'on' : 'off'); saved = true; } catch { saved = false; }
    if (!enabled) close('preference');
    render();
  });
  button.hidden = false;
  note.hidden = false;
  addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      read(); saved = true; render();
      if (!enabled) close('preference');
    }
    if (event.key === 'iphobiuss:motion' && event.newValue === 'paused') close('paused');
  });
  // The site's existing pause control updates this attribute in the same tab.
  const dialog = document.querySelector('[data-site-intro]');
  if (dialog?.open) {
    const observer = new MutationObserver(() => {
      if (root.hasAttribute('data-paused')) close('paused');
      if (!dialog.open) observer.disconnect();
    });
    observer.observe(root, {attributes: true, attributeFilter: ['data-paused']});
    dialog.addEventListener('close', () => observer.disconnect(), {once: true});
    if (root.hasAttribute('data-paused')) close('paused');
  }
})();
