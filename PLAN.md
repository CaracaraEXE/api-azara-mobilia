# PLAN.md - API Azara

> **Última actualización:** 29/05/2026

## 📌 Resumen del Proyecto

**Objetivo:** API que extraiga (scraping) libros y PDFs de fundacionazara.org.ar y los exponga via un bot de Discord.

**Dominio:** Fundación Azara — ciencias biológicas, geológicas, paleontológicas y antropológicas de Buenos Aires.

**Frontend:** Bot de Discord con comandos slash (`/buscar`, `/libro`, `/categorias`) + componentes interactivos (botones, Select Menu).

## 🗂️ Estado Actual

- ✅ Estructura mono-repo (backend + discord-bot)
- ✅ Express.js con API Routes (backend en puerto 3000)
- ✅ API dinámica (lee JSONs individuales por categoría)
- ✅ **13/13 categorías scrapeadas** — 267 libros total
- ✅ 190 libros con PDF descargable (71.2%)
- ✅ Scraper Playwright (navegador real, evita CloudFlare)
- ✅ Scraper Cheerio retirado → `scraper-cheerio-old.js` (guardado para estudio)
- ✅ Schema simplificado (sin `descripcion` ni `paginas`)
- ✅ Scraper optimizado (CLI args, guardado incremental, fallback título) — mergeado a `develop`
- ✅ **Discord Bot funcionando** — Express + HTTP Interactions (sin discord.js)
- ✅ Paginación con botones en `/buscar`
- ✅ **Select Menu** de categorías con paginación + botón "Volver"
- ✅ IDs de libros visibles en resultados
- 🔲 Deploy en Railway
- 🔲 Migración a PostgreSQL

## 📝 Decisiones Tomadas

| Decisión | Detalle |
|----------|---------|
| API Backend | Express.js (estándar industria) |
| Frontend | Bot de Discord (interfaz pública, HTTP Interactions) |
| Scraper | **Playwright** (CloudFlare bloquea Axios/Cheerio) |
| DB Inicial | JSON por categoría (`data/libros-*.json`) |
| DB Final | PostgreSQL (migración posterior) |
| Bot Architecture | Express standalone (puerto 3001), HTTP Interactions Endpoint |
| Auth Bot | **tweetnacl** (verificación Ed25519, sin discord.js) |
| Comandos | Slash commands vía Discord API (registro con register.js) |
| Paginación | Botones interactivos (Message Components) |
| Navegación cat. | Select Menu (dropdown) + botón "Volver" |
| Hosting | Railway (API + Bot) |
| Cronjob | cron-job.org (gratis, llama endpoint) |

## 📦 Estructura de Datos (JSON Individual por Categoría)

### Archivo por categoría

Cada categoría tiene su propio archivo JSON en `data/libros-[slug].json`:

```
data/
├── libros-institucionales.json                10 libros
├── libros-paleontologia.json                  17 libros
├── libros-astronomia-y-geologia.json           9 libros
├── libros-evolucion-genetica-ecologia-y-etologia.json   5 libros
├── libros-divulgacion-cientifica.json          1 libro
├── libros-historia-de-la-ciencia.json         35 libros
├── libros-ambiente.json                       12 libros
├── libros-antropologia.json                   29 libros
├── libros-flora-y-fauna.json                  63 libros
├── libros-areas-naturales.json                21 libros
├── libros-patrimonio-cultural.json             5 libros
├── libros-infantiles.json                      8 libros
├── libros-auspiciados.json                    52 libros
```

**Total: 267 libros | 190 con PDF (71.2%) | 77 sin PDF**

### Estructura de cada archivo JSON

```json
[
  {
    "id": "lib-abc123",
    "titulo": "Enciclopedia de los Dinosaurios Argentinos",
    "linkPdf": "https://fundacionazara.org.ar/img/libros/...",
    "imagenPortada": "https://fundacionazara.org.ar/wp-content/uploads/...",
    "autor": "José F. Bonaparte",
    "anio": 2024,
    "fechaExtraccion": "2026-05-07T15:30:00.000Z"
  }
]
```

### Campos de un libro

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Identificador único (`lib-` + 8 aleatorio) |
| `titulo` | string | Nombre del libro |
| `linkPdf` | string/null | URL al PDF (null si no tiene) |
| `imagenPortada` | string/null | URL de la imagen de portada |
| `autor` | string/null | Autor del libro |
| `anio` | number/null | Año de publicación |
| `fechaExtraccion` | string | Cuándo fue extraído (ISO 8601) |

> ⚠️ **Nota:** Auspiciados (52 libros) no tienen PDF descargable.

### URLs corregidas

Dos categorías tenían URLs incorrectas originalmente, corregidas durante el scraping:

| Categoría | URL original (404) | URL correcta |
|-----------|--------------------|--------------|
| Exploraciones, historia de la ciencia y biografías | `/libros/libros-de-historia-de-la-ciencia/` | `/libros-de-exploraciones-historia-de-la-ciencia-y-biografias/` |
| Historia y patrimonio cultural | `/libros/libros-de-patrimonio-cultural/` | `/libros-de-historia-y-patrimonio-cultural/` |

## 🤖 Discord Bot — Arquitectura

```
┌──────────────┐     POST /interactions     ┌──────────────────┐
│   Usuario    │ ◄──────────────────────►   │  Discord Bot     │
│   Discord    │     (HTTP Interactions)     │  localhost:3001   │
└──────────────┘                             └────────┬─────────┘
                                                      │ HTTP (fetch)
                                                      ▼
                                               ┌──────────────┐
                                               │   Backend     │
                                               │  localhost:3000│
                                               └──────────────┘
```

- **Servidor Express standalone** (puerto 3001)
- **Sin discord.js** — usa HTTP Interactions Endpoint + verificación Ed25519 con `tweetnacl`
- **Commands registration**: `register.js` (una sola vez por guild)
- **NGROK** para desarrollo local (apunta al puerto 3001)

### Comandos e interacciones

| Comando / Interacción | Qué hace |
|-----------------------|----------|
| `/buscar [termino]` | Busca libros por título, muestra 5 por página con botones ◀/▶ |
| `/libro [id]` | Muestra detalle de un libro específico |
| `/categorias` | Lista categorías + **Select Menu** dropdown |
| → Select Menu | Muestra libros de esa categoría con botones ◀/▶ + 🔙 Volver |
| → ◀ / ▶ | Paginación (navega entre páginas de resultados) |
| → 🔙 Volver | Vuelve al listado general de categorías |

### Detalles de implementación

- **Botones**: `Message Components` type 2, con `custom_id` en JSON con el comando y estado (`{"cmd":"buscar","q":"mamiferos","p":1}`)
- **Select Menu**: `Message Components` type 3, envía el valor seleccionado en `interaction.data.values[0]`
- **Paginación**: Usa `DEFERRED_UPDATE_MESSAGE` (type 6) + PATCH al mensaje original via webhook
- **IDs en resultados**: Cada libro muestra `🆔 \`lib-abc123\`` para poder usar `/libro`
- **Una sola ActionRow**: Todos los botones en una fila para evitar errores de PATCH

## 🔄 Plan de Escalabilidad (JSON → PostgreSQL)

```
FASE 1 (Ahora)          FASE 2 (Después)
─────────────────       ─────────────────
JSON como storage   →   PostgreSQL
Scraper → JSON      →   Scraper → PostgreSQL
API lee JSON        →   API lee PostgreSQL
```

**Por qué este enfoque:**
1. Empezamos rápido con algo funcional
2. Aprendemos Express sin complejidad de DB
3. La migración a PostgreSQL será más fácil cuando entendamos la API

## 📋 Roadmap de Desarrollo

### Fase 1: Base ✅
- [x] Estructura mono-repo
- [x] Express.js configurado
- [x] Dependencias instaladas (express, playwright, cors, dotenv)

### Fase 2: API Express ✅
- [x] GET /api/libros (listar + filtrar)
- [x] GET /api/libros/:id (uno solo)
- [x] GET /api/categorias (lista de categorías)
- [x] GET /api/libros/stats/general (estadísticas)

### Fase 3: Scraping ✅
- [x] Scraper Playwright funcional (navegador real)
- [x] Scraper Cheerio retirado (bloqueado por CloudFlare)
- [x] **13/13 categorías scrapeadas**
- [x] 267 libros extraídos (190 con PDF)
- [x] URLs corregidas para 2 categorías
- [x] Schema simplificado (sin descripcion/paginas)
- [x] Scraper optimizado:
  - [x] Argumentos CLI (`--categoria=X`, `--todas`)
  - [x] Guardado incremental cada 5 libros
  - [x] Fallback para títulos sin `<h4>`
  - [x] `npm run scrape-todas`

### Fase 4: Discord Bot ✅
- [x] Servidor Express standalone (puerto 3001)
- [x] Verificación Ed25519 con tweetnacl
- [x] Comando `/buscar` con paginación por botones
- [x] Comando `/libro`
- [x] Comando `/categorias` con Select Menu
- [x] Paginación por categoría con botones ◀/▶
- [x] Botón "Volver" a lista de categorías
- [x] IDs de libros visibles en resultados
- [x] Registro de comandos slash (register.js)

### Fase 5: PostgreSQL (futuro) 🔲
- [ ] Crear cuenta Railway + PostgreSQL
- [ ] Definir schema SQL
- [ ] Migrar datos de JSON
- [ ] Actualizar API para usar DB

### Fase 6: Deploy 🔲
- [ ] Deploy Express en Railway
- [ ] Deploy Discord Bot
- [ ] Configurar cron-job.org

## 📁 Estructura del Proyecto

```
azara/
├── backend/
│   ├── src/
│   │   ├── index.js             ← entry point Express (puerto 3000)
│   │   ├── routes/
│   │   │   ├── libros.js        ← endpoints /api/libros
│   │   │   └── categorias.js    ← endpoint /api/categorias
│   │   └── data/
│   │       ├── libros-*.json    ← 13 archivos (uno por categoría)
│   │       └── libros-*.temp.json ← progreso temporal (autogenerado)
│   ├── scripts/
│   │   ├── scraper-playwright.js   ← scraper activo (Playwright)
│   │   ├── scraper-cheerio-old.js  ← scraper retirado (referencia)
│   │   ├── extraerLibros.js        ← extrae de páginas individuales
│   │   └── combinarLibros.js       ← combina en archivo de categoría
│   └── package.json
│
├── discord-bot/
│   ├── src/
│   │   ├── index.js             ← Express Interactions Endpoint (puerto 3001)
│   │   └── register.js          ← registro único de comandos slash
│   ├── .env.example
│   └── package.json
│
├── AGENTS.md                    ← contexto para la IA
├── CLAUDE.md                    ← referencia a AGENTS.md
├── PLAN.md
├── README.md
├── SESSION.md                   ← notas históricas de desarrollo
└── .env.example
```

## 🔗 Links Importantes

- Sitio web: https://fundacionazara.org.ar
- Catálogo libros: https://fundacionazara.org.ar/libros/
- Railway: https://railway.app
- Cron-job.org: https://cron-job.org
- Discord Developer Portal: https://discord.com/developers

## 💡 Notas Técnicas

- El scraper detecta libros nuevos/eliminados automáticamente
- Bot de Discord requiere **3 variables** en `.env`: `DISCORD_PUBLIC_KEY`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`
- NGROK debe apuntar al bot (puerto 3001), no al backend (puerto 3000)
- La verificación de firma usa `tweetnacl` con las cabeceras `X-Signature-Ed25519` y `X-Signature-Timestamp`
- El raw body debe capturarse ANTES de `express.json()` para poder verificar la firma
- Playwright necesita Chromium: `npx playwright install chromium`
- El sitio usa CloudFlare → solo Playwright (navegador real) funciona
- Variables de entorno: `PORT`, `API_URL`, `DISCORD_PUBLIC_KEY`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`

---

*Ver README.md para documentación extendida.*
