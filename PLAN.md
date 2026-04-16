# PLAN.md - API Azara

> **Última actualización:** 10/04/2026

## 📌 Resumen del Proyecto

**Objetivo:** API que extraiga (scraping) libros y PDFs de fundacionazara.org.ar y los exponga via un bot de Discord.

**Dominio:** Fundación Azara — ciencias biológicas, geológicas, paleontológicas y antropológicas de Buenos Aires.

**Frontend:** Bot de Discord con comandos (`/buscar`, `/libro`, `/categorias`)

## 🗂️ Estado Actual

- ✅ Scaffold del proyecto Next.js creado
- ✅ README.md y PLAN.md documentados
- ✅ Estructura mono-repo (backend + discord-bot)
- ✅ Setup Express.js básico
- 🔲 Probar API local
- 🔲 Completar/correcter scraper
- 🔲 Scraper básico (JSON)
- 🔲 Migración a PostgreSQL
- 🔲 Cronjobs de actualización
- 🔲 Bot de Discord

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

## 📦 Datos del Scraper (Importante)

**Limitación detectada:** Los PDFs en fundacionazara.org.ar NO necesariamente tienen metadata completa (autor, año, descripción).

### Estructura de categorías

Los libros están organizados en **subcategorías** dentro de `fundacionazara.org.ar/libros/`. El sitemap NO las refleja, las categorías identificadas son:

| Categoría | URL |
|-----------|-----|
| Institucionales | `/libros/` (página principal) |
| Astronomía y Geología | `/libros/libros-de-astronomia-y-geologia/` |
| Paleontología | `/libros/libros-de-paleontologia/` |
| Evolución, genética, ecología y etología | `/libros/libros-de-evolucion-genetica-ecologia-y-etologia/` |
| Divulgación científica | `/libros/libros-de-divulgacion-cientifica/` |
| Exploraciones, historia de la ciencia y biografías | `/libros/libros-de-historia-de-la-ciencia/`) |
| Ambiente | `/libros-de-ambiente/` |
| Antropología | `/libros/libros-de-antropologia/` |
| Flora y Fauna | `/libros/libros-de-flora-y-fauna/` |
| Áreas naturales | `/libros/libros-de-areas-naturales/` |
| Historia y patrimonio cultural | `/libros/libros-de-patrimonio-cultural/` |
| Infantiles | `/libros/libros-infantiles/` |
| Auspiciados | `/libros/libros-auspiciados/` ⚠️ |

> ⚠️ **Nota sobre Auspiciados:** Los libros de esta categoría poseen imágenes de portada pero **NO todos tienen PDF descargable**. El scraper debe manejar este caso (verificar si `linkPdf` existe antes de guardar).

### Datos iniciales (lo que extrae el scraper):
- `id` — identificador único
- `titulo` — nombre del libro
- `linkPdf` — URL al archivo PDF (puede ser `null` para Auspiciados)
- `imagenPortada` — URL de la imagen de portada
- `categoria` — categoría del libro
- `fechaExtraccion` — cuándo fue scrapeado

### Datos opcionales (extraer si están disponibles):
- `autor` — autor del libro
- `anio` — año de publicación
- `descripcion` — descripción/resumen
- `paginas` — número de páginas

**Plan:** Extraer lo que se pueda → luego mejorar el scraper o enriquecer datos manualmente.

### Estructura de datos (JSON)

```json
{
  "categorias": [
    {
      "nombre": "Paleontología",
      "slug": "paleontologia",
      "url": "/libros/libros-de-paleontologia/",
      "libros": [
        {
          "id": "lib-abc123",
          "titulo": "Enciclopedia de los Dinosaurios Argentinos",
          "linkPdf": "https://fundacionazara.org.ar/wp-content/uploads/...",
          "imagenPortada": "https://fundacionazara.org.ar/wp-content/uploads/...",
          "autor": null,
          "anio": null,
          "descripcion": null,
          "paginas": null,
          "fechaExtraccion": "2026-04-10T15:30:00.000Z"
        }
      ]
    }
  ],
  "ultimaActualizacion": "2026-04-10T15:30:00.000Z"
}
```

**Nota:** Se genera un solo archivo JSON con todas las categorías. La API filtra por categoría internamente.

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

### Fase 1: Base (JSON) ✅
- [x] Documentar arquitectura
- [ ] Crear estructura mono-repo
- [ ] Setup Express.js básico

### Fase 2: Scraper + JSON
- [ ] Instalar dependencias (axios, cheerio, fs)
- [ ] Crear `scripts/scraper.js` → genera `data/libros.json`
- [ ] Probar scraping de un libro
- [ ] Escalar a todos los libros

### Fase 3: API Express
- [ ] Crear endpoints CRUD
- [ ] GET /api/libros (listar + filtrar)
- [ ] GET /api/libros/:id (uno solo)
- [ ] POST /api/libros (crear)
- [ ] Probar con Postman/Thunder Client

### Fase 4: Discord Bot (básico)
- [ ] Crear discord-bot/
- [ ] Comandos: /buscar, /libro, /categorias
- [ ] Conectar con API

### Fase 5: PostgreSQL (migración)
- [ ] Crear cuenta Railway + PostgreSQL
- [ ] Definir schema con SQL
- [ ] Migrar datos de JSON
- [ ] Actualizar API para usar DB

### Fase 6: Cronjobs
- [ ] Crear endpoint /api/scrape
- [ ] Configurar cron-job.org
- [ ] Testear actualizaciones automáticas

### Fase 7: Deploy
- [ ] Deploy Express en Railway
- [ ] Deploy Discord Bot ( Railway o Glitch)
- [ ] Configurar variables de entorno

## 📁 Estructura Objetivo (Mono-repo)

```
azara/
├── backend/
│   ├── src/
│   │   ├── index.js             ← entry point Express
│   │   ├── routes/
│   │   │   └── libros.js        ← endpoints /api/libros
│   │   └── data/
│   │       └── libros.json       ← datos (Fase 1)
│   ├── scripts/
│   │   └── scraper.js           ← scraping → libros.json
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
