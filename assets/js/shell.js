/* V15: la terminal del hero acepta comandos. Todo lo que responde sale de #shell-data (generado en el build
   con los mismos datos del sitio) y cada respuesta es texto o un enlace normal. Sin este script, el hero
   muestra la evidencia como enlaces y la terminal permanece oculta (atributo hidden). No hay red, ni eval,
   ni HTML a partir de lo que escribe el visitante. */
(() => {
  'use strict';
  const ui = document.querySelector('[data-shell-ui]');
  const source = document.getElementById('shell-data');
  if (!ui || !source) return;
  let data;
  try { data = JSON.parse(source.textContent); } catch { return; }
  const log = ui.querySelector('[data-shell-log]');
  const form = ui.querySelector('[data-shell-form]');
  const input = ui.querySelector('[data-shell-input]');
  if (!log || !form || !input) return;

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const history = [];
  let cursor = 0, draft = '';
  const MAX_ENTRIES = 6;
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Bloques de salida: líneas de texto, enlaces y listas, siempre construidos como nodos.
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
  const line = text => el('p', 'shell-line', text);
  // Las respuestas de error se distinguen de las normales (comando no encontrado, ruta inexistente).
  const fail = text => el('p', 'shell-line shell-error', text);
  const link = (href, text, external) => {
    const a = el('a', '', text); a.href = href;
    if (external) { a.target = '_blank'; a.rel = 'noopener'; a.append(el('span', 'sr-only', ' (abre otra pestaña)')); }
    if (/\.pdf$/.test(href)) a.setAttribute('download', '');
    return a;
  };
  const rows = items => {
    const list = el('ul', 'shell-list');
    items.forEach(([key, text, href, external]) => {
      const li = el('li');
      li.append(href ? link(href, key, external) : el('span', 'shell-key', key));
      if (text) li.append(el('span', 'shell-desc', text));
      list.append(li);
    });
    return list;
  };

  const go = (href, label) => {
    const out = [line(`Abriendo ${label}…`)];
    setTimeout(() => { location.href = href; }, reduced ? 0 : 280);
    return out;
  };

  // Diccionarios sin prototipo: «cd __proto__» o «constructor» no pueden resolver a propiedades heredadas.
  const table = entries => Object.assign(Object.create(null), entries);
  const dirs = table({
    proyectos: 'proyectos.html', guias: 'guias.html', tecnicas: 'tecnicas.html', herramientas: 'herramientas.html',
    casos: '#habilidades', laboratorio: '#laboratorio', contacto: '#contacto', certificaciones: '#certificaciones',
    cuaderno: 'cuaderno.html', buscar: 'buscar.html',
  });

  const commands = table({
    help: () => [line('Comandos disponibles:'), rows([
      ['whoami', 'quién soy y qué hago'],
      ['ls [carpeta]', 'lista proyectos/, casos/, guias/ o certificaciones/'],
      ['cd <carpeta>', 'abre una sección del sitio'],
      ['certs', 'certificaciones con su verificación'],
      ['cat cv', 'descarga el CV en PDF'],
      ['contacto', 'LinkedIn y GitHub'],
      ['clear', 'limpia la terminal'],
    ])],
    whoami: () => [line(`${data.name}. ${data.role} en ${data.city}.`), line(`Foco: ${data.focus.join(', ')}.`),
      line(`Certificaciones: ${data.certs.map(c => c.name).join(', ')}.`)],
    ls: arg => {
      const target = normalize(arg).replace(/\/$/, '');
      if (!target || target === '~' || target === '.') return [rows([
        ['proyectos/', `${data.projects.length} trabajos propios`], ['casos/', 'retrospectivas HTB documentadas'],
        ['guias/', `${data.counts.guias} guías`], ['tecnicas/', `${data.counts.tecnicas} técnicas`],
        ['herramientas/', `${data.counts.herramientas} herramientas`], ['certificaciones/', `${data.certs.length} credenciales`],
        ['cv.pdf', data.links.cv ? 'currículum' : 'aún no publicado'], ['contacto.txt', 'cómo escribirme'],
      ])];
      if (target === 'proyectos') return [rows(data.projects.map(p => [p.name, p.text, p.href]))];
      if (target === 'casos') return [rows(data.cases.map(c => [c.name, c.text, c.href]))];
      if (target === 'guias') return [rows(data.guides.map(g => [g.name, '', g.href]))];
      if (target === 'certificaciones' || target === 'certs') return commands.certs();
      if (target === 'cv.pdf' || target === 'contacto.txt') return [line(target)];
      if (dirs[target]) return [line(`${target}/ tiene su propia página. Usa: cd ${target}`)];
      return [fail(`ls: no se puede acceder a '${arg}': no existe el archivo o el directorio`)];
    },
    cd: arg => {
      const target = normalize(arg).replace(/\/$/, '');
      if (!target || target === '~' || target === '..') { window.scrollTo({top: 0, behavior: reduced ? 'auto' : 'smooth'}); return [line('~')]; }
      if (dirs[target]) return go(dirs[target], target + '/');
      return [fail(`cd: ${arg}: no existe el directorio. Prueba ls`)];
    },
    certs: () => [line(`${data.certs.length} credenciales; cada nombre abre su verificación oficial.`), rows(data.certs.map(c => [c.name, c.issuer, c.url, true]))],
    cat: arg => {
      const target = normalize(arg);
      if (target === 'cv' || target === 'cv.pdf') return data.links.cv ? [rows([['cv.pdf', data.links.cvPages ? `currículum en PDF, ${data.links.cvPages} páginas` : 'currículum en PDF', data.links.cv]])] : [fail('cat: cv.pdf: aún no publicado')];
      if (target === 'contacto' || target === 'contacto.txt') return commands.contacto();
      if (target === 'evidencia' || target === 'evidencia.txt') return [rows(data.projects.map(p => [p.name, p.text, p.href]))];
      return [fail(`cat: ${arg}: no existe el archivo. Prueba ls`)];
    },
    contacto: () => [line('Busco una oportunidad como Pentester Junior.'), rows([
      ['LinkedIn', 'escríbeme por mensaje', data.links.linkedin, true], ['GitHub', 'código de mis proyectos', data.links.github, true],
      ['Contacto', 'en esta página', data.links.contact],
    ])],
    sudo: () => [fail('iphobiuss no está en el archivo sudoers. Este incidente será reportado.')],
    nmap: () => [line('Aquí sólo escaneo con autorización. La sesión de ejemplo está más abajo: cd laboratorio')],
    prometeo: () => [line('Prometeo y Evaristo cuidan este laboratorio.')],
    evaristo: () => [line('Prometeo y Evaristo cuidan este laboratorio.')],
  });
  const aliases = table({ayuda: 'help', '?': 'help', cv: 'cat cv', contact: 'contacto', proyectos: 'ls proyectos', casos: 'ls casos', guias: 'ls guias', certificaciones: 'certs', id: 'whoami'});
  const names = ['help', 'whoami', 'ls', 'cd', 'certs', 'cat', 'contacto', 'clear', 'proyectos', 'casos', 'guias'];

  function render(raw) {
    const entry = el('div', 'shell-entry');
    const echo = el('p', 'shell-echo'); echo.append(el('span', 'shell-echo-prompt', 'iphobiuss@lab:~$ '), document.createTextNode(raw));
    entry.append(echo);
    let text = normalize(raw);
    if (aliases[text]) text = aliases[text];
    const [cmd, ...rest] = text.split(' ');
    const arg = rest.join(' ');
    let out;
    if (cmd === 'pwd') out = [line('/home/iphobiuss')];
    else if (commands[cmd]) out = commands[cmd](arg);
    else out = [fail(`${raw.split(' ')[0]}: comando no encontrado. Escribe help`)];
    const block = el('div', 'shell-out'); out.forEach(node => block.append(node)); entry.append(block);
    log.append(entry);
    while (log.children.length > MAX_ENTRIES) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  function run(raw) {
    const value = String(raw).slice(0, 120).trim();
    if (!value) return;
    if (history[history.length - 1] !== value) history.push(value);
    cursor = history.length;
    if (normalize(value) === 'clear') { log.replaceChildren(); return; }
    render(value);
  }

  form.addEventListener('submit', event => { event.preventDefault(); run(input.value); input.value = ''; });
  input.addEventListener('keydown', event => {
    // Lo que se estaba escribiendo se conserva al recorrer el historial y vuelve al bajar del último.
    if (event.key === 'ArrowUp' && history.length) { event.preventDefault(); if (cursor === history.length) draft = input.value; cursor = Math.max(0, cursor - 1); input.value = history[cursor]; }
    else if (event.key === 'ArrowDown' && history.length) { event.preventDefault(); cursor = Math.min(history.length, cursor + 1); input.value = cursor === history.length ? draft : history[cursor]; }
    else if (event.key === 'Tab' && !event.shiftKey && input.value.trim() && !input.value.includes(' ')) {
      // Tab completa sólo si hay una coincidencia única; si no, el foco avanza como siempre.
      const matches = names.filter(name => name.startsWith(normalize(input.value)));
      if (matches.length === 1) { event.preventDefault(); input.value = matches[0] + ' '; }
    }
  });
  ui.querySelectorAll('[data-shell-cmd]').forEach(button => button.addEventListener('click', () => {
    run(button.dataset.shellCmd);
    input.focus({preventScroll: true});
  }));
  ui.hidden = false;
  document.documentElement.classList.add('shell-ready');
})();
