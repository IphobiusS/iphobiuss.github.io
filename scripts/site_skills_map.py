"""Connect portfolio skills to existing, explicitly scoped public evidence."""
from html import escape

from lxml import html

from site_evolution_142 import add_resource


SKILLS = (
    {
        "id": "web",
        "name": "Seguridad web",
        "context": "Laboratorio HTB · Cap",
        "contribution": "Explico cómo un identificador expone una captura ajena y separo esa observación del acceso SSH posterior.",
        "scope": "Retrospectiva documentada; no incluye el PCAP original ni un retest.",
        "sources": (("cap.html#idor", "Leer el análisis de IDOR"),
                    ("cap-caso.html#expediente", "Seguir las decisiones del caso")),
        # V15: el caso HTB vive aquí (antes también en una sección «Casos HTB» aparte).
        "case": {"href": "cap-caso.html", "title": "Caso Cap", "meta": "Linux · Easy",
                 "chain": ("captura ajena", "FTP", "SSH", "CAP_SETUID", "root"),
                 "label": "Cadena documentada: captura de otra sesión, credenciales FTP, acceso SSH, CAP_SETUID, root"},
    },
    {
        "id": "ad",
        "name": "Active Directory",
        "context": "Laboratorio HTB · Forest",
        "contribution": "Relaciono identidad, membresías y permisos para explicar la cadena de acceso hasta DCSync y Pass-the-Hash.",
        "scope": "Retrospectiva documentada; DCSync no acredita pertenencia a Domain Admins.",
        "sources": (("forest.html#bloodhound", "Revisar grupos y permisos"),
                    ("forest.html#privesc", "Leer la escalada documentada")),
        "case": {"href": "forest-caso.html", "title": "Caso Forest", "meta": "Windows · Easy",
                 "chain": ("AS-REP", "WinRM", "WriteDacl", "DCSync", "PtH"),
                 "label": "Cadena documentada: AS-REP, WinRM, WriteDacl, DCSync, Pass-the-Hash"},
    },
    {
        "id": "automation",
        "name": "Automatizar tareas",
        "context": "Proyecto propio · Python",
        "contribution": "Comparo una autorización vulnerable y otra corregida mediante código, escenarios y resultados que se pueden reproducir.",
        "scope": "Datos sintéticos en memoria; la planificación se simula, sin un LLM real.",
        "sources": (("ia-limites.html#reproducir", "Reproducir el laboratorio"),
                    ("ia-limites.html#retest", "Consultar los resultados")),
    },
    {
        "id": "reporting",
        "name": "Reporting",
        "context": "Proyecto propio · report-gen",
        "contribution": "Desarrollo un editor que conecta hallazgos, evidencias y remediación. Banco Lumbre muestra cómo organizo una entrega.",
        "scope": "Banco Lumbre es una entidad ficticia; no representa un encargo de cliente.",
        "sources": (("proyectos.html#problem-title", "Ver decisiones de report-gen"),
                    ("banco-lumbre.html", "Explorar la entrega de ejemplo")),
    },
)


def case_block(case):
    """Sistema, dificultad y cadena del caso, con enlace a su expediente."""
    if not case:
        return ""
    chain = "".join(f"<span>{escape(step)}</span>" for step in case["chain"])
    return (f'<a class="skill-case" href="{escape(case["href"], quote=True)}">'
            f'<span class="case-meta">{escape(case["meta"])}</span><strong>{escape(case["title"])}</strong>'
            f'<span class="case-chain" role="img" aria-label="{escape(case["label"], quote=True)}">{chain}</span></a>')


def render_home():
    """Use ordinary links so evidence remains reachable without scripts."""
    cards = []
    for skill in SKILLS:
        identifier = "habilidad-" + skill["id"]
        links = "".join(
            f'<a href="{escape(href, quote=True)}">{escape(label)}</a>'
            for href, label in skill["sources"]
        )
        cards.append(
            f'<article class="skill-evidence-card" aria-labelledby="{identifier}">'
            f'<p class="skill-context">{escape(skill["context"])}</p>'
            f'<h3 id="{identifier}">{escape(skill["name"])}</h3>'
            f'<p class="skill-contribution">{escape(skill["contribution"])}</p>'
            f'<p class="skill-scope">{escape(skill["scope"])}</p>'
            + case_block(skill.get("case")) +
            f'<div class="skill-sources">{links}</div></article>'
        )
    return (
        '<section class="shell skills-map" id="habilidades" aria-labelledby="habilidades-title">'
        '<div class="skills-map-heading"><h2 id="habilidades-title">Habilidades con evidencia</h2>'
        '<p>Qué aporto en cada área y dónde puedes revisarlo, con los casos HTB documentados. Cada ejemplo indica su contexto y sus límites.</p></div>'
        # Los enlaces antiguos a index.html#casos llegan a esta misma rejilla.
        '<div class="skills-map-grid" id="casos" tabindex="-1">' + "".join(cards) + '</div></section>'
    )


def enhance_document(filename, tree):
    """Keep the map next to the existing cases and verifiable credentials."""
    if filename != "index.html":
        return
    add_resource(tree, "link", rel="stylesheet", href="assets/css/skills-map.css")
    if tree.xpath('//*[@id="habilidades"]'):
        return
    # V15: la evidencia sigue a los trabajos propios (antes iba junto a las certificaciones).
    featured = tree.xpath('//section[@id="proyecto-destacado"]')
    if len(featured) != 1:
        raise ValueError("The skills map requires the featured work section")
    featured[0].addnext(html.fragment_fromstring(render_home()))
