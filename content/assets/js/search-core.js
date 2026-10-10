/* Shared, dependency-free search logic. Complete terms trigger synonyms. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteSearch = api;
})(typeof window === 'undefined' ? this : window, function () {
  'use strict';
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const synonyms = {
    kerberos: ['kerberos', 'kerberoasting', 'as rep', 'silver ticket', 'golden ticket', 'delegacion', 's4u', 'tgt', 'tgs', 'spn', 'pkinit', 'rbcd'],
    ntlm: ['ntlm', 'relay', 'responder', 'ntlmrelayx', 'pass the hash', 'llmnr'],
    relay: ['relay', 'ntlmrelayx', 'responder', 'coercion'],
    adcs: ['adcs', 'certipy', 'certificados', 'esc1', 'esc8', 'esc9', 'shadow credentials'],
    sqli: ['sqli', 'sql injection', 'sqlmap', 'inyeccion sql'],
    xss: ['xss', 'cross site scripting'],
    privesc: ['privesc', 'escalada', 'seimpersonate', 'potato', 'sebackup', 'sudo', 'gtfobins'],
    llm: ['llm', 'prompt injection', 'mcp', 'adversarial', 'poisoning', 'modelo'],
    ia: ['ia', 'ai', 'llm', 'prompt injection', 'mcp', 'adversarial', 'poisoning'],
    ai: ['ai', 'ia', 'llm', 'prompt injection', 'mcp', 'adversarial', 'poisoning'],
    pivot: ['pivot', 'pivoting', 'ligolo', 'chisel', 'tunel', 'portproxy'],
    hash: ['hash', 'hashes', 'hashcat', 'john', 'crack', 'ntlm'],
    dump: ['dump', 'secretsdump', 'lsass', 'pypykatz', 'dpapi'],
    'sql injection': ['sql injection', 'sqli', 'sqlmap', 'inyeccion sql'],
    'inyeccion sql': ['inyeccion sql', 'sql injection', 'sqli', 'sqlmap']
  };
  // These are actual translated routes, not guesses from keywords or suffixes.
  const englishRoutes = new Set(['english.html', 'report-gen-en.html', 'cap-case-en.html', 'forest-case-en.html', 'engineering-notes.html']);
  const routeTypes = {
    'english.html': 'portafolio', 'report-gen-en.html': 'proyectos',
    'cap-case-en.html': 'casos', 'forest-case-en.html': 'casos',
    'engineering-notes.html': 'portafolio', 'bitacora.html': 'portafolio'
  };
  const kindTypes = {
    'Caso': 'casos', 'Simulación': 'casos', 'Laboratorio': 'casos',
    'Guía': 'guias', 'Herramienta': 'herramientas', 'Cheatsheet': 'herramientas',
    'Técnica': 'tecnicas', 'Fundamento': 'fundamentos', 'Glosario': 'fundamentos',
    'Proyecto': 'proyectos', 'Demo': 'proyectos'
  };
  function prepare(records) {
    return records.map((record, index) => {
      const route = String(record.url || '').split(/[?#]/)[0].replace(/^\.\//, '').replace(/^\//, '');
      return {...record, _i: index, _type: routeTypes[route] || kindTypes[record.kind] || 'portafolio',
        _language: englishRoutes.has(route) ? 'en' : 'es',
        _title: normalize(record.title), _category: normalize(record.category || ''), _text: normalize(record.text || '')};
    });
  }
  function termMatches(haystack, term) {
    if (!term) return false;
    // A word boundary allows useful prefixes while never matching inside other words.
    return (' ' + haystack).includes(' ' + term);
  }
  function search(records, query) {
    const q = normalize(query).slice(0, 200);
    if (!q) return [];
    const tokens = q.split(/\s+/);
    const termsFor = term => Object.prototype.hasOwnProperty.call(synonyms, term) && Array.isArray(synonyms[term]) ? synonyms[term] : [term];
    const groups = Object.prototype.hasOwnProperty.call(synonyms, q) ? [termsFor(q)] : tokens.map(termsFor);
    return records.map(record => {
      const title = record._title ?? normalize(record.title);
      const category = record._category ?? normalize(record.category || '');
      const text = record._text ?? normalize(record.text || '');
      const all = title + ' ' + category + ' ' + text;
      if (!groups.every(group => group.some(term => termMatches(all, term)))) return null;
      let score = title === q ? 1000 : title.startsWith(q) ? 300 : title.includes(q) ? 180 : 0;
      score += tokens.filter(token => termMatches(title, token)).length * 40;
      score += tokens.filter(token => termMatches(category, token)).length * 12;
      if (all.includes(q)) score += 10;
      return {...record, score};
    }).filter(Boolean).sort((a, b) => b.score - a.score || (a._i || 0) - (b._i || 0));
  }
  return {normalize, prepare, search};
});
