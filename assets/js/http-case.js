/* Select pre-rendered, recorded lab evidence. No API calls or persistent storage. */
(() => {
  'use strict';
  const root = document.querySelector('[data-http-explorer]');
  if (!root) return;
  const form = root.querySelector('[data-http-form]');
  const status = root.querySelector('[data-http-state]');
  const results = [...root.querySelectorAll('[data-http-result]')];
  const names = ['http_identity', 'http_object', 'http_method'];
  const defaults = ['alice', '202', 'GET'];
  const allowed = [['alice', 'bruno'], ['101', '202'], ['GET', 'PATCH']];
  const controls = names.map(name => form.elements.namedItem(name));

  function show(values, prefix = '') {
    const selected = results.find(node => node.dataset.httpResult === values.join(':'));
    if (!selected) return;
    results.forEach(node => { node.hidden = node !== selected; });
    controls.forEach((control, index) => { control.value = values[index]; });
    status.textContent = prefix + selected.querySelector('h3').textContent +
      '. Evidencia registrada en dos modos; no se ha ejecutado una nueva solicitud.';
  }

  function restore() {
    const params = new URL(location.href).searchParams;
    let invalid = false;
    const values = names.map((name, index) => {
      const entries = params.getAll(name);
      if (!entries.length) return defaults[index];
      if (entries.length === 1 && allowed[index].includes(entries[0])) return entries[0];
      invalid = true;
      return defaults[index];
    });
    // Do not silently reinterpret one invalid field as a different requested scenario.
    show(invalid ? defaults : values, invalid ? 'Selección de URL no válida. Se muestra el ejemplo inicial. ' : '');
  }

  function choose(values) {
    const url = new URL(location.href);
    names.forEach((name, index) => url.searchParams.set(name, values[index]));
    url.hash = 'explorador';
    let prefix = '';
    try {
      if (url.href !== location.href) history.pushState(null, '', url.href);
    } catch (_) {
      prefix = 'El navegador no permitió actualizar el enlace. ';
    }
    show(values, prefix);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    choose(controls.map(control => control.value));
  });
  form.addEventListener('reset', event => {
    event.preventDefault();
    choose(defaults);
  });
  // Back/Forward and restored pages must show exactly the evidence named by the URL.
  window.addEventListener('popstate', restore);
  window.addEventListener('pageshow', restore);
  restore();
  form.querySelector('fieldset').disabled = false;
})();
