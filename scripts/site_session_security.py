"""Render an evidence-backed local session lifecycle case, usable without JS."""
from __future__ import annotations

from html import escape
from pathlib import Path
from lxml import html

from ai_boundary_case import code_block, section
from session_security_case import policy_diff, prepare_evidence

PAGE = "sesiones-seguras.html"
EDITION = "2026-10-10"
TITLE = "Cerrar una sesión debe revocar su acceso"
DESCRIPTION = "Laboratorio propio de sesiones: logout, cambio de contraseña, revocación por dispositivo y caducidad con dos identidades, HTTP real y retest reproducible."


def enhance_document(filename, tree):
    if filename == PAGE:
        tree.find("head").append(html.Element("link", rel="stylesheet", href="assets/css/session-case.css"))


def evidence_link(identifier, label):
    return f'<a href="#evidencia-{escape(identifier, quote=True)}">{escape(label)}</a>'


def transcript(trace):
    output = []
    for index, step in enumerate(trace, 1):
        request, response = step["request"], step["response"]
        lines = [f'Intercambio {index} · reloj controlado: {step["clock_seconds"]} s',
                 f'{request["method"]} {request["path"]}']
        lines.extend(f"{name}: {value}" for name, value in request["headers"])
        if request["body"]:
            lines.extend(["", request["body"]])
        lines.extend(["", f'Estado HTTP observado: {response["status"]}'])
        lines.extend(f"{name}: {value}" for name, value in response["headers"].items())
        lines.extend(["", response["body"]])
        output.append("\n".join(lines))
    return "\n\n".join(output)


def results(evidence):
    entries = []
    for row in evidence["results"]:
        statuses = [" → ".join(str(step["response"]["status"]) for step in row[mode]["trace"])
                    for mode in ("vulnerable", "fixed")]
        contents = '<p>Las flechas unen peticiones sucesivas del mismo escenario. Cada modo parte de datos nuevos.</p>'
        for mode, label in (("vulnerable", "Vulnerable"), ("fixed", "Corregido")):
            contents += code_block(f'{label}: {row["label_es"]}', transcript(row[mode]["trace"]), "output")
        entries.append(f'<details class="entry-details" data-session-scenario="{row["id"]}" id="evidencia-{row["id"]}">'
                       f'<summary><span>{escape(row["label_es"])}<br><small>Vulnerable: {statuses[0]} · Corregido: {statuses[1]}</small></span></summary>'
                       f'<div class="entry-content">{contents}</div></details>')
    return "".join(entries)


def build_case(document, page_head, record, root):
    root = Path(root)
    evidence = prepare_evidence(root)
    summary = evidence["summary"]
    count, checks = summary["scenarios"], summary["http_exchanges"]
    toc = [("alcance", "Alcance y criterio"), ("cronologia", "Seguir una sesión"), ("decisiones", "Decisiones de diseño"),
           ("parche", "La política corregida"), ("retest", "Retest y evidencia"), ("reproducir", "Reproducir"), ("limites", "Límites")]
    links = "".join(f'<a href="#{anchor}">{label}</a>' for anchor, label in toc)
    opening = ('<div class="article-meta"><time datetime="2026-10-10">Edición 10 oct 2026</time>'
               '<span>Caso propio · sesiones · datos sintéticos</span></div>'
               '<dl class="case-synthesis"><div><dt>Problema</dt><dd>Una API reconoce el token, pero no comprueba si la sesión sigue vigente.</dd></div>'
               '<div><dt>Causa raíz</dt><dd>La validación ignora revocación, cambio de contraseña y fecha de caducidad.</dd></div>'
               '<div><dt>Decisión</dt><dd>Comprobar el estado del servidor en cada petición y definir qué sesiones invalida cada operación.</dd></div>'
               f'<div><dt>Evidencia</dt><dd>{count} escenarios, dos modos y {checks} intercambios HTTP reales con Alice y Bruno.</dd></div>'
               '<div><dt>Resultado</dt><dd>El modo corregido rechaza los tokens invalidados y conserva los accesos legítimos de las sesiones que deben continuar.</dd></div></dl>')
    scope = section("alcance", "01", "Reconocer un token no basta",
        '<p>Construí esta API local para comparar una sesión conocida con una sesión vigente. El fallo del modo vulnerable '
        'es deliberado: no procede de un cliente ni de un incidente real.</p>'
        '<p>Alice y Bruno tienen un portátil y un teléfono cada uno. Sus cuatro tokens iniciales identifican sesiones '
        'distintas. <code>GET /me</code> devuelve un marcador propio de cada identidad; las operaciones de sesión '
        'se ejecutan mediante <code>POST</code>. Las contraseñas y tokens son públicos y sintéticos.</p>'
        '<ul class="checklist"><li>Cerrar sesión debe invalidar ese token, aunque el cliente lo conserve.</li>'
        '<li>Cambiar la contraseña debe invalidar las sesiones anteriores de esa identidad, según la política elegida.</li>'
        '<li>Revocar un dispositivo debe afectar únicamente a ese dispositivo propio.</li>'
        '<li>Una sesión caducada debe rechazarse en la siguiente petición protegida.</li>'
        '<li>Las otras identidades y las sesiones que siguen vigentes deben conservar su acceso.</li></ul>'
        '<p>La batería envía HTTP real a <code>127.0.0.1</code>. Inicia un servidor nuevo por escenario y modo, '
        'y mantiene el estado entre pasos. La caducidad usa un reloj controlado dentro del proceso: '
        'se prueban las fronteras temporales sin esperar un minuto ni simular las respuestas HTTP.</p>')
    chronology = section("cronologia", "02", "Seguir el token después de cerrar sesión",
        '<ol class="takeaways"><li><b>1. Confirmar la identidad.</b> El token del portátil de Alice obtiene '
        '<code>200</code> y el marcador <code>SYNTHETIC_ALICE</code>.</li>'
        '<li><b>2. Solicitar el cierre.</b> <code>POST /logout</code> devuelve <code>200</code> y '
        '<code>signed_out: true</code> en ambos modos. Esa respuesta por sí sola no acredita revocación.</li>'
        '<li><b>3. Reutilizar exactamente el token anterior.</b> El modo vulnerable todavía permite '
        '<code>GET /me</code>. El corregido devuelve <code>401</code> sin identidad ni marcador.</li>'
        '<li><b>4. Comprobar el alcance.</b> El teléfono de Alice y el portátil de Bruno siguen obteniendo '
        '<code>200</code>: el cierre afecta a la sesión seleccionada.</li></ol>'
        '<p>' + evidence_link("alice_logout", "Abrir las cinco peticiones y respuestas de Alice") + '. '
        + evidence_link("bruno_logout", "Repetir el control con Bruno") + '.</p>'
        '<p>El retest conserva el token de forma intencional. Borrarlo del cliente impediría observar '
        'si el servidor aún lo acepta. En esta API se transporta como Bearer; el caso no ensaya cookies de navegador.</p>')
    decisions = section("decisiones", "03", "Decidir qué debe dejar de funcionar y qué debe continuar",
        '<dl class="case-synthesis"><div><dt>Cierre de sesión</dt><dd>Se marca como revocada la sesión actual. '
        'Las demás siguen vigentes. ' + evidence_link("alice_logout", "Ver alcance del cierre") + '.</dd></div>'
        '<div><dt>Contraseña</dt><dd>Se exige la contraseña actual y se incrementa la generación de la identidad. '
        'Todas sus sesiones previas, incluida la actual, deben dejar de funcionar. El usuario inicia sesión de nuevo; '
        'la contraseña anterior se rechaza y la nueva emite una sesión utilizable. '
        + evidence_link("alice_password", "Ver los siete pasos") + '.</dd></div>'
        '<div><dt>Dispositivo</dt><dd>El servidor busca su propietario antes de revocarlo. Un identificador ajeno '
        'responde igual que uno inexistente y su token sigue funcionando. '
        + evidence_link("alice_cross_device", "Ver el rechazo y el control de Bruno") + '.</dd></div>'
        '<div><dt>Caducidad</dt><dd>La vida absoluta es de 60 segundos: a los 59 se permite el acceso; '
        'a los 60 se rechaza. Un login posterior obtiene una sesión nueva con su propio límite. '
        + evidence_link("alice_expiry", "Ver el límite inicial") + ' y '
        + evidence_link("new_session_expiry", "el límite de la sesión nueva") + '.</dd></div>'
        '<div><dt>Orden de ejecución</dt><dd>Un lock protege conjuntamente la validación y la mutación en este proceso. '
        'Así una revocación no puede intercalarse entre esos dos pasos. Esto no demuestra coordinación entre '
        'réplicas, cachés o bases de datos distribuidas.</dd></div></dl>'
        '<p>Estas son decisiones explícitas del laboratorio. Otra aplicación podría conservar la sesión actual '
        'tras un cambio de contraseña, pero tendría que definir y probar esa política. Aquí se eligió '
        'invalidarlas todas para que el alcance del cambio sea inequívoco.</p>')
    patch = section("parche", "04", "Validar el estado en cada petición",
        '<p>Este diff se extrae de las funciones que ejecuta el archivo descargable. Ambos modos realizan '
        'las mismas mutaciones; la diferencia está en qué estado aceptan al autenticar la siguiente petición.</p>'
        + code_block("Políticas ejecutadas por el laboratorio", policy_diff(root))
        + '<p>Un token conocido puede estar revocado, pertenecer a una generación anterior o haber caducado. '
        'El modo corregido comprueba las tres condiciones antes de devolver información o realizar otra mutación.</p>'
        '<p>Por ejemplo, una sesión cerrada tampoco puede revocar el teléfono que sigue activo. '
        + evidence_link("revoked_cannot_mutate", "Ver el intento y la comprobación posterior") + '.</p>')
    retest = section("retest", "05", "Retest: respuestas completas y controles negativos",
        f'<p><b>{checks}/{checks} intercambios coinciden con sus expectativas.</b> Los {count} escenarios '
        'se ejecutan en ambos modos. En la variante vulnerable, parte de las respuestas esperadas '
        'demuestra el defecto; un PASS indica reproducción fiel de la batería.</p>'
        '<p>También se rechazan tokens inventados, autenticación duplicada, JSON inválido, cambios con '
        'contraseña incorrecta e identidades declaradas por el cliente. Los controles posteriores comprueban '
        'que el rechazo conserva las sesiones que no debían cambiar.</p>'
        '<p>Los desplegables funcionan sin JavaScript. Cada transcripción conserva las cabeceras de aplicación, '
        'el estado y el cuerpo completo observados. El JSON incluye las expectativas y SHA-256 de cada cuerpo. '
        'Se omiten Host, puerto efímero, Date y Server; no se presenta como captura de red.</p>'
        + results(evidence))
    reproduce = section("reproducir", "06", "Repetir la ejecución desde el código entregado",
        '<p>Python 3.10 o posterior, sin dependencias. Descomprime el ZIP y ejecuta desde su carpeta:</p>'
        + code_block("Verificar toda la evidencia", "python3 lab.py --verify resultados.json", "command")
        + f'<p>Salida esperada: <code>PASS: {checks}/{checks} HTTP checks; complete evidence identical</code>.</p>'
        '<p>El ZIP incluye código, escenarios con expectativas, resultados, instrucciones, Dockerfile '
        'y manifiesto SHA-256. Cualquier diferencia en la evidencia hace fallar la comprobación.</p>'
        '<details class="entry-details"><summary>Explorar el cierre manualmente</summary><div class="entry-content">'
        '<p>Inicia el servidor y sigue los comandos de <code>INSTRUCCIONES.txt</code>. En este modo se usa '
        'tiempo monotónico real; las sesiones iniciales caducan tras 60 segundos.</p>'
        + code_block("Servidor interactivo solo en loopback", "python3 lab.py --serve fixed --port 8766", "command")
        + '<p>La descarga explica cómo repetir con <code>--serve vulnerable</code>, iniciar una sesión nueva '
        'y comparar el mismo token antes y después del cierre.</p></div></details>'
        '<details class="entry-details"><summary>Repetir la batería en Docker</summary><div class="entry-content">'
        '<p>El contenedor ejecuta cliente y servidor como usuario no root, sin publicar puertos. '
        'La construcción descarga la imagen base; la ejecución no necesita red externa.</p>'
        + code_block("Construir y ejecutar", 'docker build -t iphobiuss-session-security:1.0.0 .\n'
                     'docker run --rm --network none --read-only --cap-drop ALL \\\n  --security-opt no-new-privileges --pids-limit 64 \\\n  --memory 128m --cpus 1 iphobiuss-session-security:1.0.0', "command")
        + '</div></details><div class="actions"><a class="button primary" href="downloads/session-security-lab.zip" download>Descargar laboratorio (ZIP)</a>'
        '<a class="button" href="downloads/session-security-resultados.json" download>Descargar evidencia HTTP (JSON)</a></div>')
    limits = section("limites", "07", "Conclusión y límites de la evidencia",
        '<p>La comprobación del estado de sesión bloquea los tokens invalidados en los escenarios publicados. '
        'El resultado combina rechazos y controles positivos: también verifica que otras identidades y '
        'las sesiones legítimas sigan funcionando.</p>'
        '<p>El servidor es una demostración: HTTP sin TLS, datos en memoria, contraseñas sintéticas en texto '
        'plano y tokens deterministas públicos. No implementa rate limiting, cookies, CSRF, refresh tokens, '
        'MFA, OIDC ni almacenamiento distribuido. La duración de 60 segundos sirve para la prueba y no '
        'es una recomendación universal de configuración.</p>'
        '<p>La prueba automática de caducidad avanza un reloj controlado; no mide precisión temporal, '
        'carreras distribuidas ni retrasos de caché. Tampoco acredita una evaluación humana o una '
        'auditoría de una aplicación en producción. Docker reproduce la misma cobertura.</p>'
        '<p>Una ampliación posterior podría introducir persistencia y dos réplicas para comprobar '
        'revocaciones compartidas. Necesitaría escenarios y evidencia nuevos.</p>'
        '<div class="actions"><a class="button" href="api-acceso.html">Autorización por objeto</a>'
        '<a class="button" href="ia-limites.html">Fronteras de herramientas de IA</a>'
        '<a class="button" href="recorrido.html">Recorrido profesional</a></div>')
    head = page_head(TITLE, "Comprobar el token después del cierre, del cambio de contraseña y de su fecha límite.",
                     folder="proyectos", path="casos/sesiones-seguras")
    body = (head + '<div class="shell article-layout"><aside class="article-toc"><span class="toc-label">En este caso</span>'
            f'<nav aria-label="Índice del caso">{links}</nav></aside><div class="article-content">'
            f'<details class="mobile-toc"><summary>En este caso</summary><nav aria-label="Índice móvil">{links}</nav></details>'
            + opening + scope + chronology + decisions + patch + retest + reproduce + limits + '</div></div>')
    document(PAGE, TITLE, DESCRIPTION, body, "proyectos", article=True, date_modified=EDITION,
             social="assets/img/sesiones-seguras-og.png")
    record(TITLE, PAGE, "Laboratorio", DESCRIPTION, "sesiones, logout, contraseña, revocación, caducidad, HTTP, retest, Docker")
