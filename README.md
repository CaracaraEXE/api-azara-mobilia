# API Azara - Fundación Azara

API REST para catalogar y acceder a libros y archivos PDF de la Fundación Azara.

## 📋 Descripción

La **Fundación Azara** es una organización enfocada en la investigación sobre ciencias biológicas, geológicas, paleontológicas y antropológicas de Buenos Aires.

Este proyecto tiene como objetivo:
1. **Extraer** libros y archivos PDF del sitio web de la Fundación Azara
2. **Catalogarlos** por categoría, año, autor, etc.
3. **Exponer** los datos a través de una API REST accesible y simple

## 🛠️ Stack Tecnológico

| Tecnología | Propósito |
|------------|-----------|
| **Next.js** | Framework (API Routes para endpoints) |
| **MongoDB Atlas** | Base de datos en la nube |
| **Mongoose** | ORM para definir schemas y modelos |
| **Cheerio + Axios** | Scraping de páginas web |

## 🏗️ Arquitectura del Proyecto

```
┌─────────────────────────────────────────────────────────────┐
│                     FUNDACIÓN AZARA                          │
│                  fundacionazara.org.ar                        │
└─────────────────────────┬───────────────────────────────────┘
                          │ (scraping)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      SCRAPER                                 │
│              scripts/scraper.js                              │
│     - Extrae: título, autor, categoría, año, link PDF       │
│     - Usa Cheerio para parsear HTML                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   MONGODB ATLAS                              │
│              Schema: Libro                                   │
│     - título, autor, categoria, año, linkPDF, etc.          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    API REST                                  │
│              /api/libros                                     │
│     GET /api/libros              → lista todos               │
│     GET /api/libros/[id]        → uno solo                  │
│     GET /api/libros?categoria=X → filtrar                    │
│     POST /api/libros            → crear (para scraper)       │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Estructura de Archivos

```
api-azara/
├── src/
│   └── app/
│       └── api/
│           └── libros/
│               ├── route.js         ← GET /api/libros
│               │                     POST /api/libros
│               └── [id]/
│                   └── route.js     ← GET/PUT/DELETE /api/libros/[id]
├── lib/
│   ├── db.js                      ← conexión MongoDB Atlas
│   └── models/
│       └── Libro.js              ← schema Mongoose
├── scripts/
│   └── scraper.js                ← script de scraping
└── README.md                     ← este archivo
```

## ✅ Roadmap de Tareas

### Fase 1: Base de Datos
- [x] Scaffold del proyecto Next.js
- [ ] Configurar conexión a MongoDB Atlas
- [ ] Crear schema `Libro` con Mongoose

### Fase 2: API REST (fundamentos)
- [ ] Crear endpoint GET /api/libros (listar todos)
- [ ] Crear endpoint GET /api/libros/[id] (uno solo)
- [ ] Crear endpoint GET /api/libros?categoria=X (filtrar)
- [ ] Probar endpoints con Thunder Client o Postman

### Fase 3: Scraper
- [ ] Instalar dependencias (axios, cheerio)
- [ ] Escribir script de scraping para fundacionazara.org.ar/libros
- [ ] Probar extracción de un libro
- [ ] Extraer todos los libros
- [ ] Guardar en MongoDB

### Fase 4: Scraper → API
- [ ] Conectar scraper con endpoint POST /api/libros
- [ ] Ejecutar scraper completo
- [ ] Verificar datos en MongoDB

### Fase 5: Refinamiento (futuro)
- [ ] Agregar paginación a la API
- [ ] Agregar más filtros (año, autor)
- [ ] Documentación de la API
- [ ] Tests unitarios

## 🔗 Endpoints de la API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/libros` | Lista todos los libros |
| GET | `/api/libros/[id]` | Obtiene un libro por ID |
| POST | `/api/libros` | Crea un nuevo libro |
| PUT | `/api/libros/[id]` | Actualiza un libro |
| DELETE | `/api/libros/[id]` | Elimina un libro |

### Parámetros de Query (GET /api/libros)
| Parámetro | Ejemplo | Descripción |
|-----------|---------|-------------|
| `categoria` | `?categoria=antropologia` | Filtrar por categoría |
| `anio` | `?anio=2023` | Filtrar por año |
| `autor` | `?autor=Félix de Azara` | Filtrar por autor |
| `pagina` | `?pagina=2` | Número de página |
| `limite` | `?limite=20` | Resultados por página |

## 📝 Notas de Desarrollo

- **Scraper primero**: Se prioriza la extracción de datos antes de completar la API
- **Conocimiento del equipo**: CRUD con Mongoose, schemas, Next.js, React
- **Aprendizaje pendiente**: APIs REST, scraping con Cheerio, API Routes en Next.js

## 🚀 Cómo Ejecutar

```bash
# Instalar dependencias
npm install

# Desarrollo
npm run dev

# Scraper (ejecutar manualmente)
node scripts/scraper.js
```

---

*Documento creado como parte del proyecto de Programación 4to año*
