"""Render an end-to-end case from the executed two-identity HTTP lab."""
from __future__ import annotations

from html import escape
from pathlib import Path
from lxml import html

from ai_boundary_case import code_block, section
from http_access_case import access_control_diff, prepare_evidence

PAGE = "api-acceso.html"
EDITION = "2026-10-10"
TITLE = "Una sesión no autoriza todos los objetos"
DESCRIPTION = "Caso propio reproducible: hipótesis, evidencia HTTP con dos identidades, parche de autorización por objeto y retest de lectura y escritura."


def enhance_document(filename, tree):
    if filename == PAGE:
        # Native disclosure markers leave wrapped headings the full text width.
        tree.find("head").append(html.Element("link", rel="stylesheet", href="assets/css/http-case.css"))
        tree.find("head").append(html.Element("script", src="assets/js/http-case.js", defer="defer"))
        return
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


def evidence_link(identifier: str, label: str) -> str:
    return f'<a href="#evidencia-{escape(identifier, quote=True)}">{escape(label)}</a>'


def statuses(row: dict, mode: str) -> str:
    return " → ".join(str(step["response"]["status"]) for step in row[mode]["trace"])


def transcript(trace: list[dict]) -> str:
    """Present captured fields only; do not fabricate an HTTP wire recording."""
    steps = []
    for number, step in enumerate(trace, 1):
        request, response = step["request"], step["response"]
        lines = [f'Intercambio {number}', f'{request["method"]} {request["path"]}']
        lines.extend(f"{name}: {value}" for name, value in request["headers"])
        if request["body"]:
            lines.extend(["", request["body"]])
        lines.extend(["", f'Estado HTTP observado: {response["status"]}'])
        lines.extend(f"{name}: {value}" for name, value in response["headers"].items())
        lines.extend(["", response["body"]])
        steps.append("\n".join(lines))
    return "\n\n".join(steps)


def render_results(evidence: dict) -> str:
    entries = []
    for row in evidence["results"]:
        heading = escape(row["label_es"])
        comparison = f'Vulnerable: {statuses(row, "vulnerable")} · Corregido: {statuses(row, "fixed")}'
        contents = (f'<p><b>Escenario:</b> <code>{escape(row["id"])}</code>. '
                    'Los estados y cuerpos completos coinciden con las expectativas declaradas.</p>')
        for mode, label in (("vulnerable", "Modo vulnerable"), ("fixed", "Modo corregido")):
            contents += code_block(f'{label}: {row["label_es"]}', transcript(row[mode]["trace"]), "output")
        entries.append(
            f'<details class="entry-details" id="evidencia-{escape(row["id"])}" data-http-scenario="{escape(row["id"])}">'
            f'<summary><span>{heading}<br><small>{escape(comparison)}</small></span></summary>'
            f'<div class="entry-content">{contents}</div></details>'
        )
    return "".join(entries)


def render_explorer(evidence: dict) -> str:
    """Render captured exchanges, never predict a response from the policy."""
    cases = {row["id"]: row for row in evidence["results"]}
    panels = []
    for identity in ("alice", "bruno"):
        for identifier, owner in (("101", "alice"), ("202", "bruno")):
            for method, operation in (("GET", "read"), ("PATCH", "write")):
                relation = "own" if identity == owner else "cross"
                key = f"{identity}_{relation}_{operation}"
                row = cases[key]
                initial = key == "alice_cross_read"
                cards = []
                for mode, label in (("vulnerable", "Vulnerable"), ("fixed", "Corregido")):
                    trace = row[mode]["trace"]
                    request = trace[0]["request"]
                    # Fail the build if a fixture or mapping no longer represents these controls.
                    if (request["method"] != method or request["path"] != f"/reports/{identifier}"
                            or dict(request["headers"]).get("Authorization") != f"Bearer lab-{identity}-only"):
                        raise ValueError(f"Explorer selection differs from recorded request: {key}/{mode}")
                    responses = []
                    for index, step in enumerate(trace):
                        label_step = "Respuesta a la solicitud" if index == 0 else "Lectura posterior del propietario"
                        responses.append(f'<p><b>{label_step}: HTTP {step["response"]["status"]}</b></p>'
                                         + code_block('Cuerpo JSON registrado', step["response"]["body"], "output"))
                    cards.append(f'<article><h4>{label}</h4>{"".join(responses)}</article>')
                interpretation = (
                    'El propietario conserva el acceso legítimo en ambos modos.' if relation == "own" else
                    'El modo vulnerable expone el objeto ajeno; el corregido no devuelve su contenido.' if method == "GET" else
                    'La lectura posterior confirma el cambio ajeno en el vulnerable y el título original en el corregido.'
                )
                payload = (f'<p>Cuerpo enviado: <code>{escape(row["vulnerable"]["trace"][0]["request"]["body"])}</code></p>'
                           if method == "PATCH" else "")
                panels.append(
                    f'<div data-http-result="{identity}:{identifier}:{method}" data-http-source="{key}"'
                    + ('' if initial else ' hidden')
                    + f'><h3>{escape(row["label_es"])}</h3><p><code>{method} /reports/{identifier}</code> '
                    f'con el token sintético de {identity.title()}.</p>{payload}<div class="http-comparison">'
                    + ''.join(cards) + f'</div><p>{interpretation}</p>'
                    + f'<a href="#evidencia-{key}">Abrir peticiones, cabeceras y cuerpos completos</a></div>'
                )
    return section("explorador", "02", "Compara una identidad, un objeto y una operación",
        '<div class="http-explorer" data-http-explorer><p id="http-explorer-scope">'
        '<b>Explorador de evidencia registrada.</b> Cada combinación muestra intercambios HTTP '
        'ya ejecutados en el laboratorio local y publicados en el JSON. Cambiar los controles no envía '
        'peticiones a la API ni ejecuta una nueva prueba. Los datos son sintéticos.</p>'
        '<p id="http-control-help">El informe 101 pertenece a Alice; el 202, a Bruno. '
        '<code>GET</code> lee el informe; <code>PATCH</code> intenta cambiar su título.</p>'
        '<form data-http-form aria-describedby="http-explorer-scope"><fieldset disabled>'
        '<legend>Elegir una comparación</legend><div class="http-fields">'
        '<label for="http-identity">Identidad<select id="http-identity" name="http_identity">'
        '<option value="alice">Alice</option><option value="bruno">Bruno</option></select></label>'
        '<label for="http-object">Objeto<select id="http-object" name="http_object" aria-describedby="http-control-help">'
        '<option value="101">101</option><option value="202" selected>202</option></select></label>'
        '<label for="http-method">Operación<select id="http-method" name="http_method" aria-describedby="http-control-help">'
        '<option value="GET">GET</option><option value="PATCH">PATCH</option></select></label>'
        '</div><div class="actions"><button class="button primary" type="submit">Comparar evidencia</button>'
        '<button class="button" type="reset">Ejemplo inicial</button></div></fieldset></form>'
        '<p data-http-state role="status" aria-live="polite">Sin JavaScript puedes leer la comparación inicial '
        'y abrir todos los escenarios en la sección de retest.</p>'
        + ''.join(panels) + '</div>')


def build_case(document, page_head, record, root):
    root = Path(root)
    evidence = prepare_evidence(root)
    summary = evidence["summary"]
    count, checks = summary["scenarios"], summary["http_exchanges"]
    cases = {row["id"]: row for row in evidence["results"]}
    cross_read = cases["alice_cross_read"]
    response = cross_read["fixed"]["trace"][0]["response"]
    toc = [("alcance", "Alcance y criterio de éxito"), ("explorador", "Explorar la evidencia"), ("hipotesis", "Hipótesis y controles"),
           ("recorrido", "Del fallo a su impacto"), ("parche", "El cambio de código"),
           ("retest", "Retest y evidencia HTTP"), ("reproducir", "Reproducir y descargar"),
           ("limites", "Límites y conclusiones")]
    links = ''.join(f'<a href="#{anchor}">{label}</a>' for anchor, label in toc)
    head = page_head(TITLE, "De una petición permitida a una escritura ajena: reproducir, corregir y comprobar la frontera de acceso.",
                     folder="proyectos", path="casos/api-acceso")
    opening = (
        '<div class="article-meta"><time datetime="2026-10-10">Edición 10 oct 2026</time>'
        '<span>Caso propio · HTTP local · datos sintéticos</span></div>'
        '<dl class="case-synthesis"><div><dt>Problema</dt><dd>Una sesión válida puede leer y modificar el informe de otra identidad cambiando su ID.</dd></div>'
        '<div><dt>Causa raíz</dt><dd>La API comprueba que el objeto existe, pero no que pertenezca a la identidad autenticada.</dd></div>'
        '<div><dt>Decisión</dt><dd>Comprobar el propietario almacenado antes de leer o escribir; conservar el acceso legítimo.</dd></div>'
        f'<div><dt>Evidencia</dt><dd>{count} escenarios, dos modos y {checks} intercambios HTTP reales. Cada respuesta se compara con su expectativa.</dd></div>'
        '<div><dt>Resultado</dt><dd>El parche rechaza los accesos ajenos ensayados. La lectura posterior confirma que las escrituras rechazadas no alteran el objeto.</dd></div></dl>'
    )
    scope = section("alcance", "01", "Alcance y criterio de éxito",
        '<p>Esta aplicación fue construida para demostrar y comprobar un fallo de autorización por objeto. '
        'El modo vulnerable contiene el defecto de forma deliberada; este caso no describe un incidente ni un encargo de un cliente.</p>'
        '<p>Alice posee el informe <code>101</code> y Bruno, el <code>202</code>. Cada uno tiene un token sintético. '
        'La API admite <code>GET /reports/{id}</code> y <code>PATCH /reports/{id}</code>. '
        'La autenticación es la misma en los dos modos; cambia la política que autoriza el objeto.</p>'
        '<ul class="checklist"><li>Una identidad válida puede leer y modificar su propio título.</li>'
        '<li>La misma identidad no puede leer ni modificar el informe ajeno.</li>'
        '<li>Después de un rechazo, el propietario debe recuperar el objeto sin cambios.</li>'
        '<li>El control debe funcionar en ambos sentidos: Alice hacia Bruno y Bruno hacia Alice.</li></ul>'
        '<p>Cada escenario inicia un servidor nuevo en <code>127.0.0.1</code> y un cliente envía HTTP real. '
        'Los datos se reinician entre escenarios y se conservan entre los pasos de cada uno. '
        'No hay un destino externo ni respuestas simuladas.</p>')
    hypotheses = section("hipotesis", "03", "Hipótesis y controles que las delimitan",
        '<p>Las siguientes conclusiones se apoyan en los escenarios publicados. '
        'Una hipótesis descartada aquí no equivale a descartar esa clase de fallo en cualquier aplicación.</p>'
        '<dl class="case-synthesis">'
        '<div><dt>Confirmada</dt><dd><strong>Una sesión válida basta para acceder a un informe ajeno.</strong> '
        'Las lecturas cruzadas devuelven el marcador del otro propietario y las escrituras cruzadas cambian su título en modo vulnerable. '
        + evidence_link("alice_cross_read", "Lectura Alice → Bruno") + ' y '
        + evidence_link("bruno_cross_write", "escritura Bruno → Alice") + '.</dd></div>'
        '<div><dt>Descartada aquí</dt><dd><strong>El fallo depende de entrar sin autenticación.</strong> Las solicitudes '
        + evidence_link("anonymous", "sin token") + ' y con '
        + evidence_link("unknown_token", "token no reconocido") + ' reciben 401 en ambos modos. '
        'Los accesos cruzados usan una sesión válida; comprobar la sesión no resuelve la autorización del objeto.</dd></div>'
        '<div><dt>Descartada aquí</dt><dd><strong>Basta con validar los campos del JSON.</strong> '
        + evidence_link("invalid_json", "El JSON inválido") + ' y '
        + evidence_link("mass_assignment", "el intento de cambiar owner") + ' ya se rechazan en ambos modos. '
        'Aun así, un PATCH con un título válido modifica un informe ajeno en modo vulnerable.</dd></div>'
        '<div><dt>Control negativo</dt><dd><strong>Una cabecera del cliente no debe elegir la identidad autorizada.</strong> '
        'Enviar <code>X-Lab-User: bruno</code> con el token de Alice no abre el informe de Bruno después del parche. '
        + evidence_link("client_owner_header", "Ver petición y rechazo") + '.</dd></div>'
        '<div><dt>Conclusión acotada</dt><dd><strong>Ajeno e inexistente deben responder igual.</strong> '
        'El estado y el cuerpo del informe ajeno coinciden con los del '
        + evidence_link("unknown_object", "identificador inexistente") + ' después del parche. '
        'No se midieron diferencias de tiempo ni canales laterales.</dd></div></dl>')
    walkthrough = section("recorrido", "04", "Del fallo a su impacto, paso a paso",
        '<ol class="takeaways">'
        '<li><b>1. Establecer dos controles legítimos.</b> '
        + evidence_link("alice_own_read", "Alice lee 101") + ' y '
        + evidence_link("bruno_own_read", "Bruno lee 202") + '. Ambos reciben 200 con marcadores distintos. '
        'Así se identifica a qué objeto pertenece cada respuesta.</li>'
        '<li><b>2. Mantener la sesión y cambiar solo el identificador.</b> '
        'Con el token de Alice, <code>GET /reports/202</code> devuelve el informe de Bruno en el modo vulnerable. '
        'La misma petición recibe 404 en el corregido. '
        + evidence_link("alice_cross_read", "Comparar los dos modos") + '.</li>'
        '<li><b>3. Invertir las identidades.</b> Bruno solicita <code>/reports/101</code>. '
        'También obtiene el informe ajeno antes del parche y un rechazo después. '
        + evidence_link("bruno_cross_read", "Comprobar la dirección opuesta") + '.</li>'
        '<li><b>4. Comprobar el impacto de escritura.</b> Alice envía un PATCH válido al informe 202. '
        'Bruno lo lee después con su propio token: en modo vulnerable el título cambió; en el corregido conserva su valor inicial. '
        + evidence_link("alice_cross_write", "Ver PATCH y lectura posterior") + '.</li>'
        '<li><b>5. Conservar la operación permitida.</b> Alice actualiza su propio informe y vuelve a leerlo. '
        'El título nuevo persiste en ambos modos: el parche no consiste en desactivar la escritura. '
        + evidence_link("alice_own_write", "Ver el control positivo") + '.</li></ol>'
        '<p>El impacto demostrado es una lectura y una modificación no autorizadas entre dos propietarios '
        'del laboratorio. No se asigna una severidad de producción sin el contexto de una aplicación real.</p>'
        + code_block("Cuerpo observado al leer el informe ajeno en modo vulnerable", cross_read["vulnerable"]["trace"][0]["response"]["body"], "output")
        + '<p>El marcador <code>SYNTHETIC_BRUNO_202</code> identifica el objeto ajeno de forma inequívoca. '
        'Todos los nombres, títulos y tokens son datos públicos inventados para esta prueba.</p>')
    patch = section("parche", "05", "El cambio de código que corrige la causa",
        '<p>Estas dos funciones están en el <code>lab.py</code> descargable y son las políticas que ejecuta la batería. '
        'La comparación se genera desde ese archivo al construir esta página. '
        'Muestra la diferencia entre los dos modos del laboratorio; no representa el historial de un proyecto ajeno.</p>'
        + code_block("Comparación de las políticas ejecutadas", access_control_diff(root))
        + '<p>El handler resuelve primero la identidad desde el token del servidor y busca el objeto. '
        'Después llama a la política seleccionada. Si esta devuelve falso, responde 404 antes de devolver contenido '
        'o procesar la modificación. La identidad no procede del JSON ni de <code>X-Lab-User</code>.</p>'
        + f'<p>En la lectura cruzada, el modo corregido devuelve <code>{response["status"]}</code> con '
        f'<code>{escape(response["body"])}</code>, sin propietario, título ni marcador del informe.</p>'
        '<p>Los controles anteriores al parche se mantienen: una única cabecera de autenticación, '
        'un JSON que solo puede cambiar el título y respuestas con <code>Cache-Control: no-store</code>. '
        'Ninguno sustituye la comprobación de propietario.</p>')
    retest = section("retest", "06", "Retest: abrir la evidencia de cada escenario",
        f'<p><b>{checks}/{checks} intercambios coinciden con su expectativa.</b> Los {count} escenarios se ejecutan '
        'contra ambos modos. En el vulnerable, varios resultados esperados reproducen el fallo; '
        'no significan que esa versión sea segura.</p>'
        '<p>Abre cualquier escenario para comparar petición, cabeceras, estado y cuerpo completo. '
        'La flecha une pasos del mismo escenario; en las escrituras, el segundo paso es la lectura de comprobación. '
        'Estos controles desplegables funcionan también sin JavaScript.</p>'
        '<p>Las transcripciones proceden del JSON observado. Se omiten el puerto efímero, Host y las cabeceras '
        'Date y Server para permitir comparaciones reproducibles. No son una captura de red; '
        'el JSON descargable conserva además las expectativas y la huella SHA-256 de cada cuerpo.</p>'
        + render_results(evidence))
    reproduce = section("reproducir", "07", "Reproducir y descargar",
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
        'y un manifiesto SHA-256. <code>--verify</code> repite las solicitudes HTTP y compara todo el JSON '
        'con la evidencia incluida; una diferencia hace fallar la comprobación.</p>'
        '<div class="actions"><a class="button primary" href="downloads/http-access-lab.zip" download>Descargar laboratorio (ZIP)</a>'
        '<a class="button" href="downloads/http-access-resultados.json" download>Descargar evidencia HTTP (JSON)</a></div>')
    limits = section("limites", "08", "Qué permite concluir y qué queda fuera",
        '<p>Los controles reproducidos respaldan una conclusión concreta: comprobar el propietario antes '
        'de leer o escribir bloquea los accesos cruzados ensayados y conserva las operaciones legítimas. '
        'Una respuesta de rechazo no basta por sí sola; el retest comprueba también el estado del objeto.</p>'
        '<p>El servidor y las sesiones son una demostración local. No es una API lista para producción: '
        'no hay TLS, login, expiración o revocación de tokens, base de datos, roles complejos '
        'ni control de concurrencia de escrituras. Tampoco se evaluaron tiempos de respuesta como canal lateral.</p>'
        '<p>La ejecución publicada es automática. Las instrucciones manuales permiten repetirla y explorarla, '
        'pero no acreditan una sesión de evaluación humana. Estos escenarios no demuestran ausencia '
        'de cualquier otra vulnerabilidad. Docker ejecuta la misma batería y no amplía por sí solo su cobertura.</p>'
        '<p>El siguiente paso técnico sería añadir persistencia y probar carreras entre autorización y escritura, '
        'revocación de sesiones y reglas de acceso compartido. Cada ampliación necesitaría nuevas expectativas y evidencia.</p>'
        '<div class="actions"><a class="button" href="ia-limites.html">Laboratorio de herramientas de IA</a>'
        '<a class="button" href="cap-caso.html">Caso Web: Cap</a><a class="button" href="index.html#contacto">Contacto</a></div>')
    body = (head + '<div class="shell article-layout"><aside class="article-toc"><span class="toc-label">En este caso</span>'
            f'<nav aria-label="Índice del caso">{links}</nav></aside><div class="article-content">'
            f'<details class="mobile-toc"><summary>En este caso</summary><nav aria-label="Índice móvil">{links}</nav></details>'
            + opening + scope + render_explorer(evidence) + hypotheses + walkthrough + patch + retest + reproduce + limits + '</div></div>')
    document(PAGE, TITLE, DESCRIPTION, body, "proyectos", article=True, date_modified=EDITION)
    record(TITLE, PAGE, "Laboratorio", DESCRIPTION, "Web, API, HTTP, IDOR, autorización, causa raíz, retest, Docker")
