# Project Context — API Azara

API REST + Discord Bot para catalogar libros de la Fundación Azara (fundacionazara.org.ar).

## Current State (Sep 2026)

- ✅ **13/13 categorías scrapeadas** (data/libros/) + **Recursos Educativos** (data/recursos/) + **hemeroteca COMPLETA (2026-09-27): 3 ediciones** del Periódico (data/periodico-exploracion-y-ciencia/) + **14 ediciones** de Revista Azara (data/revista-azara/) — 452 ítems totales (326 libros + 109 RE + 3 + 14; 1 esqueleto en revisión: postal Guacamayo Militar)
- ✅ **PLANV3 V3.6 — Hemeroteca (2026-09-27)**: scraper + API + bot listos y EN PRODUCCIÓN para las SECCIONES `periodico-exploracion-y-ciencia` (Periódico Exploración y Ciencia, 🗞️) y `revista-azara` (Revista Azara, 📰). **Piloto + E2E COMPLETO + FASE 2 COMPLETA** (validado por el usuario en Discord): búsqueda por titulares con titular coincidente, salto directo a ediciones (sin título duplicado), `/libro` con campo 🗞️ Titulares, regresión libros/RE limpia. Estructura de Revista Azara VERIFICADA antes de correr (grilla v4 con `h5.portfolio_title`, PDF único `a.qodef-qi-button[href$=".pdf"]` por edición, titulares mixtos modernas `<p>` / viejas `<br>` — todo cubierto sin cambios). El cortafuegos `revisionPendiente` quedó disponible como red de seguridad (no se disparó en Fase 2: los PDFs de Normas para Autores viven en la página de SECCIÓN, fuera de `article.mix`). El scraper lo corre SIEMPRE el usuario: `node scripts/scraper-playwright.js --seccion=<slug>`.
- ✅ Datos en carpetas por sección: `data/libros/libros-*.json` (13) + `data/recursos/recursos-educativos.json` (1 archivo, campo `coleccion` = subgrupo)
- ✅ API Express.js funcionando con endpoints GET (respuestas con campo `seccion: 'libros'|'recursos'`)
- ✅ Scraper con CLI: `--todas` / `--seccion=<slug>` / `--categoria=<slug>` (mutuamente excluyentes)
- ✅ **Discord Bot funcionando** — Express + HTTP Interactions (sin discord.js)
- ✅ Botones de paginación ◀/▶ en `/buscar` y categorías
- ✅ `/categorias` en 2 niveles: Select de SECCIONES → Select de categorías de esa sección
- ✅ Botón "Volver" a categorías de la MISMA sección
- ✅ IDs de libros visibles (`🆔 \`lib-abc123\``) en resultados
- ✅ Presentación del bot separada en `discord-bot/src/formatos.js` (pura, testeable sin servidor)

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
| `/libro [id]` | Muestra detalle de un libro (campos Sección + Categoría real) |
| `/categorias` | Select de SECCIONES (📚 Libros / 🎓 Recursos educativos / 🗞️ Periódico Exploración y Ciencia / 📰 Revista Azara) |
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

// Paginación de categoría (sec: 'libros'|'recursos'|'periodico-exploracion-y-ciencia'|'revista-azara'
// — define ?categoria= vs ?coleccion=)
{ cmd: 'cat-page', sec: 'libros', cat: 'Mastozoologia', p: 1 }
{ cmd: 'cat-page', sec: 'recursos', cat: 'Cuadernillos', p: 1 }
{ cmd: 'cat-page', sec: 'periodico-exploracion-y-ciencia', cat: 'Periódico Exploración y Ciencia', p: 1 }

// Volver a categorías de la MISMA sección (hemeroteca → vuelve al PASO 1, salto directo)
{ cmd: 'cat-back', sec: 'libros' }
{ cmd: 'cat-back', sec: 'recursos' }
{ cmd: 'cat-back', sec: 'revista-azara' }

// Select de secciones (paso 1; el valor está en interaction.data.values[0])
{ cmd: 'sec-select' }

// Select Menu de categorías (paso 2; el valor está en interaction.data.values[0])
{ cmd: 'cat-select', sec: 'libros' }
{ cmd: 'cat-select', sec: 'recursos' }

// Botones deshabilitados (nunca se clickean)
'noop', 'page-indicator', 'cat-page-indicator'
```

### Flujo de paginación

1. Usuario ejecuta `/buscar X` → bot responde con type 4 (embed + botones)
2. Usuario clickea ▶ → Discord envía MESSAGE_COMPONENT
3. Bot responde type 6 (DEFERRED_UPDATE_MESSAGE) para avisar que procesa
4. Bot consulta `GET /api/libros?busqueda=X&limite=5&pagina=N`
5. Bot hace PATCH al mensaje original via webhook de Discord
6. Mensaje se actualiza con nuevos resultados y botones

### Flujo de Select Menu (2 niveles)

1. Usuario ejecuta `/categorias` → bot responde con type 4 (embed + Select de SECCIONES — `sec-select`)
2. Usuario elige sección (`libros` | `recursos` | `periodico-exploracion-y-ciencia` | `revista-azara`) → bot consulta las categorías de ESA sección:
   - libros → `GET /api/categorias` filtrado por `seccion === 'libros'`
   - recursos → `GET /api/categorias` + `GET /api/libros/colecciones/lista` (las colecciones cuyos `categorias` pertenecen a la sección RE)
   - hemeroteca → `GET /api/categorias` filtrado por su sección: 1 sola categoría (la publicación)
3. **Salto directo de hemeroteca (PLANV3 V3.6)**: si la sección tiene `categorias.length === 1`, el bot saltea el select de categorías y muestra DIRECTAMENTE las ediciones (`GET /api/libros?categoria=<nombre>` + `construirMensajeCategoriaLibros`) — con ◀/▶ y 🔙 que vuelve al PASO 1 (select de secciones).
4. Usuario elige categoría → bot consulta `?categoria=` (libros Y hemeroteca) o `?coleccion=` (recursos) y hace PATCH con ítems + ◀/▶ + 🔙 Volver
5. Usuario clickea 🔙 → bot vuelve al paso 3 (select de categorías) en libros/RE; en hemeroteca vuelve al paso 1 (select de secciones)

### Convención de etiquetas (formatos.js)

- Emoji de SECCIÓN primero: `📚 Libros` | `🎓 Recursos educativos` | `🗞️ Periódico Exploración y Ciencia` | `📰 Revista Azara`
- Emoji de CATEGORÍA segundo: `📁` (la categoría REAL de navegación)
- En RE la categoría real = `coleccion` (subgrupo: 'Cuadernillos', ...); 'Recursos Educativos' es la SECCIÓN, no una categoría
- Enlace de PDF SIEMPRE al final del value del campo
- En HEMEROTECA el título del embed de ítems de categoría NO repite la categoría (la única categoría ES la publicación): `🗞️ Periódico Exploración y Ciencia` — sin `: Categoría` (fix E2E piloto 2026-09-27; `construirMensajeCategoriaLibros` usa `SECCIONES_HEMEROTECA.has(sec)`)
- Ítems bilingües (`linkPdfEn`, p.ej. folleto El Shincal de Quimivil): dos enlaces `📄 [Descargar PDF]` (ES) + `📄 [Descargar PDF (EN)]` — EN siempre como última línea (helper `enlacesPdf` en formatos.js)
- `🗂️ Colección` como línea extra SOLO en libros (desambigua series "Tomo NN"); en RE ya está en la categoría

## Gotchas

### Scraping
- **CloudFlare bloquea Axios/Cheerio** (403) — solo Playwright funciona
- **2 categorías tenían URLs incorrectas** originalmente — corregidas manualmente
- **Auspiciados (52 libros) no tienen PDF** — solo metadata
- El scraper espera 800ms entre libros y 2000ms entre categorías
- `GUARDAR_CADA = 5` en scripts/scraper-playwright.js
- Algunas páginas no tienen `<h4>` para el título — hay fallback con párrafos
- **Hemeroteca (PLANV3 V3.6)**: las páginas de periódico/revista son grillas portfolio Qode Bridge (`article.mix`) — extractores dedicados `obtenerUrlsPortafolio`/`obtenerDatosPortafolio`. El título del ítem sale de `.portfolio_title a` POR CLASE (h6 en Periódico, h5 en Revista Azara — NO filtrar por tag) y la portada de `src || data-src || data-lazy-src`. El PDF de la edición se busca con `a.qodef-qi-button[href$=".pdf"]` (el botón qodef solo trae PDF de la edición, texto "Descargar archivo"; las ediciones viejas de Revista Azara usan `http://www.` en el href — `normalizarHostUrl` cubre el dedup); si hay MÁS de 1 PDF (normas/autores) se setea `revisionPendiente` (cortafuegos humano, fase 2 Revista Azara). Titulares de Revista Azara MIXTOS (verificado 2026-09-27 N14 y N1): modernas usan 1 `<p>` por titular (bullet "•" en `<span lang="ES-MX">`, salvo el primero que viene crudo), ediciones viejas (N1 2013) usan UN solo `<p>` con `<br>` (el primer bullet envuelto en `<strong>`) — `extraerTitularesDeHtml` cubre ambos (split por `<br>` Y por `</p>` en cadena). Secciones: `periodico-exploracion-y-ciencia` (🗞️, piloto 3 eds) y `revista-azara` (📰, fase 2, 14 eds). El scraper lo corre SIEMPRE el usuario: `node scripts/scraper-playwright.js --seccion=<slug>`

### Discord Bot
- **NGROK** debe apuntar al bot (puerto 3001), no al backend
- La verificación de firma usa `tweetnacl` con cabeceras `X-Signature-Ed25519` y `X-Signature-Timestamp`
- El raw body debe capturarse ANTES de `express.json()` — se marca `req._body = true` para evitar doble parse
- **Custom IDs únicos**: No duplicar custom_ids entre botones (Discord puede rechazar el PATCH)
- **Una sola ActionRow**: Al hacer PATCH a mensajes con componentes, usar una sola fila de botones (múltiples ActionRows pueden dar error `{"components":["0"]}`)
- **Select Menu**: El valor seleccionado está en `interaction.data.values[0]`, NO en el `custom_id`
- **Command registration**: `register.js` registra comandos slash — se ejecuta una sola vez

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
  "titulares": ["string", "..." ] (opcional — SOLO hemeroteca, PLANV3 V3.6: titulares de la edición SIN bullet; hacen encontrable el ítem en /buscar y se listan en /libro en el campo 🗞️ Titulares. NO se muestran en listados de categorías; en los RESULTADOS de /buscar se muestra SOLO el/los titular(es) COINCIDENTE(S) con el término como contexto del match — "• " + titular, máx 2 + "…y N más" según las coincidencias. Helpers puros en formatos.js: `normalizarBusqueda` (MISMA semántica que libros.js L146, conserva la ñ) y `titularesCoincidentes(libro, termino)`)"
}
```

Los archivos JSON no tienen campo `categoria` — el backend lo asigna en tiempo real desde el slug del archivo, y agrega `seccion` ('libros' | 'recursos' | 'periodico-exploracion-y-ciencia' | 'revista-azara') según la carpeta.
**EXCEPCIÓN — hemeroteca (PLANV3 V3.6)**: los ítems de `data/periodico-exploracion-y-ciencia/*.json` y `data/revista-azara/*.json` SÍ llevan `categoria` en el archivo (con acentos: "Periódico Exploración y Ciencia") — la API respeta `libros[0].categoria` (libros.js L51-52); el resto de los archivos no la tienen → cero cambio.
Los ítems de RE (`data/recursos/recursos-educativos.json`) tienen además `coleccion` (subgrupo: 'Cuadernillos', 'Posters de Biodiversidad', ...) — es la categoría visible de esa sección. La hemeroteca NO lleva `coleccion` (la categoría única YA es la publicación).
Los esqueletos (`linkPdf: null` + `revisionPendiente: true`) quedan listados por `scripts/validar-data.js` en el "Portal de revisión humana" para completar vía PR (política: la cura manual no se re-scrapea).

## Branches

- `master` / `develop` — versión estable
- `optimization` — scraper optimizado (mergeado a develop)
