# PLAN.md - API Azara

> **Última actualización:** 09/04/2026

## 📌 Resumen del Proyecto

**Objetivo:** Crear una API REST que extraiga (scraping) libros y PDFs de fundacionazara.org.ar y los exponga de forma accesible.

**Dominio:** Fundación Azara — ciencias biológicas, geológicas, paleontológicas y antropológicas de Buenos Aires.

## 🗂️ Estado Actual

- ✅ Scaffold del proyecto Next.js creado
- ✅ README.md con roadmap documentado
- 🔲 Conexión MongoDB Atlas
- 🔲 Schema Libro (Mongoose)
- 🔲 Endpoints API REST
- 🔲 Script de scraping

## 📝 Decisiones Tomadas

| Decisión | Detalle |
|----------|---------|
| Stack DB | MongoDB Atlas (ya tienen cuenta) |
| Stack API | Next.js API Routes |
| Orden | Scraper primero → después API |
| Dependencias scraping | axios + cheerio |

## 📋 Tareas Pendientes (prioridad)

### Inmediato (Scraper)
1. [ ] `npm install axios cheerio`
2. [ ] Crear `scripts/scraper.js` básico
3. [ ] Probar extracción de un libro
4. [ ] Escalar a todos los libros
5. [ ] Guardar en MongoDB

### Después (API)
1. [ ] Configurar conexión MongoDB en `lib/db.js`
2. [ ] Crear schema `Libro` en `lib/models/Libro.js`
3. [ ] Crear endpoints CRUD en `src/app/api/libros/`

## 📁 Estructura Objetivo

```
api-azara/
├── src/app/api/libros/
│   ├── route.js          ← GET/POST
│   └── [id]/route.js     ← GET/PUT/DELETE
├── lib/
│   ├── db.js             ← conexión MongoDB
│   └── models/Libro.js   ← schema
├── scripts/
│   └── scraper.js        ← scraping
└── README.md            ← documentación
```

## 🔗 Links Importantes

- Sitio web: https://fundacionazara.org.ar
- Catálogo libros: https://fundacionazara.org.ar/libros/
- MongoDB Atlas: (tu cuenta)

## 💡 Notas

- El equipo conoce: MongoDB, Mongoose, CRUD, Next.js, React
- El equipo está aprendiendo: APIs REST, scraping, Next.js API Routes
- Preferencias: conceptos familiares primero, después aprender cosas nuevas

---

*Este archivo es un resumen rápido. Ver README.md para documentación completa.*
