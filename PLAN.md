# PLAN.md - API Azara

> **Última actualización:** 10/04/2026

## 📌 Resumen del Proyecto

**Objetivo:** API que extraiga (scraping) libros y PDFs de fundacionazara.org.ar y los exponga via un bot de Discord.

**Dominio:** Fundación Azara — ciencias biológicas, geológicas, paleontológicas y antropológicas de Buenos Aires.

**Frontend:** Bot de Discord con comandos (`/buscar`, `/libro`, `/categorias`)

## 🗂️ Estado Actual

- ✅ Estructura mono-repo (backend + discord-bot)
- ✅ Express.js con API Routes
- ✅ API optimizada (lee JSONs individuales)
- ✅ Scraper Cheerio (funciona con método navegador)
- ✅ Institucionales: 10 libros
- ✅ Paleontología: 18 libros (completo)
- 🔲 Resto de categorías (11 faltantes)
- 🔲 Probar API local
- 🔲 Migración a PostgreSQL
- 🔲 Bot de Discord
- 🔲 Deploy en Railway

## 📝 Decisiones Tomadas

| Decisión | Detalle |
|----------|---------|
| API Backend | Express.js (estándar industria) |
| Frontend | Bot de Discord (interfaz pública) |
| DB Inicial | Archivo JSON (`data/libros.json`) |
| DB Final | PostgreSQL (migración posterior) |
| Hosting | Railway (API + DB) |
| Cronjob | cron-job.org (gratis, llama endpoint) |
| Scraping | Cheerio + Axios |

## 📦 Estructura de Datos (JSON Individual por Categoría)

### Archivo por categoría

Cada categoría tiene su propio archivo JSON: `data/libros-[categoria].json`

```
data/
├── libros-institucionales.json   ← 10 libros
├── libros-paleontologia.json     ← 18 libros
├── libros-astronomia.json        ← (próximo)
└── ...
```

### Estructura de cada archivo JSON

```json
[
  {
    "id": "lib-abc123",
    "titulo": "Enciclopedia de los Dinosaurios Argentinos",
    "linkPdf": "https://fundacionazara.org.ar/wp-content/uploads/...",
    "imagenPortada": "https://fundacionazara.org.ar/wp-content/uploads/...",
    "autor": "José F. Bonaparte",
    "anio": 2024,
    "descripcion": null,
    "paginas": null,
    "fechaExtraccion": "2026-04-10T15:30:00.000Z"
  }
]
```

### Campos de un libro

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `id` | string | ✅ | Identificador único |
| `titulo` | string | ✅ | Nombre del libro |
| `linkPdf` | string/null | ✅ | URL al PDF (null si no tiene) |
| `imagenPortada` | string/null | ✅ | URL de la imagen |
| `autor` | string/null | ❌ | Autor |
| `anio` | number/null | ❌ | Año de publicación |
| `descripcion` | string/null | ❌ | Descripción |
| `paginas` | number/null | ❌ | Cantidad de páginas |
| `fechaExtraccion` | string | ✅ | Cuándo fue extraído |

> ⚠️ **Nota sobre Auspiciados:** NO todos tienen PDF descargable.

## 🔄 Plan de Escalabilidad (JSON → PostgreSQL)

```
FASE 1 (Ahora)          FASE 2 (Después)
─────────────────       ─────────────────
JSON como storage    →   PostgreSQL
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
- [x] Dependencias instaladas (axios, cheerio)

### Fase 2: API Express ✅
- [x] GET /api/libros (listar + filtrar)
- [x] GET /api/libros/:id (uno solo)
- [x] GET /api/libros/categorias/lista
- [x] GET /api/libros/stats/general
- [ ] Probar endpoints

### Fase 3: Scraping ✅ (parcial)
- [x] Método navegador funciona
- [x] Script extraerLibros.js creado
- [x] Script combinarLibros.js creado
- [x] Institucionales: 10 libros
- [x] Paleontología: 18 libros
- [ ] Resto de categorías (11 faltantes)

### Fase 4: Discord Bot
- [ ] Crear discord-bot/
- [ ] Comandos: /buscar, /libro, /categorias
- [ ] Conectar con API

### Fase 5: PostgreSQL (futuro)
- [ ] Crear cuenta Railway + PostgreSQL
- [ ] Definir schema SQL
- [ ] Migrar datos de JSON
- [ ] Actualizar API para usar DB

### Fase 6: Deploy
- [ ] Deploy Express en Railway
- [ ] Deploy Discord Bot
- [ ] Configurar cron-job.org

## 📁 Estructura del Proyecto

```
azara/
├── backend/
│   ├── src/
│   │   ├── index.js             ← entry point Express
│   │   ├── routes/
│   │   │   └── libros.js        ← endpoints /api/libros
│   │   └── data/
│   │       ├── libros-institucionales.json
│   │       ├── libros-paleontologia.json
│   │       └── libros-[categoria].json  ← uno por categoría
│   ├── scripts/
│   │   ├── extraerLibros.js     ← extrae de páginas individuales
│   │   └── combinarLibros.js     ← combina en archivo de categoría
│   └── package.json
│
├── discord-bot/
│   ├── src/
│   │   ├── index.js             ← login del bot
│   │   └── commands/
│   │       ├── buscar.js         ← /buscar
│   │       ├── libro.js          ← /libro
│   │       └── categorias.js     ← /categorias
│   └── package.json
│
├── README.md
└── PLAN.md
```

## 🔗 Links Importantes

- Sitio web: https://fundacionazara.org.ar
- Catálogo libros: https://fundacionazara.org.ar/libros/
- Railway: https://railway.app
- Cron-job.org: https://cron-job.org
- Discord Developer Portal: https://discord.com/developers

## 💡 Notas Técnicas

- El scraper detecta libros nuevos/eliminados automáticamente
- Bot de Discord requiere "bot token" del Discord Developer Portal
- API de producción necesita URL pública (Railway proporciona)
- Variables de entorno: `DATABASE_URL`, `DISCORD_TOKEN`, `API_URL`

---

*Ver README.md para documentación extendida.*
