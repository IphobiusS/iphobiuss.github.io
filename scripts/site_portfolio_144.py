"""Concise case entry points and evidence-linked engineering notes."""
from html import escape
import json

from lxml import etree, html

import site_evolution_142


REVIEW_DATE = '2026-10-10'
REPORT_COMMIT = '3596d3f55597f9ebb9437139f7437990a352df16'
REPORT_SOURCE = 'https://github.com/IphobiusS/report-gen/blob/' + REPORT_COMMIT + '/'
JOURNAL_PAGES = {
    'bitacora.html': (
        'Bitácora de decisiones técnicas',
        'Cuatro decisiones explicadas con su problema, evidencia y límites: proyectos propios y retrospectivas de laboratorios HTB.',
        'engineering-notes.html',
    ),
    'engineering-notes.html': (
        'Engineering notes',
        'Four decisions with their problem, evidence and limits, distinguishing personal software projects from HTB lab retrospectives.',
        'bitacora.html',
    ),
}


def element(markup):
    return html.fragment_fromstring(markup)


def has_class(name):
    return 'contains(concat(" ", normalize-space(@class), " "), " ' + name + ' ")'


def link(href, label, **attributes):
    node = html.Element('a', href=href, **attributes)
    node.text = label
    return node


CASE_SUMMARIES = {
    'cap': {
        'es': [
            ('Problema', 'Una descarga expone tráfico de otra sesión del laboratorio.'),
            ('Decisión', 'Comparar objetos, comprobar la reutilización de credenciales y revisar privilegios efectivos.'),
            ('Evidencia', 'La guía documenta snapshots distintos, autenticación FTP, acceso SSH y CAP_SETUID en Python.'),
            ('Resultado', 'Acceso SSH como nathan y cambio a UID 0, según la guía.'),
            ('Límite', 'Retrospectiva HTB: sin PCAP original ni transcripción independiente; sin remediación verificada.'),
        ],
        'en': [
            ('Problem', 'A download exposes traffic from another lab session.'),
            ('Decision', 'Compare objects, check credential reuse and inspect effective privileges.'),
            ('Evidence', 'The guide documents distinct captures, FTP authentication, SSH access and Python CAP_SETUID.'),
            ('Result', 'SSH access as nathan and a change to UID 0, as described in the guide.'),
            ('Limit', 'HTB retrospective: no original PCAP or independent transcript; no verified remediation.'),
        ],
    },
    'forest': {
        'es': [
            ('Problema', 'Preautenticación Kerberos deshabilitada y permisos delegados permiten encadenar accesos.'),
            ('Decisión', 'Separar identidad, membresías y permisos para explicar qué derecho habilita cada salto.'),
            ('Evidencia', 'La guía documenta AS-REP, WinRM, relaciones de grupo, WriteDacl y DCSync.'),
            ('Resultado', 'Acceso como Administrator mediante Pass-the-Hash después de DCSync, según la guía.'),
            ('Límite', 'Sin AS-REP original ni ACLs exportadas. DCSync no acredita pertenencia a Domain Admins ni un retest.'),
        ],
        'en': [
            ('Problem', 'Disabled Kerberos pre-authentication and delegated permissions connect successive access steps.'),
            ('Decision', 'Separate identity, memberships and permissions to explain the right behind each step.'),
            ('Evidence', 'The guide documents AS-REP, WinRM, group relations, WriteDacl and DCSync.'),
            ('Result', 'Access as Administrator through Pass-the-Hash after DCSync, as described in the guide.'),
            ('Limit', 'No original AS-REP or exported ACLs. DCSync does not establish Domain Admins membership or a retest.'),
        ],
    },
}


def case_summary(guide, english=False):
    language = 'en' if english else 'es'
    title = 'The case at a glance' if english else 'El caso en un vistazo'
    rows = ''.join('<div><dt>' + escape(label) + '</dt><dd>' + escape(text) + '</dd></div>'
                   for label, text in CASE_SUMMARIES[guide][language])
    return element(f'<section class="case-overview" aria-labelledby="case-overview-title"><h2 id="case-overview-title">{title}</h2><dl class="case-synthesis" data-case-overview>{rows}</dl></section>')


def disclose_section(section, title=None):
    """Keep the original fragment on the native disclosure and preserve its body."""
    parent = section.getparent()
    index = parent.index(section)
    details = html.Element('details', {'class': 'case-support'})
    if section.get('id'):
        details.set('id', section.attrib.pop('id'))
    summary = etree.SubElement(details, 'summary')
    heading = section.xpath('./h2 | ./div[' + has_class('sec-head') + ']/h2')
    label = title or (heading[0].text_content() if heading else '')
    etree.SubElement(summary, 'h2').text = label
    if heading:
        old_heading = heading[0]
        if old_heading.getparent().get('class') == 'sec-head':
            old_heading.getparent().getparent().remove(old_heading.getparent())
        else:
            old_heading.getparent().remove(old_heading)
    section.tag = 'div'
    section.set('class', 'case-support-body')
    parent.remove(section)
    details.append(section)
    parent.insert(index, details)
    return details


def enhance_cases(filename, tree):
    english = filename.endswith('-case-en.html')
    guide = filename.split('-')[0]
    if english:
        container = tree.xpath('//*[' + has_class('professional-route') + ']')[0]
        # The existing English introduction becomes the five-field overview.
        lead = container.xpath('./p[' + has_class('lead') + ']')
        if lead:
            container.replace(lead[0], case_summary(guide, True))
        for index, section in enumerate(list(container.xpath('./section[not(@class="case-overview")]')), 1):
            if not section.get('id'):
                section.set('id', f'decision-{index}')
            disclose_section(section)
        nav = element('<nav class="case-reading-nav" aria-label="Case details"><a href="#decision-1">Object and identity</a><a href="#decision-2">Evidence and permissions</a><a href="#decision-3">Result and remediation</a></nav>')
        overview = container.xpath('./section[@class="case-overview"]')[0]
        container.insert(container.index(overview) + 1, nav)
        # An explicit source boundary stays visible even when details are closed.
    else:
        container = tree.xpath('//*[' + has_class('article-content') + ']')[0]
        existing = container.xpath('./dl[' + has_class('case-synthesis') + ']')
        if existing:
            container.replace(existing[0], case_summary(guide))
        # Readers first choose a reasoning step; the full graph remains visible below.
        dossier = container.xpath('./section[@id="expediente"]')[0]
        graph = container.xpath('./section[@id="mapa"]')[0]
        container.remove(dossier)
        container.insert(container.index(graph), dossier)
        for section in list(container.xpath('./section[@id="hipotesis" or @id="evidencia"]')):
            disclose_section(section)
        for nav in tree.xpath('//nav[@aria-label="Índice del caso" or @aria-label="Índice móvil"]'):
            links = nav.xpath('./a[@href="#expediente"]')
            if links:
                node = links[0]
                nav.remove(node)
                nav.insert(0, node)
    container.set('data-portfolio-case', guide)


def journal_body(english=False):
    if english:
        lead = 'How I connect a problem with an implementation or a technical conclusion.'
        scope = 'These notes were reviewed on 10 October 2026. This is the review date, not a claim about when the original decisions were made. The first two entries concern my own projects; the last two are editorial readings of documented HTB labs. They do not describe client engagements.'
        groups = ('Personal projects', 'HTB lab retrospectives')
        labels = ('Problem', 'Decision', 'Evidence', 'Limit')
        entries = [
            ('imports', 'An imported observation is not a verified finding', 'report-gen 0.27.0 · personal project', [
                'A scanner output can enter a report before its technical meaning has been checked.',
                'Nuclei imports create unverified findings. Nmap imports create service inventory and pending coverage, without creating vulnerabilities from open ports.',
                'The import code records provenance, including source hashes. The Nmap application path explicitly leaves coverage pending; finding imports explicitly set verification to unverified.',
                'Importing preserves observations; it does not repeat a scan, validate a vulnerability or establish that an asset is within an authorized scope.',
            ], [(REPORT_SOURCE + 'scanner_imports.py', 'Read the scanner importer'), (REPORT_SOURCE + 'finding_imports.py', 'Read finding verification defaults'), ('report-gen-en.html', 'Explore report-gen')]),
            ('native-web', 'Keep the reading routes available without JavaScript', 'Portfolio website · personal project', [
                'A script failure should not remove access to a case study, its sources or a CV.',
                'Render the content and links in HTML. Use native disclosures for optional detail and add search, notebook and animation behavior progressively.',
                'The case links and CV are ordinary links; technical details use the browser’s own disclosure control. The search page provides a native catalog when JavaScript is unavailable.',
                'Interactive search and the personal notebook still require JavaScript. The fallback preserves reading and navigation, not every interactive feature.',
            ], [('cap-case-en.html', 'Inspect a case and its sources'), ('buscar.html', 'Open the search catalog (Spanish)'), ('downloads/cv-sebastian-latorre.pdf', 'Download the CV (Spanish PDF)')]),
            ('cap-credentials', 'Treat exposed credentials as a hypothesis for another service', 'HTB Cap · lab retrospective', [
                'FTP credentials in a packet capture do not, by themselves, prove SSH access.',
                'Separate the traffic observation from the later authentication. Explain each transition with its own documentary source.',
                'The guide describes readable FTP authentication, then SSH access as nathan. The dossier links those two steps separately.',
                'The original PCAP and an independent terminal transcript are not included. This note does not claim a new test or current access.',
            ], [('cap.html#pcap', 'Source: traffic analysis (Spanish)'), ('cap.html#access', 'Source: SSH access (Spanish)'), ('cap-case-en.html#decision-2', 'Read the decision in context')]),
            ('forest-rights', 'Describe replication rights separately from group membership', 'HTB Forest · lab retrospective', [
                'Saying that DCSync makes an account a Domain Admin confuses two different capabilities.',
                'Follow the documented permission chain and name the resulting access precisely: replication material, followed by access with the Administrator identity.',
                'The guide documents nested memberships, WriteDacl, DCSync and material associated with RID 500 before the final Pass-the-Hash step.',
                'Exported ACLs and an independent transcript are not included. The result does not establish automatic Domain Admins membership or a verified remediation.',
            ], [('forest.html#bloodhound', 'Source: memberships and permissions (Spanish)'), ('forest.html#privesc', 'Source: replication and final access (Spanish)'), ('forest-case-en.html#decision-3', 'Read the decision in context')]),
        ]
    else:
        lead = 'Cómo conecto un problema con una implementación o una conclusión técnica.'
        scope = 'Notas revisadas el 10 de octubre de 2026. Es la fecha de revisión, no una fecha histórica atribuida a cada decisión. Las dos primeras entradas corresponden a proyectos propios; las dos últimas son lecturas editoriales de laboratorios HTB documentados. No presentan encargos de clientes.'
        groups = ('Proyectos propios', 'Retrospectivas de laboratorios HTB')
        labels = ('Problema', 'Decisión', 'Evidencia', 'Límite')
        entries = [
            ('imports', 'Una observación importada no es un hallazgo verificado', 'report-gen 0.27.0 · proyecto propio', [
                'Un resultado de escáner puede llegar al informe antes de comprobar su significado técnico.',
                'Los resultados de Nuclei entran como hallazgos sin verificar. Nmap incorpora inventario de servicios y cobertura pendiente; no convierte puertos abiertos en vulnerabilidades.',
                'El importador conserva procedencia y hashes del origen. La aplicación de Nmap deja explícitamente la cobertura pendiente y los hallazgos importados quedan sin verificar.',
                'Importar conserva observaciones: no repite el escaneo, no valida una vulnerabilidad ni acredita que un activo esté dentro de un alcance autorizado.',
            ], [(REPORT_SOURCE + 'scanner_imports.py', 'Leer el importador de escáneres'), (REPORT_SOURCE + 'finding_imports.py', 'Leer el estado inicial de verificación'), ('proyectos.html#report-gen', 'Explorar report-gen')]),
            ('native-web', 'Mantener la lectura disponible sin JavaScript', 'Sitio de portafolio · proyecto propio', [
                'Un fallo de un script no debería impedir leer un caso, consultar sus fuentes o descargar el CV.',
                'Generar el contenido y los enlaces en HTML, usar desplegables nativos para el detalle opcional y añadir búsqueda, cuaderno y animaciones de forma progresiva.',
                'El CV y las fuentes son enlaces normales. Los detalles técnicos usan el control desplegable del navegador. Buscar ofrece un catálogo nativo cuando JavaScript no está disponible.',
                'La búsqueda interactiva y el cuaderno personal sí requieren JavaScript. La alternativa conserva lectura y navegación, no todas las funciones interactivas.',
            ], [('cap-caso.html', 'Revisar un caso y sus fuentes'), ('buscar.html', 'Abrir el catálogo de búsqueda'), ('downloads/cv-sebastian-latorre.pdf', 'Descargar CV (PDF)')]),
            ('cap-credentials', 'Tratar las credenciales expuestas como una hipótesis para otro servicio', 'HTB Cap · retrospectiva de laboratorio', [
                'Leer credenciales FTP en una captura no demuestra por sí solo acceso por SSH.',
                'Separar la observación del tráfico de la autenticación posterior. Explicar cada transición con su propia fuente documental.',
                'La guía describe autenticación FTP legible y, después, acceso SSH como nathan. El expediente enlaza esos dos pasos por separado.',
                'No se incluyen el PCAP original ni una transcripción independiente. Esta nota no afirma una prueba nueva ni acceso actual.',
            ], [('cap.html#pcap', 'Fuente: análisis del tráfico'), ('cap.html#access', 'Fuente: acceso SSH'), ('cap-caso.html#decision-2', 'Leer la decisión en contexto')]),
            ('forest-rights', 'Separar derechos de replicación y membresía de grupos', 'HTB Forest · retrospectiva de laboratorio', [
                'Afirmar que DCSync convierte una cuenta en Domain Admin confunde dos capacidades distintas.',
                'Seguir la cadena de permisos documentada y nombrar con precisión el resultado: material de replicación y, después, acceso con la identidad Administrator.',
                'La guía documenta membresías anidadas, WriteDacl, DCSync y material asociado al RID 500 antes del acceso final mediante Pass-the-Hash.',
                'No se incluyen ACLs exportadas ni una transcripción independiente. El resultado no acredita membresía automática en Domain Admins ni una remediación verificada.',
            ], [('forest.html#bloodhound', 'Fuente: membresías y permisos'), ('forest.html#privesc', 'Fuente: replicación y acceso final'), ('forest-caso.html#decision-3', 'Leer la decisión en contexto')]),
        ]
    navigation = ''.join(f'<a href="#{identifier}">{escape(title)}</a>' for identifier, title, _, _, _ in entries)
    sections = ''
    for index, (identifier, title, context, fields, sources) in enumerate(entries):
        if index in (0, 2):
            if index:
                sections += '</section>'
            sections += f'<section class="journal-group" aria-labelledby="journal-group-{index}"><h2 id="journal-group-{index}">{escape(groups[index // 2])}</h2>'
        rows = ''.join(f'<div><dt>{escape(label)}</dt><dd>{escape(text)}</dd></div>' for label, text in zip(labels, fields))
        links = ''.join(f'<a href="{escape(href, quote=True)}">{escape(label)}</a>' for href, label in sources)
        sections += f'<article class="journal-entry" id="{identifier}" data-journal-kind="{"project" if index < 2 else "lab"}"><p class="journal-context">{escape(context)}</p><h3>{escape(title)}</h3><dl>{rows}</dl><div class="journal-sources" aria-label="{"Sources" if english else "Fuentes"}">{links}</div></article>'
    sections += '</section>'
    return f'<p class="lead">{escape(lead)}</p><p class="journal-scope">{escape(scope)}</p><nav class="journal-index" aria-label="{"Decisions on this page" if english else "Decisiones de esta página"}">{navigation}</nav>{sections}'


def enhance_document(filename, tree):
    cases = {'cap-caso.html', 'forest-caso.html', 'cap-case-en.html', 'forest-case-en.html'}
    relevant = cases | {'index.html', 'english.html', 'proyectos.html', 'report-gen-en.html'} | set(JOURNAL_PAGES)
    if filename not in relevant:
        return
    site_evolution_142.add_resource(tree, 'link', rel='stylesheet', href='assets/css/portfolio-144.css')
    if filename == 'index.html':
        actions = tree.xpath('//*[' + has_class('welcome-links') + ']')[0]
        actions.append(link('downloads/cv-sebastian-latorre.pdf', 'CV (PDF)', download='', **{'class': 'text-link welcome-cv'}))
        shortcuts = tree.xpath('//*[' + has_class('lab-shortcuts') + ']')
        if shortcuts:
            shortcuts[0].append(link('bitacora.html', 'Bitácora técnica'))
    if filename == 'english.html':
        container = tree.xpath('//*[' + has_class('professional-route') + ']')[0]
        existing = container.xpath('./p/a[@href="downloads/cv-sebastian-latorre.pdf"]')
        if existing:
            paragraph = existing[0].getparent()
            for child in list(paragraph):
                paragraph.remove(child)
            paragraph.text = 'I am looking for a junior pentesting role. This portfolio brings together training labs and my own tools. '
            certifications = link('index.html#certificaciones', 'View my verifiable certifications', hreflang='es')
            paragraph.append(certifications)
            certifications.tail = ', including OSCP+.'
            actions = element('<div class="portfolio-entry-links"><a href="#contact">Contact</a><a href="downloads/cv-sebastian-latorre.pdf" hreflang="es" download>CV · Spanish PDF</a></div>')
            container.insert(container.index(paragraph) + 1, actions)
        approach = container.xpath('./section[@id="approach"]')
        if approach:
            approach[0].append(element('<p class="portfolio-journal-link"><a href="engineering-notes.html">Read four engineering decisions and their evidence →</a></p>'))
    if filename in cases:
        enhance_cases(filename, tree)
    if filename == 'proyectos.html':
        section = tree.xpath('//section[@aria-labelledby="problem-title"]')
        if section:
            section[0].append(element('<p class="portfolio-journal-link"><a href="bitacora.html">Leer las decisiones de implementación y sus fuentes →</a></p>'))
    if filename == 'report-gen-en.html':
        container = tree.xpath('//*[' + has_class('professional-route') + ']')[0]
        container.append(element('<p class="portfolio-journal-link"><a href="engineering-notes.html#imports">Why imported observations remain unverified →</a></p>'))
    if filename in JOURNAL_PAGES:
        if filename == 'engineering-notes.html':
            site_evolution_142.english_chrome(filename, tree)
            site_evolution_142.add_resource(tree, 'link', rel='stylesheet', href='assets/css/evolution-142.css')
        head = tree.find('head')
        for script in tree.xpath('//script[@type="application/ld+json"]'):
            schema = json.loads(script.text)
            schema['dateModified'] = REVIEW_DATE
            script.text = json.dumps(schema, ensure_ascii=False).replace('<', '\\u003c')
        # site_intro refreshes the inline CSP hashes after these transformations.
        for language, target in [('es', 'bitacora.html'), ('en', 'engineering-notes.html')]:
            head.append(html.Element('link', rel='alternate', hreflang=language, href='https://iphobiuss.github.io/' + target))


def build_routes(document, page_head, record, root):
    for filename, (title, description, alternate) in JOURNAL_PAGES.items():
        english = filename == 'engineering-notes.html'
        if english:
            header = f'<div class="page-head"><div class="shell narrow"><p class="crumbs"><a href="english.html">English overview</a> / <a href="{alternate}" lang="es" hreflang="es">Español</a></p><h1>{escape(title)}</h1><p>{escape(description)}</p><p class="edition-line">Reviewed <time datetime="{REVIEW_DATE}">10 October 2026</time></p></div></div>'
        else:
            header = page_head(title, description, folder='readme', path='bitacora/')
            header = header.replace('</h1>', '</h1><p class="portfolio-language"><a href="engineering-notes.html" lang="en" hreflang="en">English version →</a></p>', 1)
            header = header.replace('</div></div>', f'<p class="edition-line">Revisión <time datetime="{REVIEW_DATE}">10 oct 2026</time></p></div></div>', 1)
        notes = journal_body(english)
        body = header + '<div class="shell narrow journal-page" lang="' + ('en' if english else 'es') + '">' + notes + '</div>'
        document(filename, title, description, body, date_modified=REVIEW_DATE)
        record(title, filename, 'English' if english else 'Bitácora', notes, 'Portafolio')
