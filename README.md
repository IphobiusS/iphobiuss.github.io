# iphobiuss · sitio estático v14.9.2

Portafolio y laboratorio de pentesting, con una terminal como portada. Las fuentes completas viven en la rama [`source`](https://github.com/IphobiusS/iphobiuss.github.io/tree/source); la rama `main` contiene únicamente el sitio generado que sirve GitHub Pages.

## Entrada de terminal

La primera entrada de cada sesión y una recarga explícita muestran una terminal durante unos 2,5 segundos, sobre un fondo opaco con lluvia verde de caracteres. Tras «Bienvenido», terminal y fondo se desvanecen durante medio segundo para revelar el sitio. Un cierre independiente a los 2,6 segundos evita depender del evento de transición. Puedes omitirla con el botón o Escape. La navegación interna, los enlaces con fragmento, volver atrás, la pausa del sitio y la reducción de movimiento conservan el acceso directo. En Apariencia puedes desactivar o reactivar la entrada; la preferencia se guarda únicamente en el navegador.

Los atajos `/` y `Ctrl+K` reabren la biblioteca si está plegada y llevan el foco al buscador de la terminal. Las cabeceras y los índices del grafo conservan su lectura con texto ampliado. Los resúmenes, recorridos y controles se reorganizan según el ancho disponible del bloque; en pantallas bajas, la terminal y Apariencia reducen sus márgenes para mantener accesibles los controles.

La secuencia es decorativa y no representa escaneos ni verificaciones de seguridad. El contenido permanece disponible sin JavaScript, y la apertura y el cierre no dependen de que termine una descarga de recursos.

## Presentación y novedades

Los metadatos de la portada presentan el perfil de Pentester Junior y sus proyectos propios. Cada caso destacado tiene una tarjeta social diferenciada que indica si es un laboratorio propio o una retrospectiva HTB. `content/feed-entries.json` mantiene las publicaciones de guías, casos, bitácora y Releases verificadas; `scripts/site_feed.py` conserva sus identificadores y fechas editoriales. Las guías antiguas conservan su GUID original sin inventar una fecha de publicación. Añade una entrada de report-gen sólo cuando su Release esté publicada y verificada.

`content/assets/css/reading.css` reúne los componentes de lectura y portafolio antes repartidos entre hojas con nombres de versiones. Los tokens comunes de espaciado y controles están en `site.css`. La consolidación conserva el orden de la cascada y la apariencia de los tres temas. No vuelvas a añadir las hojas antiguas.

La marca de report-gen utiliza variantes WebP sin pérdida de 108, 216, 432 y 648 píxeles, con transparencia y selección por ancho y densidad de pantalla. `build-images.py` genera esos derivados a partir del original de 900 píxeles y registra hashes en `content/report-gen-brand-provenance.json`.

## Portafolio y búsqueda

La portada concentra los trabajos propios en report-gen y el caso HTTP; mantiene Cap y Forest como retrospectivas compactas y conserva la terminal y sus carpetas. La carpeta de proyectos actúa como índice, sin repetir toda la página del producto. La mini demo existente en español e inglés permite editar un hallazgo ficticio y su severidad ilustrativa con vista previa HTML inmediata; no ejecuta una evaluación ni sustituye las exportaciones de la aplicación local.

La portada enlaza directamente al CV público en PDF, sin correo ni teléfono. La censura elimina el contenido de esos campos y sus metadatos; conserva las dos páginas y los enlaces profesionales. `test:public-cv` revisa texto, enlaces, metadatos y objetos antes de publicar. Cap y Forest abren con un resumen de problema, decisión, evidencia, resultado y límite; el detalle técnico mantiene sus enlaces. La bitácora (`bitacora.html` y `engineering-notes.html`) documenta decisiones de proyectos propios y laboratorios, con fuentes y una fecha de revisión explícita.

La ficha de report-gen utiliza `content/report-gen-status.json`: es una instantánea fechada de una revisión concreta y sus comprobaciones, no un estado en vivo. Al actualizar el programa, revisa también ese archivo, sus enlaces de ejecución y las validaciones pendientes.

El mapa de habilidades de la portada enlaza evidencias concretas de Web, Active Directory, automatización y reportería, indicando qué se construyó o practicó. No utiliza porcentajes ni equipara laboratorios con experiencia profesional.

`api-acceso.html` presenta un segundo laboratorio propio: API HTTP con dos identidades sintéticas, IDOR de lectura y escritura, autorización por propietario y retest con cuerpos completos. `content/labs/http-access/` conserva código, escenarios y evidencia. CI repite la ejecución nativa y en Docker sin red externa ni puertos publicados; el ZIP descargable incluye instrucciones y un manifiesto SHA-256. No es una API de producción.

El caso muestra alcance, hipótesis y controles negativos, recorrido entre las dos identidades, diferencia entre las políticas reales y los 48 intercambios de sus 18 escenarios. Las transcripciones se generan desde el resultado ejecutado. El explorador permite elegir identidad, objeto y GET/PATCH entre ocho combinaciones registradas, con URL compartible, recarga y Atrás/Adelante. Cambiar controles no hace solicitudes ni ejecuta pruebas nuevas. La comparación inicial y todas las transcripciones siguen disponibles sin JavaScript. El recorrido breve y el resumen inglés priorizan este caso propio, con los mismos resultados y límites. La grabación está postergada; su guion permanece en las instrucciones del ZIP.

`sesiones-seguras.html` añade un caso propio sobre cierre de sesión, cambio de contraseña, revocación por dispositivo y caducidad. `content/labs/session-security/` contiene un servidor HTTP demostrativo con sesiones en memoria, dos identidades sintéticas y un reloj controlado. Sus 24 escenarios registran 154 intercambios entre las variantes vulnerable y corregida. El ZIP incluye código, evidencia, instrucciones y manifiesto; puede repetirse localmente o en Docker sin conexiones externas. La página y sus transcripciones siguen disponibles sin JavaScript. No es un sistema de autenticación para producción.

Para actualizar report-gen, espera su Release verificada y guarda los JSON reales de la Release y de sus workflows. Comprueba que la etiqueta apunte al commit aprobado y reproduce el paquete con `scripts/build-release.py` en ese checkout. Sincroniza así:

```bash
python scripts/sync-report-release.py --repo /ruta/report-gen --commit COMMIT_COMPLETO --runs /ruta/recibos.json --release /ruta/release.json --package-manifest /ruta/paquete/report-gen-VERSION-SHA12.json
```

Revisa la propuesta y añade `--apply` para actualizar conjuntamente versión, descarga, guía y estado. Exige cuatro ejecuciones `push` correctas de la misma revisión y repositorio, un CV revisado y coincidencia de los tres archivos publicados con el ZIP, SHA-256 y manifiesto locales. No modifica los informes históricos ni marca Word o sesiones humanas como realizados. La opción sin Release se conserva para archivos históricos fijados a un commit.

El buscador permite filtrar por tipo e idioma y compartir la selección mediante `q`, `tipo` e `idioma` en la URL. Sin JavaScript se conserva el catálogo de enlaces. Las consultas y filtros no se envían a un servicio externo; el historial sigue siendo opcional.

## Cuaderno y recuperación

Guardar una nota o recibir un cambio de otra pestaña conserva el foco del teclado, la selección y el texto de copia manual que esté abierto. Si el permiso del portapapeles termina después de una actualización, la copia manual aparece en el control vigente; las respuestas antiguas o posteriores al borrado se descartan.

Las notas se validan antes de escribirlas: un carácter de control no puede invalidar silenciosamente todo el cuaderno. Si los datos guardados no se pueden interpretar, **Revisar cuaderno** permite descargar el original exacto, revisar las entradas válidas y exportar una copia revisada sin sobrescribirlo. **Descargar esta pestaña** conserva los datos que aún estén en memoria.

Una nota pendiente cuyo favorito se elimina desde otra pestaña queda en **Notas por recuperar**, con descarga o restauración explícita. Si el favorito reaparece, se compara la nota guardada antes de aceptar el borrador. Las escrituras usan Web Locks y leen el estado actual para preservar cambios de otras pestañas. Sin bloqueo disponible, con cuota agotada o almacenamiento denegado, se informa de una sesión temporal exportable. Esta recuperación local no sustituye descargar respaldos antes de borrar los datos del navegador.

## Reconstruir desde cero

```bash
git clone --branch source https://github.com/IphobiusS/iphobiuss.github.io.git
cd iphobiuss.github.io
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-build.txt
python scripts/build-site.py
python -m http.server 8000 --directory dist
```

Abre <http://localhost:8000>. El build completo elimina `dist/` y la reconstruye desde entradas versionadas; no necesita una distribución anterior, acceso a servicios externos ni Node.js. No guardes trabajo manual dentro de `dist/`.

- `content/`: contenidos y metadatos editables.
- `content/assets/`: CSS, JavaScript y recursos propios.
- `content/public/`: fuentes tipográficas con sus licencias, capturas verificadas y descargas originales de esta distribución. Los derivados comprimidos se conservan como entradas para mantener su procedencia y bytes.
- `scripts/`: generadores, laboratorio y publicación.
- `tests/`: comprobaciones de construcción, navegación y presentación.

Las tarjetas sociales se generan localmente. Los informes de ejemplo mantienen su versión de origen; la versión del programa y su guía se fijan juntas en `content/report-gen.json`. No se publica una segunda copia del programa dentro del sitio. `CHEATSHEET.md` es una descarga utilizada por Herramientas, no documentación sobrante.

## Editar y publicar

Trabaja sobre `source`. Un push a esa rama ejecuta `.github/workflows/site.yml`: instala las dependencias fijadas y construye una distribución compartida desde cero. Después valida en paralelo Chromium y Firefox en Ubuntu y la misma batería de compatibilidad de WebKit en macOS 15. Linux comprueba también reconstrucciones idénticas, enlaces y el resto de las pruebas. Sólo después de aprobar ambos trabajos genera un commit en `main` con los archivos probados de `dist/`, conservando el historial y rechazando cambios concurrentes.

El workflow solicita expresamente la construcción de GitHub Pages y espera a que termine: los commits hechos con `GITHUB_TOKEN` no la disparan automáticamente. Finalmente compara los archivos públicos byte a byte. Usa los permisos `contents: write` y `pages: write` únicamente en el trabajo de publicación; no necesita un token personal. Las pull requests se validan y no publican.

La configuración prevista de Pages es «Deploy from a branch», rama `main`, carpeta `/`, con `main` como rama predeterminada. No publiques `content/`, `scripts/`, `tests/` ni `node_modules/` en la raíz del sitio. No edites las páginas generadas de `main`: el próximo build las sustituye.

## Comprobar cambios

```bash
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run build:all
npm run test:build
npm run test:publish
npm run test:links
npm run test:report-assets
npm run test:public-cv
npm run test:release-sync
npm run test:performance
npm run test:experience
npm run test:brand
npm run test:feed
npm run test:compatibility
npm run test:skills
npm run test:intro
npm run test:portfolio
npm run test:report-status
npm run test:search-filters
npm run test:evolution
npm run test:home-actions
npm run test:journey
npm run test:continuity
npm run test:notebook
npm run test:guide-progress
npm run test:graphs
npm run test:http-case
npm run test:session-case
npm run test:layout
```

`build:all` equivale a `python scripts/build-site.py`. `npm run build` sólo regenera las páginas y copia recursos editables; usa el build completo antes de publicar. `test:build` se ejecuta en una carpeta temporal, compara dos construcciones completas, detecta recursos obsoletos y comprueba que las fuentes no se modifican.

Las pruebas de navegador usan Playwright y axe-core fijados en `package-lock.json`, levantan sus propios servidores y admiten `SITE_CHROMIUM` para un Chromium existente. `SITE_LAYOUT_MODE=matrix` o `targeted` selecciona cada parte de la batería de distribución; sin esa variable se ejecutan ambas. `test:continuity`, `test:notebook` y `test:guide-progress` participan en la validación de CI antes de publicar. Cubren continuidad, escrituras concurrentes, recuperación de notas, datos inválidos y progreso de lectura. Se conservan además las pruebas de mascotas y fuentes de gráficos en `package.json`.

Las comprobaciones automáticas no sustituyen una revisión humana de accesibilidad ni pruebas con usuarios. Las evidencias de cada entrega deben distinguir las pruebas realizadas de las pendientes.

`test:performance` controla pesos estáticos; `test:compatibility` recorre Firefox y WebKit, comprueba entrada, teclado, temas, filtros, CV, 320 px con texto al 200 % y las rutas móviles. El presupuesto inicial por página es 1 MiB sin comprimir y 24 peticiones. Son medidas locales de recursos, no métricas de visitantes ni puntuaciones de velocidad. WebKit no acredita Safari nativo. La revisión humana con lector de pantalla sigue pendiente y debe registrar sistema, navegador, lector, tarea, resultado y evidencia.

En CI, Firefox se ejecuta con ventana sobre Xvfb en Ubuntu y WebKit con ventana en macOS 15. WebKit conserva las mismas pruebas de transición, navegación, descargas y funcionamiento sin JavaScript; no se sustituye el motor ni se omiten recorridos. Esta ejecución de WebKit tampoco equivale a una revisión manual de Safari.

Para reproducir Firefox en Linux:

```bash
npx playwright install --with-deps chromium firefox
SITE_COMPAT_BROWSERS=firefox SITE_COMPAT_HEADED=1 xvfb-run -a npm run test:compatibility
```

Para reproducir WebKit en macOS sobre una distribución construida previamente:

```bash
npx playwright install webkit
SITE_COMPAT_BROWSERS=webkit SITE_COMPAT_HEADED=1 npm run test:compatibility
```

Los trabajos de Linux y macOS descargan el mismo `dist/`, incluido `.nojekyll`, y comprueban cada archivo por SHA-256 contra el manifiesto de la construcción antes de probarlo. La publicación descarga esa misma distribución y exige que ambos trabajos terminen correctamente, que sus recibos pertenezcan al mismo commit y que todos los archivos coincidan con el manifiesto y con los probados por ambos motores.

`audit-v14.6/compatibility/results.json` registra sistema, modo de ejecución, inventario de archivos y motores completados. Cada trabajo acredita únicamente su motor; la cobertura conjunta se verifica antes de publicar y queda resumida en GitHub Actions. Los archivos `*-intro-trace.json` conservan muestras y eventos reales del desvanecimiento. Ante un fallo, el diagnóstico también se imprime en CI. Los artefactos de distribución y evidencia se conservan siete días en esa ejecución, separados de los archivos públicos del sitio.

## Experiencia medida y revisión externa

`test:experience` mide cinco recorridos con Chromium, contextos nuevos, recursos gzip, CPU limitada por un factor de cuatro, 1,6 Mbps y 150 ms de latencia. Registra LCP, CLS, tareas largas, transición Matrix y latencias de búsqueda/guardado hasta el siguiente contenido pintado. La latencia medida de una tarea no es INP; estas muestras de laboratorio no son métricas de visitantes ni una prueba con un teléfono físico. Los tiempos son informativos; el comando falla por estados incorrectos, recursos rotos o mediciones ausentes, no por comparar máquinas distintas contra un tiempo arbitrario.

El valor por defecto es tres repeticiones por recorrido. En CI se usa `SITE_EXPERIENCE_RUNS=1` y se conserva `audit-v14.9/experience.json`. Puedes seleccionar la ruta con `SITE_EXPERIENCE_OUTPUT`; fuera de CI la salida por defecto está en una carpeta temporal. No incluyas mediciones locales ni observaciones de participantes en el repositorio.

`tests/human-experience-protocol.json` define tareas, entornos y un registro vacío para móvil físico y lector de pantalla. Conserva `execution_status: not_run` hasta obtener observaciones reales. Las pruebas automáticas y la preparación del registro no completan esta revisión. En report-gen también siguen pendientes Word de escritorio y las cinco sesiones de primer uso.
