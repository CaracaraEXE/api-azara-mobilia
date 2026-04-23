# Sesión de Desarrollo - API Azara

> **Fecha:** 17/04/2026
> **Proyecto:** API REST para Fundación Azara + Bot de Discord

---

## 🎯 Objetivo del Proyecto

Crear una API que extraiga (scraping) libros y PDFs de fundacionazara.org.ar y los exponga via un bot de Discord.

---

## 📚 Categorías de la Fundación Azara

| Categoría | Slug | URL |
|-----------|------|-----|
| Institucionales | institucionales | /libros/ |
| Astronomía y Geología | astronomia-y-geologia | /libros/libros-de-astronomia-y-geologia/ |
| Paleontología | paleontologia | /libros/libros-de-paleontologia/ |
| Evolución, genética... | evolucion-genetica-ecologia-y-etologia | /libros/libros-de-evolucion-genetica-ecologia-y-etologia/ |
| Divulgación científica | divulgacion-cientifica | /libros/libros-de-divulgacion-cientifica/ |
| Exploraciones, historia... | historia-de-la-ciencia | /libros/libros-de-historia-de-la-ciencia/ |
| Ambiente | ambiente | /libros-de-ambiente/ |
| Antropología | antropologia | /libros/libros-de-antropologia/ |
| Flora y Fauna | flora-y-fauna | /libros/libros-de-flora-y-fauna/ |
| Áreas naturales | areas-naturales | /libros/libros-de-areas-naturales/ |
| Historia y patrimonio | patrimonio-cultural | /libros/libros-de-patrimonio-cultural/ |
| Infantiles | infantiles | /libros/libros-infantiles/ |
| Auspiciados | auspiciados | /libros/libros-auspiciados/ ⚠️ |

> ⚠️ **Auspiciados:** NO todos tienen PDF descargable

---

## ✅ Decisiones Tomadas

| Decisión | Valor |
|----------|-------|
| API Backend | Express.js |
| Frontend | Bot de Discord |
| DB Inicial | Archivos JSON (uno por categoría) |
| DB Final | PostgreSQL (futuro) |
| Hosting | Railway |
| Cronjob | cron-job.org |

---

## 📁 Estructura del Proyecto

```
azara/
├── backend/
│   ├── src/
│   │   ├── index.js                    ← Express entry point
│   │   ├── routes/
│   │   │   ├── libros.js              ← /api/libros
│   │   │   └── categorias.js          ← /api/categorias
│   │   └── data/
│   │       ├── libros-institucionales.json   ← 10 libros
│   │       └── libros-paleontologia.json     ← 18 libros
│   ├── scripts/
│   │   ├── extraerLibros.js            ← extrae de páginas individuales
│   │   ├── combinarLibros.js          ← combina en archivo de categoría
│   │   └── scraper.js                  ← scraper Cheerio (no funciona)
│   └── package.json
├── discord-bot/                        ← vacío por ahora
├── README.md
├── PLAN.md
└── GUIA.md                            ← documentación del código
```

---

## 🔗 Endpoints de la API

| Endpoint | Descripción |
|----------|-------------|
| `GET /` | Info general |
| `GET /api/libros` | Lista todos los libros |
| `GET /api/libros/:id` | Un libro por ID |
| `GET /api/categorias` | Lista categorías |
| `GET /api/libros/stats/general` | Estadísticas |

### Parámetros de query:
- `?categoria=paleontologia` — filtrar por categoría
- `?busqueda=dinosaurio` — buscar por título/autor
- `?pagina=2&limite=20` — paginación

---

## 📖 Estructura de un Libro (JSON)

```json
{
  "id": "lib-abc123",
  "titulo": "Enciclopedia de los Dinosaurios Argentinos",
  "linkPdf": "https://fundacionazara.org.ar/...",
  "imagenPortada": "https://fundacionazara.org.ar/...",
  "autor": "José F. Bonaparte",
  "anio": 2024,
  "fechaExtraccion": "2026-04-17T..."
}
```

---

## ⚠️ Problemas Encontrados

### CloudFlare bloquea scraping
- **Problema:** El sitio usa CloudFlare que bloquea requests automatizados (Axios/Cheerio)
- **Solución temporal:** Método manual con consola del navegador
- **Solución futura:** Puppeteer (navegador real)

### WP REST API bloqueado
- **URL probada:** `https://fundacionazara.org.ar/wp-json/wp/v2/posts`
- **Resultado:** 401 Unauthorized (bloqueado por iThemes Security)

### Estructura del sitio
- **Página lista:** Selector `article .qodef-e-media-image a`
- **Página individual:**
  - Título: `h4`
  - Autor/Año: `p` (formato "Nombre, Año")
  - PDF: `a[href$=".pdf"]`
  - Imagen: `img` (que no sea logo/banner)

---

## 📊 Progreso

### Datos extraídos:
- ✅ Institucionales: 10 libros (formato básico)
- ✅ Paleontología: 18 libros (formato completo)

### Categorías pendientes (11):
- [ ] Astronomía y Geología
- [ ] Evolución, genética, ecología y etología
- [ ] Divulgación científica
- [ ] Exploraciones, historia de la ciencia y biografías
- [ ] Ambiente
- [ ] Antropología
- [ ] Flora y Fauna
- [ ] Áreas naturales
- [ ] Historia y patrimonio cultural
- [ ] Infantiles
- [ ] Auspiciados

### Por hacer:
- [ ] Completar scraping de categorías restantes
- [ ] Implementar Puppeteer para automatización
- [ ] Discord Bot
- [ ] Deploy en Railway
- [ ] Migrar a PostgreSQL

---

## 🔧 Comandos Útiles

```bash
# Iniciar API
cd backend
npm run dev

# Ver categorías
http://localhost:3000/api/categorias

# Ver todos los libros
http://localhost:3000/api/libros

# Buscar
http://localhost:3000/api/libros?busqueda=dinosaurio
```

---

## 📝 Notas

- Eliminar `node_modules` del raíz (el de backend/ es el único que se usa)
- API optimizada para leer JSONs individuales dinámicamente
- El archivo `libros.json` centralizado fue eliminado
- Scraper Cheerio no funciona por CloudFlare — usar método navegador o Puppeteer
