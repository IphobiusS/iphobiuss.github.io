# iphobiuss · sitio estático v14.5

Portafolio y laboratorio de pentesting, con una terminal como portada. Las fuentes completas viven en la rama [`source`](https://github.com/IphobiusS/iphobiuss.github.io/tree/source); la rama `main` contiene únicamente el sitio generado que sirve GitHub Pages.

## Entrada de terminal

La primera entrada de cada sesión y una recarga explícita muestran una terminal durante unos 2,5 segundos, sobre un fondo opaco con lluvia verde de caracteres. Tras «Bienvenido», terminal y fondo se desvanecen durante medio segundo para revelar el sitio. Un cierre independiente a los 2,6 segundos evita depender del evento de transición. Puedes omitirla con el botón o Escape. La navegación interna, los enlaces con fragmento, volver atrás, la pausa del sitio y la reducción de movimiento conservan el acceso directo. En Apariencia puedes desactivar o reactivar la entrada; la preferencia se guarda únicamente en el navegador.

La secuencia es decorativa y no representa escaneos ni verificaciones de seguridad. El contenido permanece disponible sin JavaScript, y la apertura y el cierre no dependen de que termine una descarga de recursos.

## Portafolio y búsqueda

La portada enlaza directamente al CV público en PDF, sin correo ni teléfono. La censura elimina el contenido de esos campos y sus metadatos; conserva las dos páginas y los enlaces profesionales. `test:public-cv` revisa texto, enlaces, metadatos y objetos antes de publicar. Cap y Forest abren con un resumen de problema, decisión, evidencia, resultado y límite; el detalle técnico mantiene sus enlaces. La bitácora (`bitacora.html` y `engineering-notes.html`) documenta decisiones de proyectos propios y laboratorios, con fuentes y una fecha de revisión explícita.

La ficha de report-gen utiliza `content/report-gen-status.json`: es una instantánea fechada de una revisión concreta y sus comprobaciones, no un estado en vivo. Al actualizar el programa, revisa también ese archivo, sus enlaces de ejecución y las validaciones pendientes.

El buscador permite filtrar por tipo e idioma y compartir la selección mediante `q`, `tipo` e `idioma` en la URL. Sin JavaScript se conserva el catálogo de enlaces. Las consultas y filtros no se envían a un servicio externo; el historial sigue siendo opcional.

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

Trabaja sobre `source`. Un push a esa rama ejecuta `.github/workflows/site.yml`: instalación con dependencias fijadas, construcción desde cero, segunda reconstrucción idéntica, enlaces y pruebas de navegador. Sólo después de aprobarlas genera un commit en `main` con el contenido de `dist/`, conservando el historial y rechazando cambios concurrentes.

El workflow solicita expresamente la construcción de GitHub Pages y espera a que termine: los commits hechos con `GITHUB_TOKEN` no la disparan automáticamente. Finalmente compara los archivos públicos byte a byte. Usa los permisos `contents: write` y `pages: write` únicamente en el trabajo de publicación; no necesita un token personal. Las pull requests se validan y no publican.

La configuración prevista de Pages es «Deploy from a branch», rama `main`, carpeta `/`, con `main` como rama predeterminada. No publiques `content/`, `scripts/`, `tests/` ni `node_modules/` en la raíz del sitio. No edites las páginas generadas de `main`: el próximo build las sustituye.

## Comprobar cambios

```bash
npm ci
npx playwright install chromium
npm run build:all
npm run test:build
npm run test:publish
npm run test:links
npm run test:report-assets
npm run test:public-cv
npm run test:intro
npm run test:portfolio
npm run test:report-status
npm run test:search-filters
npm run test:evolution
npm run test:home-actions
npm run test:journey
npm run test:graphs
npm run test:layout
```

`build:all` equivale a `python scripts/build-site.py`. `npm run build` sólo regenera las páginas y copia recursos editables; usa el build completo antes de publicar. `test:build` se ejecuta en una carpeta temporal, compara dos construcciones completas, detecta recursos obsoletos y comprueba que las fuentes no se modifican.

Las pruebas de navegador usan Playwright y axe-core fijados en `package-lock.json`, levantan sus propios servidores y admiten `SITE_CHROMIUM` para un Chromium existente. `SITE_LAYOUT_MODE=matrix` o `targeted` selecciona cada parte de la batería de distribución; sin esa variable se ejecutan ambas. Se conservan además pruebas específicas de cuaderno, progreso, mascotas y fuentes de gráficos en los comandos de `package.json`.

Las comprobaciones automáticas no sustituyen una revisión humana de accesibilidad ni pruebas con usuarios. Las evidencias de cada entrega deben distinguir las pruebas realizadas de las pendientes.
