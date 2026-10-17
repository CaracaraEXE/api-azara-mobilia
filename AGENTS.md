# Project Context — API Azara

API REST + Discord Bot para catalogar libros de la Fundación Azara (fundacionazara.org.ar).

## Current State (Sep 2026)

- ✅ **13/13 categorías scrapeadas** (data/libros/) + **Recursos Educativos** (data/recursos-educativos/) + **hemeroteca COMPLETA (2026-09-27): 3 ediciones** del Periódico (data/periodico-exploracion-y-ciencia/) + **14 ediciones** de Revista Azara (data/revista-azara/) — **460 FILAS** (suma cruda: 334 libros + 109 RE + 3 + 14) = **448 ÍTEMS ÚNICOS** que la API devuelve (dedup por id: 12 libros están en 2 categorías de libros → 322 libros únicos; 1 esqueleto en revisión: postal Guacamayo Militar). ⚠️ El "460" histórico es la suma de filas; `stats/general` y la búsqueda global reportan **448** (uno por obra). En `/categorias` la suma de cantidades da 460 (un libro multi-categoría cuenta en CADA categoría) — ambos números son correctos en su contexto (PLANV2 §10).
- ✅ **PLANV3 V3.6 — Hemeroteca (2026-09-27)**: scraper + API + bot listos y EN PRODUCCIÓN para las SECCIONES `periodico-exploracion-y-ciencia` (Periódico Exploración y Ciencia, 🗞️) y `revista-azara` (Revista Azara, 📰). **Piloto + E2E COMPLETO + FASE 2 COMPLETA** (validado por el usuario en Discord): búsqueda por titulares con titular coincidente, salto directo a ediciones (sin título duplicado), `/ficha` con campo 🗞️ Titulares, regresión libros/RE limpia. Estructura de Revista Azara VERIFICADA antes de correr (grilla v4 con `h5.portfolio_title`, PDF único `a.qodef-qi-button[href$=".pdf"]` por edición, titulares mixtos modernas `<p>` / viejas `<br>` — todo cubierto sin cambios). El cortafuegos `revisionPendiente` quedó disponible como red de seguridad (no se disparó en Fase 2: los PDFs de Normas para Autores viven en la página de SECCIÓN, fuera de `article.mix`). El scraper lo corre SIEMPRE el usuario: `node scripts/scraper-playwright.js --seccion=<slug>`.
- ✅ Datos en carpetas por sección: `data/libros/libros-*.json` (13) + `data/recursos-educativos/recursos-educativos.json` (1 archivo, campo `categoria` = grupo de navegación y `coleccion` = serie hiperespecífica)
- ✅ API Express.js funcionando con endpoints GET (respuestas con campo `seccion`)
- ✅ Scraper con CLI: `--todas` / `--seccion=<slug>` / `--categoria=<slug>` (mutuamente excluyentes)
- ✅ **Discord Bot funcionando** — Express + HTTP Interactions (sin discord.js)
- ✅ Botones de paginación ◀/▶ en `/buscar` y categorías
- ✅ `/catalogo` en 2 niveles: Select de SECCIONES → Select de categorías de esa sección
- ✅ Botón "Volver" a categorías de la MISMA sección
- ✅ IDs de libros visibles (`🆔 \`lib-abc123\``) en resultados
- ✅ Presentación del bot separada en `discord-bot/src/formatos.js` (pura, testeable sin servidor) — tests en `discord-bot/test-formatos.js` (44 checks, `npm test`)
- ✅ **Red de seguridad de tests (2026-10-14)**: `backend` → `npm test` = `test-integracion.js` (**72 checks**, 0 deps): monta el app REAL en puerto efímero y verifica integridad global, paginación, `/api/categorias` (**25** = 13 libros + 10 RE + periódico + revista), `/api/secciones` (4, con `subdivision.tipo='categorias'` y colecciones anidadas), filtros `?categoria=` (nombre O slug) / `?seccion=` / `?coleccion=`, 400 con `valoresValidos`, búsqueda, detalle, stats y sub-listas. Valores auto-calculados desde `data/`. `index.js` exporta `app` + guard `require.main`; `GET /` devuelve `endpoints[]` (arrays) + `secciones[]`.
- ✅ **`/ficha` con TOGGLE de titulares (2026-10-14)**: ítems de hemeroteca muestran los titulares OCULTOS por defecto + botón `📖 Ver titulares (N)` que los muestra/oculta re-renderizando (PATCH). Ver "Flujo del toggle" abajo.
- ✅ **RE = sección propia en 2 niveles (2026-10-17)**: `data/recursos-educativos/recursos-educativos.json` (109 ítems). Cada ítem trae `categoria` = los **10 grupos** (Cuadernillos, Cartillas, Postales, Posters de…, Folletos de…) y opcionalmente `coleccion` = serie hiperespecífica (hoy solo `Miradas de la Argentina`, 7 ítems dentro de Cuadernillos). Así RE se navega como Libros: **sección → categoría → (colección)**. Se ELIMINÓ `data/recursos/` y el valor `'recursos'`: ahora la sección es `'recursos-educativos'`. `/api/categorias` pasó de 16 a **25** entradas (13 libros + 10 RE + periódico + revista); RE entra en `?categoria=`, no en `?coleccion=` (que queda para el match PARCIAL de la serie). El catálogo sigue en **448 ítems únicos** (329 con PDF).

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Express.js (puerto 3000) |
| Storage | JSON por categoría (`data/libros-*.json`) |
| Scraper | **Playwright** (navegador real, evita CloudFlare) |
| Bot Server | Express.js (puerto 3001, standalone) |
| Bot Auth | **tweetnacl** (verificación Ed25519, sin discord.js) |
| Bot UI | Slash commands + Message Components (botones, Select Menu) |

## Discord Bot — Comandos e Interacciones

| Comando | Descripción |
|---------|-------------|
| `/buscar [termino]` | Busca por título, 5 por página, botones ◀/▶ |
| `/ficha [id]` | Detalle de un ítem (Sección + Categoría real). Si es hemeroteca: titulares OCULTOS por defecto + botón `📖 Ver titulares (N)` / `🔽 Ocultar titulares` (solo ítems CON titulares) |
| `/catalogo` | Select de SECCIONES (📚 Libros / 🎓 Recursos educativos / 🗞️ Periódico Exploración y Ciencia / 📰 Revista Azara) |
| → Select sección | Estadísticas + Select de categorías de ESA sección |
| → Select categoría | Ítems de esa categoría + ◀/▶ + 🔙 Volver (a la misma sección) |

### Tipos de interacción Discord

| Interaction Type | Código | Qué lo dispara |
|-----------------|--------|----------------|
| PING | 1 | Discord verifica el endpoint |
| APPLICATION_COMMAND | 2 | Usuario ejecuta un slash command |
| MESSAGE_COMPONENT | 3 | Usuario clickea botón o selecciona del Select Menu |

### Response Types usados

| Response Type | Código | Uso |
|--------------|--------|-----|
| PONG | 1 | Respuesta a PING |
| CHANNEL_MESSAGE_WITH_SOURCE | 4 | Respuesta a slash commands |
| DEFERRED_UPDATE_MESSAGE | 6 | Defer para botones/select (luego se hace PATCH) |

### Custom IDs (formato JSON en `custom_id`)

```javascript
// Búsqueda con paginación
{ cmd: 'buscar', q: 'mamiferos', p: 1 }

// Paginación de categoría (sec: slug de sección; SIEMPRE se filtra con ?categoria=)
{ cmd: 'cat-page', sec: 'libros', cat: 'Mastozoologia', p: 1 }
{ cmd: 'cat-page', sec: 'recursos-educativos', cat: 'Cuadernillos', p: 1 }
{ cmd: 'cat-page', sec: 'periodico-exploracion-y-ciencia', cat: 'Periódico Exploración y Ciencia', p: 1 }

// Volver a categorías de la MISMA sección (hemeroteca → vuelve al PASO 1, salto directo)
{ cmd: 'cat-back', sec: 'libros' }
{ cmd: 'cat-back', sec: 'recursos-educativos' }
{ cmd: 'cat-back', sec: 'revista-azara' }

// Select de secciones (paso 1; el valor está en interaction.data.values[0])
{ cmd: 'sec-select' }

// Select Menu de categorías (paso 2; el valor está en interaction.data.values[0])
{ cmd: 'cat-select', sec: 'libros' }
{ cmd: 'cat-select', sec: 'recursos-educativos' }

// TOGGLE de titulares de /ficha (SOLO hemeroteca con titulares; v = ¿visibles AHORA?)
// El estado viaja en el custom_id → el bot no guarda estado. El nuevo estado es !v.
{ cmd: 'tits-toggle', id: 'lib-pued1cal', v: false }

// Botones deshabilitados (nunca se clickean)
'noop', 'page-indicator', 'cat-page-indicator'
```

### Flujo de paginación

1. Usuario ejecuta `/buscar X` → bot responde con type 4 (embed + botones)
2. Usuario clickea ▶ → Discord envía MESSAGE_COMPONENT
3. Bot responde type 6 (DEFERRED_UPDATE_MESSAGE) para avisar que procesa
4. Bot consulta `GET /api/catalogo?busqueda=X&limite=5&pagina=N`
5. Bot hace PATCH al mensaje original via webhook de Discord
6. Mensaje se actualiza con nuevos resultados y botones

### Flujo de Select Menu (2 niveles)

1. Usuario ejecuta `/catalogo` → bot responde con type 4 (embed + Select de SECCIONES — `sec-select`)
2. Usuario elige sección (`libros` | `recursos-educativos` | `periodico-exploracion-y-ciencia` | `revista-azara`) → bot consulta las categorías de ESA sección:
   - libros → `GET /api/categorias` filtrado por `seccion === 'libros'` (13)
   - recursos-educativos → `GET /api/categorias` filtrado por `seccion === 'recursos-educativos'` (10 grupos: Cuadernillos, Posters de…, etc.)
   - hemeroteca → `GET /api/categorias` filtrado por su sección: 1 sola categoría (la publicación)
3. **Salto directo de hemeroteca (PLANV3 V3.6)**: si la sección tiene `categorias.length === 1`, el bot saltea el select de categorías y muestra DIRECTAMENTE las ediciones (`GET /api/catalogo?categoria=<nombre>` + `construirMensajeCategoriaLibros`) — con ◀/▶ y 🔙 que vuelve al PASO 1 (select de secciones).
4. Usuario elige categoría → el bot consulta `?categoria=` (match por nombre o slug: vale para libros, RE y hemeroteca) y hace PATCH con ítems + ◀/▶ + 🔙 Volver
5. Usuario clickea 🔙 → bot vuelve al paso 3 (select de categorías) en libros/RE; en hemeroteca vuelve al paso 1 (select de secciones)

### Flujo del toggle de titulares (/ficha)

1. Usuario ejecuta `/ficha <id>` de un ítem CON titulares (hemeroteca) → `comandoLibro` devuelve `formatos.construirMensajeLibro(libro, false)` (type 4): embed compacto SIN el field 🗞️ + botón `📖 Ver titulares (N)` con `custom_id = {cmd:'tits-toggle', id, v:false}`
2. Usuario clickea el botón → Discord envía MESSAGE_COMPONENT
3. Bot responde type 6 (DEFERRED_UPDATE_MESSAGE)
4. Bot hace `GET /api/catalogo/<id>` y re-renderiza con `construirMensajeLibro(libro, !v)` (PATCH al mensaje original) — el embed ahora incluye el field 🗞️ y el botón pasa a `🔽 Ocultar titulares` con `v:true`
5. Click de nuevo → mismo camino, invierte el estado

Notas:
- **Discord no tiene "colapsar"**: el toggle es el bot RE-RENDERIZANDO el mensaje entero (el estado vive en el `custom_id`, no en el bot). Funciona indefinidamente: cada click trae un token de interacción fresco.
- **Estado COMPARTIDO** (límite de la plataforma): el mensaje es único → si alguien abre/cierra, lo ven todos. Aceptado por el usuario (2026-10-14).
- **Solo `/ficha`**: `/buscar` (solo titular coincidente) y los listados de categoría NO llevan este botón.
- Ítems SIN titulares (libros/RE): `construirMensajeLibro` NO devuelve `components` (sin botón).

### Convención de etiquetas (formatos.js)

- Emoji de SECCIÓN primero: `📚 Libros` | `🎓 Recursos educativos` | `🗞️ Periódico Exploración y Ciencia` | `📰 Revista Azara`
- Emoji de CATEGORÍA segundo: `📁` (la categoría REAL de navegación)
- En RE la categoría = `categorias[0]` (el grupo: 'Cuadernillos', 'Cartillas', 'Posters de…'); `coleccion` es la SERIE hiperespecífica (hoy solo 'Miradas de la Argentina'); 'Recursos Educativos' es la SECCIÓN, no una categoría
- Enlace de PDF SIEMPRE al final del value del campo
- En HEMEROTECA el título del embed de ítems de categoría NO repite la categoría (la única categoría ES la publicación): `🗞️ Periódico Exploración y Ciencia` — sin `: Categoría` (fix E2E piloto 2026-09-27; `construirMensajeCategoriaLibros` usa `SECCIONES_HEMEROTECA.has(sec)`)
- Ítems bilingües (`linkPdfEn`, p.ej. folleto El Shincal de Quimivil): dos enlaces `📄 [Descargar PDF]` (ES) + `📄 [Descargar PDF (EN)]` — EN siempre como última línea (helper `enlacesPdf` en formatos.js)
- `🗂️ Colección` como línea extra SI el ítem trae `coleccion` (desambigua series "Tomo NN" en libros, y 'Miradas de la Argentina' en RE)
- **`/ficha`**: el embed se arma con `construirMensajeLibro(libro, mostrarTitulares)` (NO inline en index.js — refactor 2026-10-14). El field `🗞️ Titulares` se incluye solo si el ítem tiene titulares Y `mostrarTitulares` es true; el listado es `• ` + titular, truncado a ~1000 chars con contador `(mostrando X de N titulares)` (límite de field: 1024). El botón del toggle solo existe para ítems CON titulares.

## Gotchas

### Scraping
- **CloudFlare bloquea Axios/Cheerio** (403) — solo Playwright funciona
- **2 categorías tenían URLs incorrectas** originalmente — corregidas manualmente
- **Auspiciados (59 libros) no tienen PDF** — solo metadata
- El scraper espera 800ms entre libros y 2000ms entre categorías
- `GUARDAR_CADA = 5` en scripts/scraper-playwright.js
- Algunas páginas no tienen `<h4>` para el título — hay fallback con párrafos
- **Guard anti-borrado (Fix A, 2026-10-16)**: al cerrar cada categoría el scraper verifica, POR URL, que cada entrada del listado haya producido ≥1 ítem. Si alguna NO (excepción de red, o ficha sin título → `registrarItem` no pushea), la categoría quedó INCOMPLETA → **NO se sobrescribe** `libros-<cat>.json` (y se borra su `.temp.json` para no envenenar el resume), y la corrida termina con `process.exitCode = 1`. MOTIVO: el archivo se PISA con `items`, así que un fallo por-URL borraba el libro EN SILENCIO (caso real: "Parque Costero del Sur" 2009, 2026-10-16). CAVEAT: una ficha rota de forma PERSISTENTE en el sitio deja esa categoría stale (preferible a perder data); el exit 1 corta el `&&` de la cadena de cron (fail-loud, corre `reportar-cambios.js` sólo si el scrape salió limpio).
- **Filtro de URLs tolerante a `www.` (Fix C, 2026-10-16)**: `obtenerUrlsLibros` acepta `http(s)://` con o sin `www.` y slash final opcional, anclado a ambos lados (rechaza subdominios como `educacion.` y paths de 2 niveles). Antes exigía el host pelado `https://fundacionazara.org.ar/` → las fichas enlazadas con `www.` se DESCARTABAN en silencio.
- **Hemeroteca (PLANV3 V3.6)**: las páginas de periódico/revista son grillas portfolio Qode Bridge (`article.mix`) — extractores dedicados `obtenerUrlsPortafolio`/`obtenerDatosPortafolio`. El título del ítem sale de `.portfolio_title a` POR CLASE (h6 en Periódico, h5 en Revista Azara — NO filtrar por tag) y la portada de `src || data-src || data-lazy-src`. El PDF de la edición se busca con `a.qodef-qi-button[href$=".pdf"]` (el botón qodef solo trae PDF de la edición, texto "Descargar archivo"; las ediciones viejas de Revista Azara usan `http://www.` en el href — `normalizarHostUrl` cubre el dedup); si hay MÁS de 1 PDF (normas/autores) se setea `revisionPendiente` (cortafuegos humano, fase 2 Revista Azara). Titulares de Revista Azara MIXTOS (verificado 2026-09-27 N14 y N1): modernas usan 1 `<p>` por titular (bullet "•" en `<span lang="ES-MX">`, salvo el primero que viene crudo), ediciones viejas (N1 2013) usan UN solo `<p>` con `<br>` (el primer bullet envuelto en `<strong>`) — `extraerTitularesDeHtml` cubre ambos (split por `<br>` Y por `</p>` en cadena). Secciones: `periodico-exploracion-y-ciencia` (🗞️, piloto 3 eds) y `revista-azara` (📰, fase 2, 14 eds). El scraper lo corre SIEMPRE el usuario: `node scripts/scraper-playwright.js --seccion=<slug>`

### Discord Bot
- **NGROK** debe apuntar al bot (puerto 3001), no al backend
- La verificación de firma usa `tweetnacl` con cabeceras `X-Signature-Ed25519` y `X-Signature-Timestamp`
- El raw body debe capturarse ANTES de `express.json()` — se marca `req._body = true` para evitar doble parse
- **Custom IDs únicos**: No duplicar custom_ids entre botones (Discord puede rechazar el PATCH)
- **Una sola ActionRow**: Al hacer PATCH a mensajes con componentes, usar una sola fila de botones (múltiples ActionRows pueden dar error `{"components":["0"]}`)
- **Select Menu**: El valor seleccionado está en `interaction.data.values[0]`, NO en el `custom_id`
- **Toggle de titulares**: el estado NO se guarda en el bot — viaja en el `custom_id` (`v`). Es estado COMPARTIDO del mensaje (Discord no tiene estado por-usuario en componentes): si dos personas clickean, el último gana. Aceptado por el usuario.
- **Tests**: `npm test` en `discord-bot/` corre `test-formatos.js` (zero-deps, `node`). Los tests deben vivir en el REPO — los que se dejaron en temp se perdieron (2026-10-14).
- **Command registration ≠ restart (dos sistemas desacoplados)**: `register.js` hace `PUT` a Discord (overwrite global) → cambia **qué comandos ve el usuario** (y borra el viejo al renombrar). El bot (`index.js`) NO lee la lista de Discord: matchea `interaction.data.name` contra su `switch`. Por eso renombrar/agregar un comando necesita **DOS pasos independientes**: (1) `npm run register` (cambia lo que se VE) y (2) REINICIAR el bot (cambia lo que puede ATENDER). Sin (2), el comando nuevo cae en `default` → "❌ Comando no reconocido". OJO: reiniciar el bot NO cambia la lista de comandos; ver "no pasa nada" al reiniciar es esperado. Los global commands pueden tardar en propagarse.

## Data Model

```json
{
  "id": "lib-abc123",
  "titulo": "string",
  "linkPdf": "string | null",
  "imagenPortada": "string",
  "autor": "string | null",
  "anio": "number | null",
  "fechaExtraccion": "ISO string",
  "linkPdfEn": "string (opcional — versión en inglés, ítems bilingües)",
  "revisionPendiente": "bool (opcional — esqueleto curado sin PDF, p.ej. postal con página rota)",
  "titulares": ["string", "..." ] (opcional — SOLO hemeroteca, PLANV3 V3.6: titulares de la edición SIN bullet; hacen encontrable el ítem en /buscar y se listan en /ficha en el campo 🗞️ Titulares — OCULTOS por defecto, el botón toggle los muestra/oculta. NO se muestran en listados de categorías; en los RESULTADOS de /buscar se muestra SOLO el/los titular(es) COINCIDENTE(S) con el término como contexto del match — "• " + titular, máx 2 + "…y N más" según las coincidencias. Helpers puros en formatos.js: `normalizarBusqueda` (MISMA semántica que libros.js L146, conserva la ñ) y `titularesCoincidentes(libro, termino)`)"
}
```

Los archivos de libros (`data/libros/*.json`) NO tienen campo `categoria`: el backend la asigna en tiempo real desde el SLUG DEL ARCHIVO (por eso 13 archivos = 13 categorías de libros), agrega `seccion` según la CARPETA, y `categorias` (ARRAY con TODAS las categorías donde figura el ítem — normalmente una sola; un libro multi-categoría comparte id y las acumula). **El ítem expuesto NO lleva `categoria` singular** (redundancia eliminada 2026-10-15): los consumidores leen `categorias`.
**EXCEPCIÓN — hemeroteca (PLANV3 V3.6)**: los ítems de `data/periodico-exploracion-y-ciencia/*.json` y `data/revista-azara/*.json` SÍ llevan `categoria` en el archivo (con acentos: "Periódico Exploración y Ciencia") — el backend lo usa como FUENTE del nombre de categoría (lo agrupa por `item.categoria` en `listarCategorias`, `src/lib/datos.js`) pero lo DESCARTA del ítem expuesto, que sale con `categorias`.
**EXCEPCIÓN — Recursos Educativos (`data/recursos-educativos/recursos-educativos.json`)**: cada ítem lleva `categoria` en el archivo (el grupo: 'Cuadernillos', 'Cartillas', 'Posters de Biodiversidad', ...) = la categoría de navegación de la sección; es el MISMO caso que la hemeroteca (la categoría viaja en el archivo, no en el nombre). El backend lo descarta y expone `categorias`. Además, algunos ítems traen `coleccion` (serie hiperespecífica: 'Miradas de la Argentina') que SÍ se conserva en el ítem expuesto. La hemeroteca NO lleva `coleccion` (la categoría única YA es la publicación).
Los esqueletos (`linkPdf: null` + `revisionPendiente: true`) quedan listados por `scripts/validar-data.js` en el "Portal de revisión humana" para completar vía PR (política: la cura manual no se re-scrapea).

## Branches

- `master` / `develop` — versión estable
- `optimization` — scraper optimizado (mergeado a develop)
