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

Los libros están organizados en **13 categorías**. Actualmente **267 libros scrapeados**, **190 con PDF descargable (71.2%)**.

| # | Categoría | Libros | Con PDF | URL |
|---|-----------|:------:|:-------:|-----|
| 1 | Institucionales | 10 | 10 | `/libros/` |
| 2 | Astronomía y Geología | 9 | 6 | `/libros/libros-de-astronomia-y-geologia/` |
| 3 | Paleontología | 17 | 15 | `/libros/libros-de-paleontologia/` |
| 4 | Evolución, genética, ecología y etología | 5 | 5 | `/libros/libros-de-evolucion-genetica-ecologia-y-etologia/` |
| 5 | Divulgación científica | 1 | 0 | `/libros/libros-de-divulgacion-cientifica/` |
| 6 | Exploraciones, historia de la ciencia y biografías | 35 | 30 | `/libros-de-exploraciones-historia-de-la-ciencia-y-biografias/` |
| 7 | Ambiente | 12 | 12 | `/libros-de-ambiente/` |
| 8 | Antropología | 29 | 27 | `/libros/libros-de-antropologia/` |
| 9 | Flora y Fauna | **63** | 53 | `/libros/libros-de-flora-y-fauna/` |
| 10 | Áreas naturales | 21 | 20 | `/libros/libros-de-areas-naturales/` |
| 11 | Historia y patrimonio cultural | 5 | 5 | `/libros-de-historia-y-patrimonio-cultural/` |
| 12 | Infantiles | 8 | 7 | `/libros/libros-infantiles/` |
| 13 | Auspiciados | 52 | 0 | `/libros/libros-auspiciados/` |
| | **TOTAL** | **267** | **190** | |

> ⚠️ **Nota sobre URLs:** Dos categorías tenían URLs incorrectas en la lista original. Fueron corregidas durante el desarrollo. Ver `PLAN.md` para detalles.

> ⚠️ **Nota sobre PDFs:** Auspiciados (52 libros) no tiene ningún PDF descargable — solo metadata y portada.

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

## 🏗️ Arquitectura del Proyecto

```
┌────────────────────────────────────────────────────────────────┐
│                      FUNDACIÓN AZARA                           │
│                   fundacionazara.org.ar                        │
└────────────────────────────┬───────────────────────────────────┘
                             │ (scraping con Playwright)
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                        SCRAPER (Playwright)                     │
│               scripts/scraper-playwright.js                     │
│                                                                │
│  Extrae: título, linkPdf, imagenPortada, autor, año           │
│  Guarda: data/libros-[categoria].json (13 archivos)           │
│  Soporta: --categoria=slug, --todas, guardado incremental     │
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
│             localhost:3000/api/libros                           │
│                                                                │
│  GET  /api/libros              → lista todos                   │
│  GET  /api/libros/:id          → uno solo                      │
│  GET  /api/libros?categoria=X  → filtrar                       │
│  GET  /api/categorias          → lista categorías              │
│  GET  /api/libros/stats/general → estadísticas                 │
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
│  │  /libro lib-abc123  → detalle del libro                │   │
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
│   │   │   ├── libros.js        ← endpoints /api/libros
│   │   │   └── categorias.js    ← endpoint /api/categorias
│   │   └── data/
│   │       ├── libros-*.json    ← 13 archivos (uno por categoría)
│   ├── scripts/
│   │   ├── scraper-playwright.js   ← scraper activo
│   │   ├── scraper-cheerio-old.js  ← scraper retirado (referencia)
│   │   ├── extraerLibros.js        ← extrae de páginas individuales
│   │   └── combinarLibros.js       ← combina datos
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
| GET | `/api/libros` | Lista todos los libros (con paginación y filtros) |
| GET | `/api/libros/:id` | Obtiene un libro por ID |
| GET | `/api/categorias` | Lista categorías disponibles |
| GET | `/api/libros/stats/general` | Estadísticas generales |

### Parámetros de Query (GET /api/libros)

| Parámetro | Ejemplo | Descripción |
|-----------|---------|-------------|
| `busqueda` | `?busqueda=dinosaurio` | Busca en título y autor |
| `categoria` | `?categoria=paleontologia` | Filtrar por categoría |
| `pagina` | `?pagina=2` | Número de página |
| `limite` | `?limite=20` | Resultados por página |

## 🤖 Comandos del Bot de Discord

| Comando | Ejemplo | Descripción |
|---------|---------|-------------|
| `/buscar` | `/buscar paleontología` | Busca libros. Muestra 5 por página con botones ◀/▶ |
| `/libro` | `/libro lib-abc123` | Muestra detalle de un libro específico |
| `/categorias` | `/categorias` | Lista categorías con Select Menu. Al seleccionar una, muestra sus libros con paginación |

### Características interactivas

- **Botones ◀ / ▶**: Navegación entre páginas de resultados (tanto en `/buscar` como en categorías)
- **Select Menu ▼**: Menú desplegable con las 13 categorías al usar `/categorias`
- **🔙 Volver**: Vuelve al listado general de categorías
- **🆔 ID visible**: Cada libro muestra su ID para poder usarlo con `/libro`

## ✅ Roadmap de Desarrollo

### Fase 1: Setup ✅
- [x] Documentar arquitectura
- [x] Estructura mono-repo
- [x] Express.js configurado

### Fase 2: API Express ✅
- [x] GET /api/libros (listar + filtrar)
- [x] GET /api/libros/:id
- [x] GET /api/categorias
- [x] GET /api/libros/stats/general

### Fase 3: Scraping ✅
- [x] Playwright funcionando (navegador real, evita CloudFlare)
- [x] 13/13 categorías scrapeadas (267 libros)
- [x] Schema simplificado
- [x] Scraper optimizado (CLI, guardado incremental, fallback título)

### Fase 4: Discord Bot ✅
- [x] Servidor Express standalone (HTTP Interactions, sin discord.js)
- [x] Verificación Ed25519 con tweetnacl
- [x] Comando `/buscar` con paginación por botones
- [x] Comando `/libro`
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
- **Scraper optimizado**: Soporta argumentos CLI (`--categoria=X`, `--todas`), guardado incremental cada 5 libros, y fallback para páginas sin `<h4>`.
- **Guardado incremental**: Si el scraper se corta en una categoría grande, el progreso se guarda en `libros-[slug].temp.json`. Al re-ejecutar, retoma desde donde quedó.
- **Datos iniciales**: 267 libros extraídos, 190 con PDF descargable (71.2%).
- **Enfoque incremental**: JSON primero → PostgreSQL después.
- **Bot sin discord.js**: Usa Express + HTTP Interactions + tweetnacl para verificar firmas. Más liviano y didáctico.
- **Paginación**: Los resultados usan `DEFERRED_UPDATE_MESSAGE` (type 6) + PATCH vía webhook de Discord.

---

*Proyecto de Programación - 4to año — Fundación Azara*
