"""A dated, source-pinned report-gen verification card, without runtime requests."""
from datetime import date, datetime
from html import escape
import json
from pathlib import Path
import re

from lxml import html


ROOT = Path(__file__).resolve().parents[1]


def snapshot():
    """Fail the build if the card no longer describes the linked download."""
    data = json.loads((ROOT / 'content/report-gen-status.json').read_text(encoding='utf-8'))
    report = json.loads((ROOT / 'content/report-gen.json').read_text(encoding='utf-8'))
    sha = data['source_commit']
    if data['schema_version'] != 1 or not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Invalid report-gen verification snapshot')
    if data['version'] != report['version'] or sha != report['source_commit']:
        raise ValueError('Update the report-gen verification snapshot with the download')
    repo = data['repository']
    if repo != 'https://github.com/IphobiusS/report-gen' or report['download'] != f'{repo}/archive/{sha}.zip':
        raise ValueError('The verification snapshot must describe the immutable download')
    reviewed = date.fromisoformat(data['reviewed_on'])
    if {check['key'] for check in data['checks']} != {'tests', 'browsers', 'windows', 'source'} or len(data['checks']) != 4:
        raise ValueError('Missing or repeated report-gen verification evidence')
    for check in data['checks']:
        if check['head_sha'] != sha or check['conclusion'] != 'success' or not isinstance(check['run_id'], int):
            raise ValueError('Verification evidence must refer to successful runs of the selected commit')
        if datetime.fromisoformat(check['completed_at'].replace('Z', '+00:00')).date() > reviewed:
            raise ValueError('Verification evidence postdates the review')
    if data['pending'] != ['native_microsoft_word', 'five_human_usability_sessions']:
        raise ValueError('Review the pending-acceptance wording before changing its status')
    return data


def card(language):
    data = snapshot()
    english = language == 'en'
    repo, sha = data['repository'], data['source_commit']
    anchor = 'report-gen-verification' if english else 'report-gen-verificacion'
    runs = {check['key']: f"{repo}/actions/runs/{check['run_id']}" for check in data['checks']}
    labels = {
        'en': {
            'title': 'Verification and current limits',
            'intro': 'Automated checks passed for this revision. This is a dated review, not a live status monitor.',
            'version': 'Version', 'reviewed': 'Reviewed', 'revision': 'Source revision',
            'summary': 'Inspect the checks and their scope',
            'linux_title': 'Ubuntu 24.04 · Python 3.12',
            'linux': 'Editor journeys and PDF, DOCX, Markdown and HTML exports. Creation, saving and recovery flows in Chromium and Firefox; portable HTML and editor-specific checks in Chromium.',
            'tests': 'Editor and export checks', 'browsers': 'Browser runs',
            'windows_title': 'Windows Server 2025 · Python 3.12',
            'windows': 'Selected automated save, import, delivery and history checks, plus creation and recovery flows in Chromium. The runner has no Microsoft Word installation.',
            'windows_link': 'Windows run',
            'source_title': 'Reproducible source package',
            'source': 'Two archives built from the same commit compare byte for byte. This check covers the source package, not every generated report.',
            'source_link': 'Packaging run',
            'pending': 'Still pending',
            'pending_text': 'Native Microsoft Word review and five usability sessions with participants.',
            'pending_link': 'Acceptance scope and limits',
            'limits': 'Automated results apply to these scenarios and environments. Review each final report in the recipient’s software before sharing it.',
        },
        'es': {
            'title': 'Verificación y límites actuales',
            'intro': 'Las comprobaciones automáticas de esta revisión pasaron. Es una revisión fechada, no un monitor en tiempo real.',
            'version': 'Versión', 'reviewed': 'Revisado', 'revision': 'Revisión del código',
            'summary': 'Consultar las pruebas y su alcance',
            'linux_title': 'Ubuntu 24.04 · Python 3.12',
            'linux': 'Recorridos del editor y exportación PDF, DOCX, Markdown y HTML. Creación, guardado y recuperación en Chromium y Firefox; controles del HTML portátil y diálogos del editor en Chromium.',
            'tests': 'Pruebas del editor y exportación', 'browsers': 'Pruebas de navegadores',
            'windows_title': 'Windows Server 2025 · Python 3.12',
            'windows': 'Pruebas automáticas seleccionadas de guardado, importación, entrega e historial, más creación y recuperación en Chromium. El equipo de pruebas no tiene Microsoft Word instalado.',
            'windows_link': 'Pruebas de Windows',
            'source_title': 'Paquete de código reproducible',
            'source': 'Dos paquetes construidos desde el mismo commit coinciden byte a byte. Esta comprobación cubre el código fuente, no cada informe generado.',
            'source_link': 'Prueba de empaquetado',
            'pending': 'Pendiente de validar',
            'pending_text': 'Revisión nativa en Microsoft Word y cinco sesiones de usabilidad con participantes.',
            'pending_link': 'Alcance y límites de la aceptación',
            'limits': 'Los resultados automáticos corresponden a estos escenarios y entornos. Revisa cada informe final en el programa del destinatario antes de compartirlo.',
        },
    }[language]
    reviewed = date.fromisoformat(data['reviewed_on'])
    months = ('January February March April May June July August September October November December' if english else
              'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre').split()
    date_label = (f'{reviewed.day} {months[reviewed.month - 1]} {reviewed.year}' if english else
                  f'{reviewed.day} de {months[reviewed.month - 1]} de {reviewed.year}')
    guide = data['limits_source'] if not english else 'README.en.md'
    guide_url = f'{repo}/blob/{sha}/{guide}'
    rows = []
    for key in ['linux', 'windows', 'source']:
        if key == 'linux':
            links = [(runs['tests'], labels['tests']), (runs['browsers'], labels['browsers'])]
        else:
            links = [(runs[key], labels[key + '_link'])]
        links_html = ''.join(f'<a href="{escape(url, quote=True)}">{escape(label)}</a>' for url, label in links)
        rows.append(f'<li><h3>{escape(labels[key + "_title"])}</h3><p>{escape(labels[key])}</p><div class="report-status-links">{links_html}</div></li>')
    return html.fragment_fromstring(f'''
<section class="report-status" id="{anchor}" aria-labelledby="{anchor}-title" data-report-status data-source-commit="{sha}" data-reviewed-on="{data['reviewed_on']}">
  <h2 id="{anchor}-title">{escape(labels['title'])}</h2>
  <p class="report-status-intro">{escape(labels['intro'])}</p>
  <dl class="report-status-facts">
    <div><dt>{labels['version']}</dt><dd data-status-version>{escape(data['version'])}</dd></div>
    <div><dt>{labels['reviewed']}</dt><dd><time datetime="{data['reviewed_on']}">{date_label}</time></dd></div>
    <div class="report-status-revision"><dt>{labels['revision']}</dt><dd><a href="{repo}/commit/{sha}"><code>{sha}</code></a></dd></div>
  </dl>
  <details class="report-status-details"><summary>{labels['summary']}</summary><ul class="report-status-checks">{''.join(rows)}</ul></details>
  <div class="report-status-pending"><h3>{labels['pending']}</h3><p>{labels['pending_text']} <a href="{guide_url}">{labels['pending_link']}</a>.</p></div>
  <p class="report-status-limits">{labels['limits']}</p>
</section>''')


def enhance_document(filename, tree):
    if filename == 'index.html':
        links = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," readme-project-links ")]')
        if links:
            links[0].append(html.fragment_fromstring('<a class="text-link" href="proyectos.html#report-gen-verificacion">Ver pruebas y límites</a>'))
        return
    if filename not in {'proyectos.html', 'report-gen-en.html'}:
        return
    if tree.xpath('//*[@data-report-status]'):
        raise ValueError('Duplicate report-gen verification card')
    link = html.Element('link', rel='stylesheet', href='assets/css/report-status.css')
    tree.find('head').append(link)
    if filename == 'proyectos.html':
        container = tree.xpath('//*[@id="report-gen"]')[0]
        introduction = container.xpath('./div[contains(concat(" ",normalize-space(@class)," ")," project-intro ")]')[0]
        container.insert(container.index(introduction) + 1, card('es'))
    else:
        container = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," professional-route ")]')[0]
        first_section = container.find('section')
        container.insert(container.index(first_section), card('en'))
