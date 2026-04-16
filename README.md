# API Azara - Fundación Azara

API REST + Bot de Discord para catalogar y acceder a libros de la Fundación Azara.

## 📋 Descripción

La **Fundación Azara** es una organización enfocada en la investigación sobre ciencias biológicas, geológicas, paleontológicas y antropológicas de Buenos Aires.

Este proyecto permite:
1. **Extraer** libros y archivos PDF del sitio web de la Fundación Azara
2. **Catalogarlos** por categoría y otros datos disponibles
3. **Acceder** a través de un bot de Discord con comandos simples

## 🛠️ Stack Tecnológico

| Tecnología | Propósito |
|------------|-----------|
| **Express.js** | API REST (backend) |
| **Archivo JSON** | Storage inicial (luego PostgreSQL) |
| **PostgreSQL** | Base de datos (futuro) |
| **Cheerio + Axios** | Scraping de páginas web |
| **Discord.js** | Bot de Discord |
| **Railway** | Hosting de API y DB |
| **cron-job.org** | Actualizaciones automatizadas |

## 📚 Categorías de la Fundación Azara

Los libros están organizados en **subcategorías**. El sitemap del sitio NO las refleja, por eso se definen manualmente.

| Categoría | URL |
|-----------|-----|
| Institucionales | `/libros/` |
| Astronomía y Geología | `/libros/libros-de-astronomia-y-geologia/` |
| Paleontología | `/libros/libros-de-paleontologia/` |
| Evolución, genética, ecología y etología | `/libros/libros-de-evolucion-genetica-ecologia-y-etologia/` |
| Divulgación científica | `/libros/libros-de-divulgacion-cientifica/` |
| Exploraciones, historia de la ciencia y biografías | `/libros/libros-de-historia-de-la-ciencia/` |
| Ambiente | `/libros-de-ambiente/` |
| Antropología | `/libros/libros-de-antropologia/` |
| Flora y Fauna | `/libros/libros-de-flora-y-fauna/` |
| Áreas naturales | `/libros/libros-de-areas-naturales/` |
| Historia y patrimonio cultural | `/libros/libros-de-patrimonio-cultural/` |
| Infantiles | `/libros/libros-infantiles/` |
| Auspiciados | `/libros/libros-auspiciados/` |

> ⚠️ **Nota sobre Auspiciados:** Los libros de esta categoría poseen imágenes de portada pero **NO todos tienen PDF descargable**. El scraper debe verificar si `linkPdf` existe antes de guardar.

## 📦 Modelo de Datos

### Datos que extrae el Scraper (iniciales):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Identificador único generado |
| `titulo` | string | Nombre del libro |
| `linkPdf` | string | URL al archivo PDF |
| `imagenPortada` | string | URL de la imagen de portada |
| `categoria` | string | Categoría del libro |
| `fechaExtraccion` | string | Fecha ISO de cuando fue extraído |

### Datos opcionales (si están disponibles en la página):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `autor` | string | Autor del libro |
| `anio` | number | Año de publicación |
| `descripcion` | string | Descripción/resumen del libro |
| `paginas` | number | Cantidad de páginas |

> ⚠️ **Nota:** Los PDFs en fundacionazara.org.ar no necesariamente tienen metadata completa (autor, año, etc.). El scraper extrae lo que puede y los datos opcionales se van completando si están disponibles.

### Ejemplo de estructura JSON completa:

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

## 🏗️ Arquitectura del Proyecto

```
┌────────────────────────────────────────────────────────────────┐
│                         FUNDACIÓN AZARA                         │
│                    fundacionazara.org.ar                         │
└────────────────────────────┬───────────────────────────────────┘
                             │ (scraping)
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                          SCRAPER                                │
│                   scripts/scraper.js                            │
│                                                                │
│   Extrae: título, linkPDF, imagenPortada, categoría            │
│   Genera: data/libros.json (Fase 1)                            │
│           → PostgreSQL (Fase 2)                                 │
└────────────────────────────┬───────────────────────────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         ▼                                       ▼
┌───────────────────┐               ┌───────────────────┐
│   JSON (Fase 1)   │   ──────→    │  PostgreSQL (Fase 2) │
│  data/libros.json │               │     Railway        │
└───────────────────┘               └───────────────────┘
         │                                       │
         └───────────────────┬───────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                        EXPRESS.JS API                           │
│              localhost:3000/api/libros                          │
│                                                                │
│   GET  /api/libros              → lista todos                  │
│   GET  /api/libros/:id          → uno solo                     │
│   GET  /api/libros?categoria=X  → filtrar                      │
│   POST /api/libros              → crear/actualizar (scraper)   │
└────────────────────────────┬───────────────────────────────────┘
                             │ (HTTP requests)
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                       DISCORD BOT                               │
│                  Bot con comandos slash                         │
│                                                                │
│   /buscar paleontología   → busca y muestra resultados         │
│   /libro abc123          → muestra un libro específico         │
│   /categorias            → lista categorías disponibles        │
└────────────────────────────────────────────────────────────────┘
                             │
                             │ (cronjob cada día)
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                       CRON-JOB.ORG                             │
│              Llama /api/scrape automáticamente                  │
└────────────────────────────────────────────────────────────────┘
```

## 📁 Estructura del Proyecto (Mono-repo)

```
azara/
├── backend/                      ← API Express.js
│   ├── src/
│   │   ├── index.js             ← entry point (puerto 3000)
│   │   ├── routes/
│   │   │   └── libros.js       ← endpoints CRUD
│   │   └── data/
│   │       └── libros.json      ← datos (Fase 1)
│   ├── scripts/
│   │   └── scraper.js          ← scraping de fundacionazara.org.ar
│   └── package.json
│
├── discord-bot/                  ← Bot de Discord
│   ├── src/
│   │   ├── index.js             ← login del bot
│   │   └── commands/
│   │       ├── buscar.js        ← /buscar
│   │       ├── libro.js         ← /libro
│   │       └── categorias.js    ← /categorias
│   └── package.json
│
├── README.md
├── PLAN.md
└── .env.example
```

## 🔗 Endpoints de la API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/libros` | Lista todos los libros |
| GET | `/api/libros/:id` | Obtiene un libro por ID |
| POST | `/api/libros` | Crea/actualiza un libro (scraper) |
| DELETE | `/api/libros/:id` | Elimina un libro (scraper) |
| GET | `/api/scrape` | Ejecuta el scraper manualmente |
| GET | `/api/categorias` | Lista categorías disponibles |

### Parámetros de Query (GET /api/libros)

| Parámetro | Ejemplo | Descripción |
|-----------|---------|-------------|
| `busqueda` | `?busqueda=dinosaurio` | Busca en título y descripción |
| `categoria` | `?categoria=paleontologia` | Filtrar por categoría |
| `pagina` | `?pagina=2` | Número de página |
| `limite` | `?limite=20` | Resultados por página |

### Ejemplo de Respuesta

```json
{
  "success": true,
  "data": [
    {
      "id": "lib-abc123",
      "titulo": "Enciclopedia de los Dinosaurios Argentinos",
      "linkPdf": "https://fundacionazara.org.ar/...",
      "imagenPortada": "https://fundacionazara.org.ar/...",
      "categoria": "Paleontología",
      "autor": null,
      "anio": null,
      "descripcion": null,
      "fechaExtraccion": "2026-04-10T15:30:00.000Z"
    }
  ],
  "meta": {
    "total": 82,
    "pagina": 1,
    "limite": 20
  }
}
```

## 🤖 Comandos del Bot de Discord

| Comando | Ejemplo | Descripción |
|---------|---------|-------------|
| `/buscar` | `/buscar paleontología` | Busca libros por término |
| `/libro` | `/libro lib-abc123` | Muestra un libro específico |
| `/categorias` | `/categorias` | Lista categorías disponibles |
| `/actualizar` | `/actualizar` | Fuerza actualización de scraping |

## ✅ Roadmap de Desarrollo

### Fase 1: Setup
- [x] Documentar arquitectura
- [ ] Crear estructura mono-repo
- [ ] Inicializar backend Express.js

### Fase 2: Scraper + JSON
- [ ] Instalar dependencias (axios, cheerio, fs)
- [ ] Crear `scripts/scraper.js`
- [ ] Probar extracción de libros
- [ ] Generar `data/libros.json`

### Fase 3: API Express
- [ ] Endpoints GET /api/libros
- [ ] Endpoints GET /api/libros/:id
- [ ] Endpoints POST /api/libros
- [ ] Filtrado y paginación
- [ ] Probar con Postman

### Fase 4: Discord Bot
- [ ] Crear bot en Discord Developer Portal
- [ ] Setup discord-bot/
- [ ] Comando /buscar
- [ ] Comando /libro
- [ ] Comando /categorias

### Fase 5: PostgreSQL (migración)
- [ ] Crear cuenta Railway + PostgreSQL
- [ ] Definir schema SQL
- [ ] Migrar datos de JSON
- [ ] Actualizar API

### Fase 6: Automatización
- [ ] Endpoint /api/scrape
- [ ] Configurar cron-job.org
- [ ] Tests de actualización

### Fase 7: Deploy
- [ ] Deploy backend en Railway
- [ ] Deploy bot (Railway o Glitch)
- [ ] Configurar variables de entorno

## 🚀 Cómo Ejecutar

### Backend

```bash
cd backend

# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Ejecutar en desarrollo
npm run dev

# Ejecutar scraper manualmente
node scripts/scraper.js

# Ejecutar API
npm start
```

### Discord Bot

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
DATA_FILE=./src/data/libros.json
# Para Fase 5:
# DATABASE_URL=postgres://user:pass@host:5432/azara

# Discord Bot (.env)
DISCORD_TOKEN=tu_bot_token_aqui
API_URL=http://localhost:3000
```

## 📝 Notas de Desarrollo

- **Scraper inteligente**: Detecta cambios (nuevos/eliminados) automáticamente
- **Datos iniciales limitados**: No todos los campos estarán completos al inicio
- **Enfoque incremental**: JSON primero → PostgreSQL después
- **Discord como frontend**: Más accesible que una web para el usuario final

---

*Proyecto de Programación - 4to año*
