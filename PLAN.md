# PLAN.md - API Azara

> **Última actualización:** 10/04/2026

## 📌 Resumen del Proyecto

**Objetivo:** API que extraiga (scraping) libros y PDFs de fundacionazara.org.ar, los catálogos, y los exponga via un bot de Discord.

**Dominio:** Fundación Azara — ciencias biológicas, geológicas, paleontológicas y antropológicas de Buenos Aires.

**Frontend:** Bot de Discord con comandos (`/buscar`, `/libro`, `/categorias`)

## 🗂️ Estado Actual

- ✅ Scaffold del proyecto Next.js creado
- ✅ README.md y PLAN.md documentados
- 🔲 Estructura mono-repo (backend + discord-bot)
- 🔲 Setup Express.js
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
2. Aprendemos Express sin复杂度 de DB
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
│   │   ├── routes/
│   │   │   └── libros.js      ← endpoints /api/libros
│   │   ├── data/
│   │   │   └── libros.json   ← datos (Fase 1)
│   │   └── index.js          ← entry point Express
│   ├── scripts/
│   │   └── scraper.js        ← scraping → libros.json
│   └── package.json
│
├── discord-bot/
│   ├── src/
│   │   ├── commands/
│   │   │   ├── buscar.js     ← /buscar
│   │   │   ├── libro.js      ← /libro
│   │   │   └── categorias.js ← /categorias
│   │   └── index.js          ← bot login
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
