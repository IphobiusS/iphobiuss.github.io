"""Professional English route and a bounded, browser-only reporting exercise."""
from html import escape
import base64
import hashlib
import json
from datetime import date
from lxml import html

ENGLISH_PAGES = {
    'english.html': ('A short introduction', 'Junior penetration tester in Santiago: documented lab decisions, evidence and a local reporting tool.', 'recorrido.html'),
    'report-gen-en.html': ('report-gen: from evidence to delivery', 'A local report editor with reviewed bulk changes, owner-specific remediation packages, external workspaces and verified update preparation.', 'proyectos.html'),
    'cap-case-en.html': ('Cap: object access and effective privileges', 'An English summary of the documented HTB Cap lab, its decisions, evidence and limits.', 'cap-caso.html'),
    'forest-case-en.html': ('Forest: identity, permissions and replication', 'An English summary of the documented HTB Forest lab, with explicit evidence and limits.', 'forest-caso.html'),
}
ALTERNATES = {value[2]: key for key, value in ENGLISH_PAGES.items()}


def fragment(markup):
    return html.fragment_fromstring(markup, create_parent='div')


def add_resource(tree, tag, **attrs):
    attr = 'href' if tag == 'link' else 'src'
    if not tree.xpath(f'//{tag}[@{attr}="{attrs[attr]}"]'):
        node = html.Element(tag, attrs)
        tree.find('head').append(node)


def demo_widget(language='es'):
    labels = {
        'es': {
            'heading': 'Edita una ficha y comprueba cómo se presenta',
            'scope': 'Ejercicio ficticio en este navegador. Edita los campos: las dos vistas HTML se actualizan mientras escribes. La vista técnica conserva la observación; la ejecutiva destaca la consecuencia y la decisión. No usa IA, no ejecuta pruebas y no genera un informe de report-gen.',
            'legend': 'Datos del ejemplo', 'title': 'Título', 'asset': 'Activo ficticio',
            'severity': 'Severidad ilustrativa', 'severity_value': 'Alta', 'severity_options': ('Informativa', 'Baja', 'Media', 'Alta', 'Crítica'),
            'severity_help': 'La eliges tú para este ejemplo; no se calcula CVSS ni se valida el riesgo.',
            'observation': 'Observación técnica', 'impact': 'Consecuencia para el negocio', 'remedy': 'Acción propuesta',
            'title_value': 'Acceso a documentos de otra cuenta', 'asset_value': 'Portal de documentos · laboratorio local',
            'observation_value': 'En el guion, la cuenta A recibe un documento de la cuenta B al cambiar la referencia solicitada.',
            'impact_value': 'La separación entre cuentas podría fallar y exponer documentos privados de otro cliente ficticio.',
            'remedy_value': 'Validar en el servidor la identidad, el propietario y el permiso sobre cada documento. Repetir controles positivos y negativos.',
            'update': 'Revisar campos', 'reset': 'Restablecer ejemplo', 'technical': 'Lectura técnica', 'executive': 'Lectura ejecutiva',
            'pending': 'Ejemplo sintético · sin prueba ni retest',
            'state': 'La comparación inicial está disponible sin JavaScript. Para editarla, activa JavaScript.',
            'privacy': 'El ejercicio no envía ni guarda tus cambios. Al recargar, vuelve el ejemplo ficticio.',
            'result': 'Comparación de destinatarios',
        },
        'en': {
            'heading': 'Edit one finding, compare two audiences',
            'scope': 'A fictional exercise in this browser. Edit the fields: both HTML previews update as you type. The technical view keeps the observation; the executive view highlights the consequence and decision. This does not use AI, run security tests or generate a report-gen document.',
            'legend': 'Example fields', 'title': 'Title', 'asset': 'Fictional asset',
            'severity': 'Illustrative severity', 'severity_value': 'High', 'severity_options': ('Informational', 'Low', 'Medium', 'High', 'Critical'),
            'severity_help': 'You choose it for this example; no CVSS calculation or risk validation is performed.',
            'observation': 'Technical observation', 'impact': 'Business consequence', 'remedy': 'Proposed action',
            'title_value': 'Access to another account’s documents', 'asset_value': 'Document portal · local laboratory',
            'observation_value': 'In the scenario, account A receives a document belonging to account B after changing the requested reference.',
            'impact_value': 'Account separation could fail and expose another fictional customer’s private documents.',
            'remedy_value': 'Validate identity, ownership and permission for every document on the server. Repeat positive and negative controls.',
            'update': 'Review fields', 'reset': 'Reset example', 'technical': 'Technical reading', 'executive': 'Executive reading',
            'pending': 'Synthetic example · no test or retest',
            'state': 'The initial comparison works without JavaScript. Enable JavaScript to edit it.',
            'privacy': 'This exercise does not send or save your edits. Reloading restores the fictional example.',
            'result': 'Audience comparison',
        },
    }[language]
    e = lambda value: escape(value, quote=True)
    fields = ''
    options = ''.join('<option{}>{}</option>'.format(' selected' if option == labels['severity_value'] else '', e(option)) for option in labels['severity_options'])
    for name in ('title', 'severity', 'asset', 'observation', 'impact', 'remedy'):
        value = e(labels[name + '_value'])
        if name == 'severity':
            control = f'<select id="finding-severity" name="severity" aria-describedby="finding-severity-help">{options}</select><small id="finding-severity-help">{e(labels["severity_help"])}</small>'
        elif name in ('title', 'asset'):
            control = f'<input id="finding-{name}" name="{name}" type="text" maxlength="140" required value="{value}">'
        else:
            control = f'<textarea id="finding-{name}" name="{name}" rows="3" maxlength="700" required>{value}</textarea>'
        fields += f'<div class="finding-field finding-field-{name}"><label for="finding-{name}">{e(labels[name])}</label>{control}</div>'
    def output(name):
        return f'<p data-finding-output="{name}">{e(labels[name + "_value"])}</p>'
    preview = ''
    for audience, field in [('technical', 'observation'), ('executive', 'impact')]:
        preview += f'''<article class="finding-preview" aria-labelledby="finding-{audience}"><p class="finding-audience" id="finding-{audience}">{e(labels[audience])}</p><h4 data-finding-output="title">{e(labels['title_value'])}</h4><p class="finding-asset" data-finding-output="asset">{e(labels['asset_value'])}</p><dl><dt>{e(labels['severity'])}</dt><dd>{output('severity')}</dd><dt>{e(labels[field])}</dt><dd>{output(field)}</dd><dt>{e(labels['remedy'])}</dt><dd>{output('remedy')}</dd></dl><p class="finding-limit">{e(labels['pending'])}</p></article>'''
    return f'''<section id="finding-exercise" class="finding-exercise" data-finding-demo data-language="{language}" aria-labelledby="finding-heading"><h2 id="finding-heading">{e(labels['heading'])}</h2><p id="finding-scope">{e(labels['scope'])}</p><p class="finding-privacy">{e(labels['privacy'])}</p><form data-finding-form aria-describedby="finding-scope" autocomplete="off"><fieldset disabled><legend>{e(labels['legend'])}</legend>{fields}<div class="actions"><button class="button primary" type="submit">{e(labels['update'])}</button><button class="button" type="reset">{e(labels['reset'])}</button></div></fieldset></form><p class="finding-state" data-finding-state role="status" aria-live="polite">{e(labels['state'])}</p><h3>{e(labels['result'])}</h3><div class="finding-comparison">{preview}</div></section>'''


def english_chrome(filename, tree):
    tree.set('lang', 'en')
    header = tree.xpath('//nav[@id="site-nav"]')[0]
    header.set('aria-label', 'Main navigation')
    header.clear()
    header.set('class', 'site-nav'); header.set('id', 'site-nav'); header.set('aria-label', 'Main navigation')
    links = [('english.html', 'Overview'), ('cap-case-en.html', 'Web case'), ('forest-case-en.html', 'AD case'), ('report-gen-en.html', 'report-gen')]
    for href, label in links:
        node = html.Element('a', href=href); node.text = label
        if href == filename: node.set('aria-current', 'page')
        header.append(node)
    for brand in tree.xpath('//a[@class="brand"]'): brand.set('href', 'english.html')
    replacements = {
        'Saltar al contenido': 'Skip to content', 'Menú': 'Menu', 'Buscar': 'Search',
        'Apariencia': 'Appearance', 'Elige tu lectura y el movimiento del fondo.': 'Choose a reading theme and background motion.',
        'Papel ': 'Paper ', 'Fondo animado': 'Background motion',
    }
    for node in tree.iter():
        if node.tag not in ('script', 'style'):
            if node.text in replacements: node.text = replacements[node.text]
            if node.tail in replacements: node.tail = replacements[node.tail]
        translations = {
            'Abrir navegación': 'Open navigation', 'Buscar en el sitio': 'Search the Spanish knowledge base',
            'Buscar (/, Ctrl+K o Command+K)': 'Search in Spanish (/, Ctrl+K or Command+K)',
            'Apariencia y movimiento': 'Appearance and motion',
            'Papel: tema claro': 'Paper: light theme', 'Tema claro para leer: fondo papel, misma tipografía': 'Light paper background for reading',
            'Retro: apariencia CRT': 'Retro: CRT appearance',
            'Retro: paleta verde y bordes pixelados. Líneas CRT solo en portada; se ocultan al pausar o reducir movimiento': 'Retro green palette and pixel borders. CRT lines appear only on the Spanish homepage.',
            'Fondo animado': 'Background motion', 'Pausar o reanudar el fondo animado': 'Pause or resume background motion',
        }
        for attr in ('aria-label', 'title'):
            if node.get(attr) in translations: node.set(attr, translations[node.get(attr)])
    search = tree.xpath('//a[contains(@class,"header-search")]')
    if search: search[0].set('hreflang', 'es')
    footer = tree.xpath('//footer')[0]
    footer.clear(); footer.set('class', 'footer')
    footer.append(fragment('''<div class="shell"><div class="footer-top"><div><a class="brand" href="english.html">iphobiuss</a><p>Sebastián Latorre Muñoz, Santiago, Chile</p></div><div class="footer-links"><a href="english.html">Overview</a><a href="report-gen-en.html">report-gen</a><a href="index.html" hreflang="es" lang="es">Sitio en español</a><a href="feed.xml" hreflang="es">Updates (RSS · Spanish)</a><a href="https://github.com/IphobiusS">GitHub</a><a href="https://www.linkedin.com/in/sebastian-latorre-munoz/">LinkedIn</a></div></div><p class="footer-note">Educational work for controlled laboratories and authorized assessments. HTB cases are lab retrospectives; fictional examples are labelled. These pages do not describe client engagements.</p></div>''')[0])
    # document() creates CSP hashes before this language-specific transformation.
    for script in tree.xpath('//script[@type="application/ld+json"]'):
        old = script.text or ''
        schema = json.loads(old); schema['inLanguage'] = 'en'
        edition = tree.xpath('string(//*[contains(concat(" ",normalize-space(@class)," ")," edition-line ")]//time/@datetime)')
        if edition: schema['dateModified'] = edition
        new = json.dumps(schema, ensure_ascii=False).replace('<', '\\u003c')
        script.text = new
        csp = tree.xpath('//meta[@http-equiv="Content-Security-Policy"]')[0]
        old_hash = base64.b64encode(hashlib.sha256(old.encode()).digest()).decode()
        new_hash = base64.b64encode(hashlib.sha256(new.encode()).digest()).decode()
        csp.set('content', csp.get('content').replace(old_hash, new_hash))


def enhance_document(filename, tree):
    relevant = filename in ENGLISH_PAGES or filename in {'index.html', 'recorrido.html', 'report-gen-demo.html', 'cap-caso.html', 'forest-caso.html', 'proyectos.html'}
    if not relevant: return
    add_resource(tree, 'link', rel='stylesheet', href='assets/css/reading.css')
    if filename == 'index.html':
        eyebrow = tree.xpath('//*[contains(@class,"welcome-lead")]/*[@class="section-eyebrow"]')
        if eyebrow:
            new = html.fragment_fromstring('<nav class="welcome-specialties" aria-label="Especialidades y evidencia"><a href="cap-caso.html">Seguridad web</a><a href="forest-caso.html">Active Directory</a><a href="ia-limites.html">IA / LLM</a></nav>')
            eyebrow[0].getparent().replace(eyebrow[0], new)
        summary = tree.xpath('//details[contains(@class,"readme-en")]')
        if summary:
            summary[0].append(html.fragment_fromstring('<p><a class="text-link" href="english.html" lang="en" hreflang="en">Read the English overview, case summaries and project introduction →</a></p>'))
        # Keep the established hero actions and their keyboard order intact.
        titlebar = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," welcome-titlebar ")]')
        if titlebar:
            titlebar[0].append(html.fragment_fromstring('<a class="welcome-language" href="english.html" hreflang="en" lang="en" aria-label="Read this portfolio in English">English →</a>'))
    if filename == 'report-gen-demo.html':
        container = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," dossier-page ")]')[0]
        container.insert(1, html.fragment_fromstring(demo_widget()))
    if filename in {'report-gen-demo.html', 'report-gen-en.html'}:
        add_resource(tree, 'script', src='assets/js/finding-demo.js', defer='defer')
    if filename in ENGLISH_PAGES:
        english_chrome(filename, tree)
        spanish = ENGLISH_PAGES[filename][2]
        head = tree.find('head')
        head.append(html.Element('link', rel='alternate', hreflang='en', href='https://iphobiuss.github.io/' + filename))
        head.append(html.Element('link', rel='alternate', hreflang='es', href='https://iphobiuss.github.io/' + spanish))
    elif filename in ALTERNATES:
        english = ALTERNATES[filename]
        head = tree.find('head')
        head.append(html.Element('link', rel='alternate', hreflang='es', href='https://iphobiuss.github.io/' + filename))
        head.append(html.Element('link', rel='alternate', hreflang='en', href='https://iphobiuss.github.io/' + english))
        heading = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," page-head ")]/*[contains(@class,"shell")]')
        if heading:
            heading[0].append(html.fragment_fromstring(f'<p class="language-link"><a href="{english}" lang="en" hreflang="en">English summary →</a></p>'))


def build_routes(document, page_head, record, report, root):
    http_summary = json.loads((root / 'content/labs/http-access/resultados.json').read_text(encoding='utf-8'))['summary']
    for filename, (title, description, spanish) in ENGLISH_PAGES.items():
        source = (root / 'content/pages' / filename).read_text(encoding='utf-8')
        source = source.replace('{{REPORT_VERSION}}', escape(report['version']))
        source = source.replace('{{REPORT_DOWNLOAD}}', escape(report['download'], quote=True))
        source = source.replace('{{REPORT_GUIDE}}', escape(report['guide'], quote=True))
        source = source.replace('{{FINDING_DEMO}}', demo_widget('en'))
        source = source.replace('{{HTTP_SCENARIOS}}', str(http_summary['scenarios']))
        source = source.replace('{{HTTP_EXCHANGES}}', str(http_summary['http_exchanges']))
        edition = (report.get('release', {}).get('published_at') or '2026-10-10')[:10] if filename == 'report-gen-en.html' else '2026-10-10'
        day = date.fromisoformat(edition)
        month = ('January','February','March','April','May','June','July','August','September','October','November','December')[day.month-1]
        edition_label = f'{day.day} {month} {day.year}'
        header = f'<div class="page-head"><div class="shell narrow"><p class="crumbs"><a href="english.html">English overview</a> / <a href="{spanish}" lang="es" hreflang="es">Español</a></p><h1>{escape(title)}</h1><p>{escape(description)}</p><p class="edition-line">Updated <time datetime="{edition}">{edition_label}</time></p></div></div>'
        document(filename, title, description, header + '<div class="shell narrow professional-route" lang="en">' + source + '</div>', date_modified=edition)
        record(title + ' (English)', filename, 'English', description, 'Portafolio')
