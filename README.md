# API Azara - Fundación Azara

API REST + Bot de Discord para catalogar y acceder a libros de la Fundación Azara.

## 📋 Descripción

La **Fundación Azara** es una organización enfocada en la investigación sobre ciencias biológicas, geológicas, paleontológicas y antropológicas de Buenos Aires.

Este proyecto permite:
1. **Extraer** libros y archivos PDF del sitio web de la Fundación Azara
2. **Catalogarlos** por categoría y otros datos disponibles
3. **Acceder** a través de una API REST o un bot de Discord con comandos simples

## 🛠️ Stack Tecnológico

| Tecnología | Propósito |
|------------|-----------|
| **Express.js** | API REST (backend) |
| **Archivo JSON** | Storage inicial (uno por categoría) |
| **Playwright** | Scraping con navegador real (evita CloudFlare) |
| **PostgreSQL** | Base de datos (futuro) |
| **Discord.js** | Bot de Discord |
| **Railway** | Hosting de API y DB |
| **cron-job.org** | Actualizaciones automatizadas |

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
          ┌──────────────────┴──────────────────┐
          ▼                                     ▼
┌─────────────────────┐             ┌─────────────────────┐
│   JSON (Fase 1)     │  ──────→   │  PostgreSQL (Fase 2) │
│  data/libros-*.json │             │      Railway         │
└─────────────────────┘             └─────────────────────┘
          │                                     │
          └─────────────────┬───────────────────┘
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
│                  Bot con comandos slash                         │
│                                                                │
│  /buscar paleontología   → busca y muestra resultados          │
│  /libro abc123          → muestra un libro específico          │
│  /categorias            → lista categorías disponibles         │
└────────────────────────────────────────────────────────────────┘
```

## 📁 Estructura del Proyecto (Mono-repo)

```
azara/
├── backend/                      ← API Express.js
│   ├── src/
│   │   ├── index.js             ← entry point (puerto 3000)
│   │   ├── routes/
│   │   │   ├── libros.js        ← endpoints /api/libros
│   │   │   └── categorias.js    ← endpoint /api/categorias
│   │   └── data/
│   │       ├── libros-institucionales.json
│   │       ├── libros-paleontologia.json
│   │       ├── libros-astronomia-y-geologia.json
│   │       ├── libros-evolucion-genetica-ecologia-y-etologia.json
│   │       ├── libros-divulgacion-cientifica.json
│   │       ├── libros-historia-de-la-ciencia.json
│   │       ├── libros-ambiente.json
│   │       ├── libros-antropologia.json
│   │       ├── libros-flora-y-fauna.json
│   │       ├── libros-areas-naturales.json
│   │       ├── libros-patrimonio-cultural.json
│   │       ├── libros-infantiles.json
│   │       └── libros-auspiciados.json
│   ├── scripts/
│   │   ├── scraper-playwright.js   ← scraper activo
│   │   ├── scraper-cheerio-old.js  ← scraper retirado (referencia)
│   │   ├── extraerLibros.js        ← extrae de páginas individuales
│   │   └── combinarLibros.js       ← combina datos
│   └── package.json
│
├── discord-bot/                  ← (pendiente)
│   └── ...
│
├── AGENTS.md                    ← contexto para IA
├── PLAN.md                      ← roadmap y decisiones
├── README.md
└── .env.example
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
| `busqueda` | `?busqueda=dinosaurio` | Busca en título |
| `categoria` | `?categoria=paleontologia` | Filtrar por categoría |
| `pagina` | `?pagina=2` | Número de página |
| `limite` | `?limite=20` | Resultados por página |

## 🤖 Comandos del Bot de Discord (pendiente)

| Comando | Ejemplo | Descripción |
|---------|---------|-------------|
| `/buscar` | `/buscar paleontología` | Busca libros por término |
| `/libro` | `/libro lib-abc123` | Muestra un libro específico |
| `/categorias` | `/categorias` | Lista categorías disponibles |

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

### Fase 4: Discord Bot 🔲
- [ ] Crear bot en Discord Developer Portal
- [ ] Setup discord-bot/
- [ ] Comando /buscar
- [ ] Comando /libro
- [ ] Comando /categorias

### Fase 5: PostgreSQL (futuro) 🔲
- [ ] Crear cuenta Railway + PostgreSQL
- [ ] Definir schema SQL
- [ ] Migrar datos de JSON
- [ ] Actualizar API

### Fase 6: Deploy 🔲
- [ ] Deploy backend en Railway
- [ ] Deploy Discord Bot
- [ ] Configurar cron-job.org

## 🚀 Cómo Ejecutar

### Backend

```bash
cd backend

# Instalar dependencias
npm install

# Instalar Chromium para Playwright (si no está)
npx playwright install chromium

# Ejecutar en desarrollo
npm run dev

# ─── SCRAPING ─────────────────────────────────────

# Scrapear categoría por defecto (configurada en scraper)
npm run scrape-pw

# Scrapear una categoría específica
npm run scrape-pw -- --categoria=flora-y-fauna

# Scrapear TODAS las categorías
npm run scrape-todas

# ─── API ───────────────────────────────────────────

# Iniciar servidor
npm start
# o
npm run dev
```

### Discord Bot (pendiente)

```bash
cd discord-bot

# Instalar dependencias
npm install

# Configurar bot token en .env
# (obtener de Discord Developer Portal)

# Ejecutar
npm start
```

### Variables de Entorno

```env
# Backend (.env)
PORT=3000
API_URL=http://localhost:3000
DATA_DIR=./src/data
# Para Fase 5:
# DATABASE_URL=postgres://user:pass@host:5432/azara

# Discord Bot (.env)
DISCORD_TOKEN=tu_bot_token_aqui
API_URL=http://localhost:3000
```

## 📝 Notas de Desarrollo

- **CloudFlare**: El sitio usa CloudFlare, lo que bloquea peticiones HTTP simples (Axios/Cheerio devuelven 403). Se usa **Playwright** con navegador real para evitarlo.
- **Scraper optimizado**: Soporta argumentos CLI (`--categoria=X`, `--todas`), guardado incremental cada 5 libros, y fallback para páginas sin `<h4>`.
- **Guardado incremental**: Si el scraper se corta en una categoría grande, el progreso se guarda en `libros-[slug].temp.json`. Al re-ejecutar, retoma desde donde quedó.
- **Datos iniciales**: 267 libros extraídos, 190 con PDF descargable (71.2%).
- **Enfoque incremental**: JSON primero → PostgreSQL después.
- **Discord como frontend**: Más accesible que una web para el usuario final.

---

*Proyecto de Programación - 4to año — Fundación Azara*
