"""Progressively enhanced search facets; the native catalogue remains available."""
from lxml import html


def enhance_document(filename, tree):
    if filename != 'buscar.html':
        return
    tree.find('head').append(html.Element('link', rel='stylesheet', href='assets/css/search-filters.css'))
    form = tree.xpath('//form[@role="search"]')[0]
    form.set('id', 'search-main-form')
    wrapper = form.getparent()
    controls = html.fragment_fromstring('''
<fieldset class="search-filters search-interactive" aria-describedby="search-filter-help">
  <legend>Afinar resultados</legend>
  <div class="search-filter-controls">
    <label for="search-type">Tipo de contenido
      <select id="search-type" name="tipo" form="search-main-form" data-search-type>
        <option value="" data-label="Todos los tipos">Todos los tipos</option>
        <option value="casos" data-label="Casos">Casos</option>
        <option value="guias" data-label="Guías">Guías</option>
        <option value="herramientas" data-label="Herramientas">Herramientas</option>
        <option value="tecnicas" data-label="Técnicas">Técnicas</option>
        <option value="fundamentos" data-label="Fundamentos">Fundamentos</option>
        <option value="proyectos" data-label="Proyectos">Proyectos</option>
        <option value="portafolio" data-label="Portafolio">Portafolio</option>
      </select>
    </label>
    <label for="search-language">Idioma del contenido
      <select id="search-language" name="idioma" form="search-main-form" data-search-language>
        <option value="" data-label="Ambos idiomas">Ambos idiomas</option>
        <option value="es" data-label="Español">Español</option>
        <option value="en" data-label="English" lang="en">English</option>
      </select>
    </label>
    <button class="button" type="button" data-search-filters-clear disabled>Quitar filtros</button>
  </div>
  <p class="search-filter-selection" data-search-filter-selection aria-hidden="true"><span data-search-selected-type></span><span data-search-selected-language></span></p>
  <p id="search-filter-help">Puedes elegir un filtro sin escribir una consulta. Los conteos incluyen páginas y secciones; cada idioma aparece por separado. Casos reúne laboratorios y simulaciones. La bitácora está en Portafolio.</p>
</fieldset>''')
    wrapper.addnext(controls)
    empty = tree.get_element_by_id('search-empty')
    paragraph = empty.find('p')
    paragraph.text = 'Prueba otro término, cambia el idioma o quita los filtros. También puedes '
    reset = html.fragment_fromstring('<button class="button" type="button" data-search-reset-query>Borrar consulta</button>')
    empty.append(reset)
    for anchor in tree.xpath('//*[contains(concat(" ", normalize-space(@class), " "), " search-fallback ")]//a'):
        route = anchor.get('href', '').split('#')[0].split('?')[0]
        if route in {'english.html', 'report-gen-en.html', 'cap-case-en.html', 'forest-case-en.html', 'engineering-notes.html'}:
            anchor.set('lang', 'en')
            anchor.set('hreflang', 'en')
