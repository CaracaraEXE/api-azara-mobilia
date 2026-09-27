# Project Context — API Azara

API REST + Discord Bot para catalogar libros de la Fundación Azara (fundacionazara.org.ar).

## Current State (Sep 2026)

- ✅ **13/13 categorías scrapeadas** (data/libros/) + **Recursos Educativos** (data/recursos/) — 435 ítems totales (326 libros + 109 RE; 1 esqueleto en revisión: postal Guacamayo Militar)
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
| `/categorias` | Select de SECCIONES (📚 Libros / 🎓 Recursos educativos) |
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

// Paginación de categoría (sec: 'libros'|'recursos' — define ?categoria= vs ?coleccion=)
{ cmd: 'cat-page', sec: 'libros', cat: 'Mastozoologia', p: 1 }
{ cmd: 'cat-page', sec: 'recursos', cat: 'Cuadernillos', p: 1 }

// Volver a categorías de la MISMA sección
{ cmd: 'cat-back', sec: 'libros' }
{ cmd: 'cat-back', sec: 'recursos' }

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
2. Usuario elige sección (`libros` | `recursos`) → bot consulta las categorías de ESA sección:
   - libros → `GET /api/categorias` filtrado por `seccion === 'libros'`
   - recursos → `GET /api/categorias` + `GET /api/libros/colecciones/lista` (las colecciones cuyos `categorias` pertenecen a la sección RE)
3. Bot hace PATCH con embed de estadísticas + Select de categorías (`cat-select` con `sec`)
4. Usuario elige categoría → bot consulta `?categoria=` (libros) o `?coleccion=` (recursos) y hace PATCH con ítems + ◀/▶ + 🔙 Volver
5. Usuario clickea 🔙 → bot vuelve al paso 3 de la MISMA sección (cat-back lleva `sec`)

### Convención de etiquetas (formatos.js)

- Emoji de SECCIÓN primero: `📚 Libros` | `🎓 Recursos educativos`
- Emoji de CATEGORÍA segundo: `📁` (la categoría REAL de navegación)
- En RE la categoría real = `coleccion` (subgrupo: 'Cuadernillos', ...); 'Recursos Educativos' es la SECCIÓN, no una categoría
- Enlace de PDF SIEMPRE al final del value del campo
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
  "revisionPendiente": "bool (opcional — esqueleto curado sin PDF, p.ej. postal con página rota)"
}
```

Los archivos JSON no tienen campo `categoria` — el backend lo asigna en tiempo real desde el slug del archivo, y agrega `seccion` ('libros' | 'recursos') según la carpeta.
Los ítems de RE (`data/recursos/recursos-educativos.json`) tienen además `coleccion` (subgrupo: 'Cuadernillos', 'Posters de Biodiversidad', ...) — es la categoría visible de esa sección.
Los esqueletos (`linkPdf: null` + `revisionPendiente: true`) quedan listados por `scripts/validar-data.js` en el "Portal de revisión humana" para completar vía PR (política: la cura manual no se re-scrapea).

## Branches

- `master` / `develop` — versión estable
- `optimization` — scraper optimizado (mergeado a develop)
