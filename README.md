# API Azara - Fundación Azara

API REST + Bot de Discord para catalogar y acceder a libros de la Fundación Azara.

## 📋 Descripción

La **Fundación Azara** es una organización enfocada en la investigación sobre ciencias biológicas, geológicas, paleontológicas y antropológicas de Buenos Aires.

Este proyecto permite:
1. **Extraer** libros y archivos PDF del sitio web de la Fundación Azara
2. **Catalogarlos** por categoría y otros datos disponibles
3. **Acceder** a través de una API REST o un bot de Discord con comandos slash interactivos

## 🛠️ Stack Tecnológico

| Tecnología | Propósito |
|------------|-----------|
| **Express.js** | API REST (backend, puerto 3000) |
| **Express.js** | Discord HTTP Interactions Endpoint (bot, puerto 3001) |
| **Archivo JSON** | Storage inicial (uno por categoría) |
| **Playwright** | Scraping con navegador real (evita CloudFlare) |
| **tweetnacl** | Verificación de firma Ed25519 (discord-bot) |
| **PostgreSQL** | Base de datos (futuro/to-do) |

> **Nota:** El bot de Discord NO usa discord.js — implementa HTTP Interactions Endpoint directamente con Express + tweetnacl.

## 📚 Categorías de la Fundación Azara

Los libros están organizados en **13 categorías**. Actualmente **334 libros listados** (**322 obras únicas** — algunos figuran en más de una categoría), **218 con PDF descargable**.

> El catálogo completo (libros + Recursos Educativos + hemeroteca: Periódico y Revista Azara) suma **448 ítems únicos** en **4 secciones**, **329 con PDF**. El desglose por sección está en `/api/catalogo/stats/general`.

| # | Categoría | Libros | Con PDF | URL |
|---|-----------|:------:|:-------:|-----|
| 1 | Institucionales | 10 | 10 | `/libros/` |
| 2 | Astronomía y Geología | 9 | 6 | `/libros/libros-de-astronomia-y-geologia/` |
| 3 | Paleontología | 20 | 18 | `/libros/libros-de-paleontologia/` |
| 4 | Evolución, genética, ecología y etología | 6 | 6 | `/libros/libros-de-evolucion-genetica-ecologia-y-etologia/` |
| 5 | Divulgación científica | 3 | 0 | `/libros/libros-de-divulgacion-cientifica/` |
| 6 | Exploraciones, historia de la ciencia y biografías | 61 | 31 | `/libros-de-exploraciones-historia-de-la-ciencia-y-biografias/` |
| 7 | Ambiente | 11 | 11 | `/libros-de-ambiente/` |
| 8 | Antropología | 31 | 29 | `/libros/libros-de-antropologia/` |
| 9 | Flora y Fauna | **71** | 60 | `/libros/libros-de-flora-y-fauna/` |
| 10 | Áreas naturales | 28 | 23 | `/libros/libros-de-areas-naturales/` |
| 11 | Historia y patrimonio cultural | 6 | 6 | `/libros-de-historia-y-patrimonio-cultural/` |
| 12 | Infantiles | 19 | 18 | `/libros/libros-infantiles/` |
| 13 | Auspiciados | 59 | 0 | `/libros/libros-auspiciados/` |
| | **TOTAL** | **334** | **218** | |

> **Nota:** algunos libros figuran en más de una categoría (comparten `id`), por eso la suma de la columna "Libros" (**334**) supera las obras únicas de libros (**322**).

> ⚠️ **Nota sobre URLs:** Dos categorías tenían URLs incorrectas en la lista original. Fueron corregidas durante el desarrollo. Ver `PLAN.md` para detalles.

> ⚠️ **Nota sobre PDFs:** Auspiciados (59 libros) no tiene ningún PDF descargable — solo metadata y portada.

## 📦 Modelo de Datos

### Campos de un libro:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Identificador único (`lib-` + 8 aleatorio) |
| `titulo` | string | Nombre del libro |
| `linkPdf` | string/null | URL al PDF (null si no tiene) |
| `imagenPortada` | string/null | URL de la imagen de portada |
| `autor` | string/null | Autor del libro |
| `anio` | number/null | Año de publicación |
| `fechaExtraccion` | string | Cuándo fue extraído (ISO 8601) |

### Ejemplo de libro en JSON:

```json
{
  "id": "lib-abc123",
  "titulo": "Enciclopedia de los Dinosaurios Argentinos",
  "linkPdf": "https://fundacionazara.org.ar/img/libros/enciclopedia-dinosaurios.pdf",
  "imagenPortada": "https://fundacionazara.org.ar/wp-content/uploads/2017/02/enciclopedia-dinosaurios.jpg",
  "autor": "José F. Bonaparte",
  "anio": 2024,
  "fechaExtraccion": "2026-05-07T15:30:00.000Z"
}
```

> **Nota:** Los campos `descripcion` y `paginas` fueron eliminados del schema por no estar disponibles en el sitio.

> **`seccion`** (de la carpeta: `libros` \| `recursos-educativos` \| `periodico-exploracion-y-ciencia` \| `revista-azara`) y **`categorias`** (array con **todas** las categorías donde figura el ítem) los agrega el backend en runtime: NO están en el archivo. En **Recursos Educativos** el archivo trae `categoria` (los 10 grupos) y opcionalmente `coleccion` (serie hiperespecífica). En hemeroteca, `categoria` viaja en el archivo y `titulares` es opcional.

## 🏗️ Arquitectura del Proyecto

```
┌────────────────────────────────────────────────────────────────┐
│                      FUNDACIÓN AZARA                           │
│                   fundacionazara.org.ar                        │
└────────────────────────────┬───────────────────────────────────┘
                             │ (scraping con Playwright)
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                        SCRAPER (Playwright)                    │
│               scripts/scraper-playwright.js                    │
│                                                                │
│  Extrae: título, linkPdf, imagenPortada, autor, año            │
│  Guarda: data/<seccion>/<archivo>.json                         │
│  Soporta: --todas, --seccion=slug, --categoria=slug           │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                      JSON (Fase 1)                             │
│                    data/libros-*.json                          │
│                                                                │
│                ──────→  PostgreSQL (Fase 2, futuro)            │
└────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                       EXPRESS.JS API                            │
│             localhost:3000/api/catalogo                           │
│                                                                │
│  GET  /api/catalogo              → lista todos                   │
│  GET  /api/catalogo/:id          → uno solo                      │
│  GET  /api/catalogo?categoria=X  → filtrar                       │
│  GET  /api/categorias          → lista categorías              │
│  GET  /api/catalogo/stats/general → estadísticas                 │
└────────────────────────────┬───────────────────────────────────┘
                             │ (HTTP requests)
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                       DISCORD BOT                               │
│               Express + HTTP Interactions                       │
│               localhost:3001 (via NGROK)                        │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  /buscar mamiferos   → 5 res. + botones ◀ 1/3 ▶       │   │
│  │                       Cada libro muestra 🆔 id         │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  /ficha lib-abc123  → detalle del libro                │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  /categorias        → lista + Select Menu ▼            │   │
│  │    └─→ seleccionás  → libros + ◀/▶ + 🔙 Volver        │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

## 📁 Estructura del Proyecto (Mono-repo)

```
azara/
├── backend/                      ← API Express.js (puerto 3000)
│   ├── src/
│   │   ├── index.js             ← entry point
│   │   ├── routes/
│   │   │   ├── catalogo.js      ← endpoints /api/catalogo (+ stats, listas)
│   │   │   └── categorias.js    ← endpoint /api/categorias
│   │   └── data/
│   │       ├── libros/                     ← 13 archivos (uno por categoría)
│   │       ├── recursos-educativos/        ← Recursos Educativos (categoria = grupo; coleccion = serie)
│   │       ├── periodico-exploracion-y-ciencia/  ← Periódico (hemeroteca)
│   │       └── revista-azara/              ← Revista Azara (hemeroteca)
│   ├── scripts/
│   │   ├── scraper-playwright.js   ← scraper activo (--todas / --seccion / --categoria)
│   │   ├── scraper-cheerio-old.js  ← scraper retirado (referencia)
│   │   ├── extraerLibros.js        ← extrae de páginas individuales
│   │   ├── validar-data.js         ← valida data/ (esqueletos, duplicados)
│   │   └── reportar-cambios.js     ← reporte de cambios vs. snapshot
│   └── package.json
│
├── discord-bot/                  ← Bot de Discord / Frontend del proyecto (puerto 3001)
│   ├── src/
│   │   ├── index.js             ← Interactions Endpoint + comandos
│   │   └── register.js          ← registro único de comandos slash
│   ├── .env.example
│   └── package.json
│
├── AGENTS.md                    ← contexto para IA
├── PLAN.md                      ← roadmap y decisiones
├── README.md
├── SESSION.md                   ← notas históricas de desarrollo
└── .gitignore
```

## 🔗 Endpoints de la API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Info de la API (versión + lista de endpoints) |
| GET | `/api/catalogo` | Lista ítems del catálogo (paginación + filtros) |
| GET | `/api/catalogo/:id` | Obtiene un ítem por ID (`404` si no existe) |
| GET | `/api/catalogo/stats/general` | Estadísticas: totales + desglose por sección |
| GET | `/api/catalogo/categorias/lista` | Categorías (metadata: nombre, slug, cantidad, url) |
| GET | `/api/catalogo/colecciones/lista` | Colecciones/series (metadata, sin ítems) |
| GET | `/api/secciones` | Las 4 secciones: naturaleza y subdivisiones (categorías; cada categoría con sus colecciones) |
| GET | `/api/categorias` | Todas las categorías con su `seccion` (la usa el bot para navegar) |

> Cada categoría de `/api/categorias` trae su `seccion` (el bot filtra por ahí). `/api/secciones` da la vista anidada (sección → categorías → colecciones) para el bot y para descubrir la API.

### Parámetros de Query (GET /api/catalogo)

| Parámetro | Ejemplo | Descripción |
|-----------|---------|-------------|
| `busqueda` | `?busqueda=dinosaurio` | Busca en título, autor y titulares (ignora acentos/mayúsculas) |
| `categoria` | `?categoria=Paleontologia` | Filtra por categoría (match EXACTO de nombre o slug) |
| `coleccion` | `?coleccion=miradas` | Filtra por colección/serie (match parcial) |
| `seccion` | `?seccion=revista-azara` | Filtra por sección (`libros` \| `recursos-educativos` \| `periodico-exploracion-y-ciencia` \| `revista-azara`) |
| `pagina` | `?pagina=2` | Número de página (default `1`) |
| `limite` | `?limite=20` | Ítems por página (default `20`) |

Los filtros se pueden **combinar** (se aplican en AND): `?seccion=libros&categoria=flora-y-fauna&limite=5`.

### Cómo buscar (ejemplos)

```bash
# Búsqueda por texto libre (título, autor o titulares de hemeroteca)
curl "http://localhost:3000/api/catalogo?busqueda=huemul"

# Ítems de una categoría (acepta nombre exacto O slug)
curl "http://localhost:3000/api/catalogo?categoria=Flora+y+Fauna"
curl "http://localhost:3000/api/catalogo?categoria=flora-y-fauna"

# Ítems de una sección completa
curl "http://localhost:3000/api/catalogo?seccion=revista-azara"

# Una colección/serie (match parcial)
curl "http://localhost:3000/api/catalogo?coleccion=trazos"

# Combinar filtros + paginar
curl "http://localhost:3000/api/catalogo?seccion=libros&categoria=paleontologia&pagina=1&limite=5"

# Un ítem puntual por ID
curl "http://localhost:3000/api/catalogo/lib-3zgddm8g"
```

Respuesta de `GET /api/catalogo` (paginada):

```json
{
  "success": true,
  "data": [
    { "id": "lib-3zgddm8g", "titulo": "...", "categorias": ["Ambiente"], "seccion": "libros", "linkPdf": "..." }
  ],
  "meta": { "total": 448, "pagina": 1, "limite": 20, "totalPaginas": 23 }
}
```

## 🤖 Comandos del Bot de Discord

| Comando | Ejemplo | Descripción |
|---------|---------|-------------|
| `/buscar` | `/buscar paleontología` | Busca en todo el catálogo (título, autor y titulares). Muestra 5 por página con botones ◀/▶ |
| `/ficha` | `/ficha lib-abc123` | Detalle de un ítem. Si es hemeroteca, muestra el botón `📖 Ver titulares (N)` |
| `/categorias` | `/categorias` | Navegación en 2 niveles: **sección** → **categoría** → ítems con paginación |

### Características interactivas

- **Botones ◀ / ▶**: Navegación entre páginas de resultados (tanto en `/buscar` como en categorías)
- **Select Menu ▼**: `/categorias` navega en 2 niveles: primero la **sección** (📚 Libros / 🎓 Recursos educativos / 🗞️ Periódico / 📰 Revista Azara) y después sus categorías
- **🔙 Volver**: Vuelve a las categorías de la misma sección (en hemeroteca, al select de secciones)
- **🆔 ID visible**: Cada libro muestra su ID para poder usarlo con `/ficha`

## ✅ Roadmap de Desarrollo

### Fase 1: Setup ✅
- [x] Documentar arquitectura
- [x] Estructura mono-repo
- [x] Express.js configurado

### Fase 2: API Express ✅
- [x] GET /api/catalogo (listar + filtrar)
- [x] GET /api/catalogo/:id
- [x] GET /api/categorias
- [x] GET /api/catalogo/stats/general

### Fase 3: Scraping ✅
- [x] Playwright funcionando (navegador real, evita CloudFlare)
- [x] 13/13 categorías de libros scrapeadas (334 libros) + Recursos Educativos + hemeroteca (Periódico y Revista Azara)
- [x] Schema simplificado
- [x] Scraper optimizado (CLI, guardado incremental, fallback título)

### Fase 4: Discord Bot ✅
- [x] Servidor Express standalone (HTTP Interactions, sin discord.js)
- [x] Verificación Ed25519 con tweetnacl
- [x] Comando `/buscar` con paginación por botones
- [x] Comando `/ficha`
- [x] Comando `/categorias` con Select Menu + paginación + Volver
- [x] IDs de libros visibles en resultados

### Fase 5: PostgreSQL (futuro) 🔲
- [ ] Configurar base de datos PostgreSQL
- [ ] Definir schema SQL
- [ ] Migrar datos de JSON
- [ ] Actualizar API

### Fase 6: Deploy (pendiente) 🔲
- [ ] Deploy backend en la nube (Fly.io evaluado)
- [ ] Deploy Discord Bot

## 🚀 Cómo Ejecutar

### Backend (API)

```bash
cd backend

# Instalar dependencias
npm install

# Instalar Chromium para Playwright (para scraping)
npx playwright install chromium

# ─── SCRAPING ─────────────────────────────────────

# Scrapear categoría por defecto
npm run scrape-pw

# Scrapear una sección especifica
npm run scrape-pw -- -seccion=recursos-educativos

# Scrapear una categoría específica
npm run scrape-pw -- --categoria=flora-y-fauna

# Scrapear TODAS las categorías
npm run scrape-todas

# ─── API ───────────────────────────────────────────

# Iniciar servidor (producción)
npm start

# Iniciar servidor (desarrollo con auto-reload)
npm run dev
```

### Discord Bot

```bash
cd discord-bot

# Instalar dependencias
npm install

# Configurar .env (ver .env.example)
# Necesitas: DISCORD_PUBLIC_KEY, DISCORD_TOKEN, DISCORD_CLIENT_ID

# Registrar comandos slash (UNA SOLA VEZ por servidor)
npm run register

# Iniciar bot (desarrollo con auto-reload)
npm run dev

# Iniciar bot (producción)
npm start
```

### Ejecutar todo localmente (desarrollo)

Necesitás **3 terminales**:

| Terminal | Comando | Puerto |
|----------|---------|--------|
| 1️⃣ Backend | `cd backend && npm run dev` | 3000 |
| 2️⃣ Discord Bot | `cd discord-bot && npm run dev` | 3001 |
| 3️⃣ NGROK | `ngrok http 3001` | — |

> NGROK debe apuntar al **discord-bot** (puerto 3001), no al backend. La URL de NGROK se configura en el Discord Developer Portal como **Interactions Endpoint URL** (ej: `https://xxxx.ngrok-free.app/interactions`).

## 🔐 Variables de Entorno

### Backend (`backend/.env`)

```env
PORT=3000
API_URL=http://localhost:3000
DATA_DIR=./src/data
# Para Fase 5:
# DATABASE_URL=postgres://user:pass@host:5432/azara
```

### Discord Bot (`discord-bot/.env`)

```env
PORT=3001
API_URL=http://localhost:3000
DISCORD_PUBLIC_KEY=tu_public_key_aqui
DISCORD_TOKEN=tu_bot_token_aqui
DISCORD_CLIENT_ID=tu_client_id_aqui
```

> La `DISCORD_PUBLIC_KEY` se obtiene de la sección "General Information" de tu app en Discord Developer Portal.

## 📝 Notas de Desarrollo

- **CloudFlare**: El sitio usa CloudFlare, lo que bloquea peticiones HTTP simples (Axios/Cheerio devuelven 403). Se usa **Playwright** con navegador real para evitarlo.
- **Scraper optimizado**: Soporta argumentos CLI (`--todas`, `--seccion=<slug>`, `--categoria=<slug>`), guardado incremental, y fallback para páginas sin `<h4>`.
- **Guardado incremental**: Si el scraper se corta en una categoría grande, el progreso se guarda en un `.temp.json`. Al re-ejecutar, retoma desde donde quedó.
- **Reporte de cambios**: `npm run reporte:data` compara el catálogo actual contra un snapshot (`scripts/reportar-cambios.js`) y avisa si un libro cambió de categoría — pensado para el cron en la nube.
- **Datos**: 448 ítems únicos (322 libros + 109 recursos educativos + 3 del Periódico + 14 de Revista Azara), 329 con PDF descargable.
- **Enfoque incremental**: JSON primero → PostgreSQL después.
- **Bot sin discord.js**: Usa Express + HTTP Interactions + tweetnacl para verificar firmas. Más liviano y didáctico.
- **Paginación**: Los resultados usan `DEFERRED_UPDATE_MESSAGE` (type 6) + PATCH vía webhook de Discord.

---

*Proyecto de Programación - 4to año — Fundación Azara*
