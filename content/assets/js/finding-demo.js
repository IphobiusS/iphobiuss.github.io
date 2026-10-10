/* A bounded formatting exercise: no requests, persistence, HTML parsing or report export. */
(() => {
  'use strict';
  document.querySelectorAll('[data-finding-demo]').forEach(root => {
    const form = root.querySelector('[data-finding-form]');
    const state = root.querySelector('[data-finding-state]');
    const fieldset = form?.querySelector('fieldset');
    if (!form || !state || !fieldset) return;
    const en = root.dataset.language === 'en';
    const messages = en ? {
      ready: 'Ready. Both HTML previews update as you type. Severity is illustrative.',
      updated: 'Both previews updated. No security test or risk calculation was performed.',
      incomplete: 'Complete the empty fields. The previews keep your last complete example.',
      reset: 'Fictional example restored in both previews.'
    } : {
      ready: 'Listo. Las dos vistas HTML cambian mientras escribes. La severidad es ilustrativa.',
      updated: 'Ambas vistas actualizadas. No se ejecutó una prueba ni se calculó el riesgo.',
      incomplete: 'Completa los campos vacíos. Las vistas conservan tu último ejemplo completo.',
      reset: 'Ejemplo ficticio restablecido en ambas vistas.'
    };
    const fields = ['title', 'severity', 'asset', 'observation', 'impact', 'remedy'];
    let announcement;
    const announce = (message, immediate = false) => {
      clearTimeout(announcement);
      if (immediate) state.textContent = message;
      else announcement = setTimeout(() => { state.textContent = message; }, 400);
    };
    const valid = () => {
      for (const name of fields) {
        const input = form.elements.namedItem(name);
        input.setCustomValidity(input.value.trim() ? '' : (en ? 'Complete this field.' : 'Completa este campo.'));
      }
      return form.checkValidity();
    };
    const update = (message, immediate = false) => {
      if (!valid()) { announce(messages.incomplete, immediate); return; }
      for (const name of fields) {
        const input = form.elements.namedItem(name);
        const value = input.value.trim().slice(0, name === 'severity' ? 32 : input.maxLength);
        root.querySelectorAll(`[data-finding-output="${name}"]`).forEach(node => { node.textContent = value; });
      }
      announce(message, immediate);
    };
    form.addEventListener('input', () => update(messages.updated));
    form.addEventListener('change', () => update(messages.updated));
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (valid() && form.reportValidity()) update(messages.updated, true);
    });
    form.addEventListener('reset', () => requestAnimationFrame(() => update(messages.reset, true)));
    fieldset.disabled = false;
    state.textContent = messages.ready;
  });
})();
