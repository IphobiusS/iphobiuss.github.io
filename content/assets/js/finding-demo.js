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
      ready: 'Ready. Edit the fictional fields, then update the comparison.',
      updated: 'Both readings updated. No security test was performed.',
      reset: 'Fictional example restored in both readings.'
    } : {
      ready: 'Listo. Edita los campos ficticios y actualiza la comparación.',
      updated: 'Ambas lecturas actualizadas. No se ejecutó ninguna prueba de seguridad.',
      reset: 'Ejemplo ficticio restablecido en ambas lecturas.'
    };
    const update = message => {
      for (const name of ['title', 'asset', 'observation', 'impact', 'remedy']) {
        const input = form.elements.namedItem(name);
        const value = input.value.trim().slice(0, input.maxLength);
        root.querySelectorAll(`[data-finding-output="${name}"]`).forEach(node => { node.textContent = value; });
      }
      state.textContent = message;
    };
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (form.reportValidity()) update(messages.updated);
    });
    form.addEventListener('reset', () => requestAnimationFrame(() => update(messages.reset)));
    fieldset.disabled = false;
    state.textContent = messages.ready;
  });
})();
