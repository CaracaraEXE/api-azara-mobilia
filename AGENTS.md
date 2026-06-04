# Project Context — API Azara

API REST + Discord Bot para catalogar libros de la Fundación Azara (fundacionazara.org.ar).

## Current State (May 2026)

- ✅ **13/13 categorías scrapeadas** — 267 libros total, 190 con PDF descargable (71.2%)
- ✅ API Express.js funcionando con endpoints GET
- ✅ Scraper optimizado: CLI args, guardado incremental, fallback título
- ✅ **Discord Bot funcionando** — Express + HTTP Interactions (sin discord.js)
- ✅ Botones de paginación ◀/▶ en `/buscar` y categorías
- ✅ Select Menu dropdown en `/categorias`
- ✅ Botón "Volver" a lista de categorías
- ✅ IDs de libros visibles (`🆔 \`lib-abc123\``) en resultados

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
| `/libro [id]` | Muestra detalle de un libro |
| `/categorias` | Lista categorías + Select Menu |
| → Select Menu | Muestra libros de esa categoría + ◀/▶ + 🔙 Volver |

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

// Paginación de categoría
{ cmd: 'cat-page', cat: 'Mastozoologia', p: 1 }

// Volver a categorías
{ cmd: 'cat-back' }

// Select Menu de categorías (el valor va en interaction.data.values[0])
{ cmd: 'cat-select' }

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

### Flujo de Select Menu

1. Usuario ejecuta `/categorias` → bot responde con type 4 (embed + Select Menu)
2. Usuario selecciona categoría → Discord envía MESSAGE_COMPONENT con `values: ["Nombre"]`
3. Bot responde type 6, consulta API, hace PATCH con libros + botones ◀/▶ + 🔙 Volver
4. Usuario clickea 🔙 → bot vuelve a mostrar categorías + Select Menu

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
  "fechaExtraccion": "ISO string"
}
```

Los archivos JSON no tienen campo `categoria` — el backend lo asigna en tiempo real desde el slug del archivo.

## Branches

- `master` / `develop` — versión estable
- `optimization` — scraper optimizado (mergeado a develop)
