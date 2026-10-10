"""Render the second original lab: HTTP object authorization with two identities."""
from __future__ import annotations

from html import escape
from pathlib import Path
from lxml import html

from ai_boundary_case import code_block, section
from http_access_case import prepare_evidence

PAGE = "api-acceso.html"
EDITION = "2026-10-10"
TITLE = "Una sesión no autoriza todos los objetos"
DESCRIPTION = "API HTTP local con dos identidades: IDOR de lectura y escritura, parche por propietario y retest reproducible en Python o Docker."


def enhance_document(filename, tree):
    if filename == "index.html":
        nodes = tree.xpath('//*[contains(concat(" ", normalize-space(@class), " "), " lab-shortcuts ")]')
    elif filename == "ia-limites.html":
        nodes = tree.xpath('//section[@id="limites"]//*[contains(concat(" ", normalize-space(@class), " "), " actions ")]')
    else:
        return
    if nodes and not nodes[0].xpath(f'.//a[@href="{PAGE}"]'):
        link = html.Element("a", href=PAGE)
        if filename == "ia-limites.html":
            link.set("class", "button")
        link.text = "API HTTP: acceso por objeto"
        nodes[0].append(link)


def build_case(document, page_head, record, root):
    evidence = prepare_evidence(Path(root))
    summary = evidence["summary"]
    count = summary["scenarios"]
    checks = summary["http_exchanges"]
    cases = {row["id"]: row for row in evidence["results"]}
    cross_read = cases["alice_cross_read"]
    response = cross_read["fixed"]["trace"][0]["response"]
    rows = "".join(
        '<tr><th scope="row">' + escape(row["label_es"]) + '</th>'
        + ''.join('<td>' + ' → '.join(str(step["response"]["status"]) for step in row[mode]["trace"]) + '</td>' for mode in ("vulnerable", "fixed"))
        + '</tr>' for row in evidence["results"]
    )
    toc = [("alcance", "Qué se pone a prueba"), ("fallo", "La petición que cruza el límite"),
           ("parche", "Autorizar el objeto"), ("retest", "Comprobar lectura y escritura"),
           ("reproducir", "Reproducir y descargar"), ("limites", "Límites")]
    links = ''.join(f'<a href="#{anchor}">{label}</a>' for anchor, label in toc)
    head = page_head(TITLE, "Autenticarse demuestra quién solicita. Cada informe necesita además una decisión de acceso.",
                     folder="guias", path="casos/api-acceso")
    opening = (
        '<div class="article-meta"><time datetime="2026-10-10">Edición 10 oct 2026</time>'
        '<span>Laboratorio propio · HTTP local · datos sintéticos</span></div>'
        '<dl class="case-synthesis"><div><dt>Problema</dt><dd>Una sesión válida puede leer y modificar el informe de otra identidad cambiando su ID.</dd></div>'
        '<div><dt>Decisión</dt><dd>Comprobar el propietario almacenado contra la identidad de la sesión antes de leer o escribir.</dd></div>'
        f'<div><dt>Evidencia</dt><dd>{count} escenarios y {checks} intercambios HTTP reales, con cuerpos completos y expectativas.</dd></div>'
        '<div><dt>Resultado</dt><dd>El parche rechaza los accesos ajenos ensayados y conserva los accesos propios. Los rechazos de escritura no cambian el objeto.</dd></div></dl>'
    )
    scope = section("alcance", "01", "Qué se pone a prueba",
        '<p>Alice y Bruno tienen una sesión sintética y un informe cada uno. La API admite '
        '<code>GET /reports/{id}</code> y <code>PATCH /reports/{id}</code>. Ambos modos exigen autenticación; '
        'solo el corregido comprueba que el objeto pertenece a la identidad autenticada.</p>'
        '<p>El laboratorio levanta un servidor nuevo en <code>127.0.0.1</code> para cada escenario. '
        'Un cliente envía HTTP real, registra la respuesta y cierra el servidor al terminar. '
        'No hay un objetivo externo ni respuestas simuladas.</p>'
        '<p>Esta es una prueba distinta al <a href="ia-limites.html">laboratorio de herramientas de IA</a>: '
        'aquí la frontera evaluada es una API HTTP con dos identidades, lecturas y escrituras.</p>')
    failure = section("fallo", "02", "La petición que cruza el límite",
        '<p>La misma sesión de Alice puede consultar su informe <code>101</code>. Cambiar ese identificador '
        'por <code>202</code> reproduce el fallo de autorización por objeto en el modo vulnerable:</p>'
        + code_block("Petición HTTP del escenario", 'GET /reports/202 HTTP/1.1\nHost: 127.0.0.1\nAuthorization: Bearer lab-alice-only')
        + code_block("Cuerpo observado en modo vulnerable", cross_read["vulnerable"]["trace"][0]["response"]["body"], "output")
        + '<p>El marcador <code>SYNTHETIC_BRUNO_202</code> permite detectar inequívocamente la lectura ajena. '
        'Todos los valores y tokens pertenecen a esta demostración; no proceden de usuarios reales.</p>')
    patch = section("parche", "03", "Autorizar el objeto antes de acceder",
        '<p>La identidad proviene del token resuelto por el servidor. El propietario proviene del objeto almacenado. '
        'Un campo <code>owner</code> enviado por el cliente o una cabecera que se presente como Bruno no conceden permiso.</p>'
        + code_block("Condición aplicada antes de GET y PATCH", 'if item is None or (fixed and item["owner"] != identity):\n    return self.respond(404, {"error": "not_found"})')
        + f'<p>Con el parche, la misma solicitud devuelve <code>{response["status"]}</code> y el cuerpo '
        f'<code>{escape(response["body"])}</code>. No incluye nombre, propietario ni marcador del informe ajeno. '
        'El objeto inexistente usa el mismo estado y cuerpo.</p>'
        '<ul class="checklist"><li>Autorización anterior a la lectura y a la modificación.</li>'
        '<li>Rechazo de dos cabeceras de autenticación en la misma solicitud.</li>'
        '<li>Solo se admite cambiar el título; el JSON no puede reasignar propietario.</li>'
        '<li>Respuestas con <code>Cache-Control: no-store</code>.</li></ul>')
    retest = section("retest", "04", "Comprobar lectura y escritura",
        f'<p><b>{checks}/{checks} intercambios coinciden con su expectativa.</b> Los {count} escenarios se '
        'ejecutan contra ambos modos. En el vulnerable, varios resultados esperados demuestran el fallo; '
        'no significan que esa versión sea segura.</p>'
        '<p>Después de cada intento de escritura relevante, el propietario lee su informe. '
        'Así se comprueba que la modificación legítima persiste y que una escritura rechazada no altera el estado.</p>'
        '<div class="tblwrap"><table><caption>Estados HTTP observados; la flecha indica la lectura posterior de comprobación</caption>'
        '<thead><tr><th scope="col">Escenario</th><th scope="col">Vulnerable</th><th scope="col">Corregido</th></tr></thead>'
        f'<tbody>{rows}</tbody></table></div>'
        '<p>También se comparan los cuerpos completos, no solo los códigos HTTP. La evidencia conserva '
        'cada petición, respuesta, SHA-256 del cuerpo y expectativa; las fechas y el puerto efímero se omiten explícitamente.</p>')
    reproduce = section("reproducir", "05", "Reproducir y descargar",
        '<p>Python 3.10 o posterior, sin dependencias. Descarga y descomprime el ZIP; desde su carpeta:</p>'
        + code_block("Ejecutar el retest HTTP", 'python3 lab.py --verify resultados.json', "command")
        + f'<p>Salida esperada: <code>PASS: {checks}/{checks} HTTP checks; complete evidence identical</code>.</p>'
        '<details class="entry-details"><summary>Ejecutar la misma batería en Docker</summary><div class="entry-content">'
        '<p>El contenedor incluye cliente y servidor; no publica puertos, corre como usuario no root '
        'y no necesita red durante la prueba. La imagen base se descarga durante la construcción.</p>'
        + code_block("Construir y ejecutar el contenedor", 'docker build -t iphobiuss-http-access:1.0.0 .\n'
                     'docker run --rm --network none --read-only --cap-drop ALL \\\n  --security-opt no-new-privileges --pids-limit 64 \\\n  --memory 128m --cpus 1 iphobiuss-http-access:1.0.0', "command")
        + '</div></details>'
        '<p>El ZIP contiene API, escenarios, evidencia, instrucciones de exploración manual, Dockerfile '
        'y un manifiesto SHA-256. <code>--verify</code> repite la ejecución y compara todo el JSON con la evidencia incluida.</p>'
        '<div class="actions"><a class="button primary" href="downloads/http-access-lab.zip" download>Descargar laboratorio (ZIP)</a>'
        '<a class="button" href="downloads/http-access-resultados.json" download>Descargar evidencia HTTP (JSON)</a></div>')
    limits = section("limites", "06", "Límites de esta evidencia",
        '<p>El servidor y las sesiones son una demostración local de autorización por objeto. '
        'No es una API lista para producción: no hay TLS, login, expiración de tokens, base de datos, '
        'roles complejos ni control de concurrencia de escrituras.</p>'
        '<p>Los intercambios registrados prueban los escenarios publicados. No constituyen una auditoría '
        'de terceros ni demuestran ausencia de cualquier otra vulnerabilidad. El contenedor ejecuta la misma batería '
        'y no amplía por sí solo su cobertura.</p>'
        '<div class="actions"><a class="button" href="ia-limites.html">Laboratorio de herramientas de IA</a>'
        '<a class="button" href="cap-caso.html">Caso Web: Cap</a><a class="button" href="index.html#contacto">Contacto</a></div>')
    body = (head + '<div class="shell article-layout"><aside class="article-toc"><span class="toc-label">En este laboratorio</span>'
            f'<nav aria-label="Índice del laboratorio">{links}</nav></aside><div class="article-content">'
            f'<details class="mobile-toc"><summary>En este laboratorio</summary><nav aria-label="Índice móvil">{links}</nav></details>'
            + opening + scope + failure + patch + retest + reproduce + limits + '</div></div>')
    document(PAGE, TITLE, DESCRIPTION, body, "guias", article=True, date_modified=EDITION)
    record(TITLE, PAGE, "Laboratorio", DESCRIPTION, "Web, API, HTTP, IDOR, autorización, Docker")
