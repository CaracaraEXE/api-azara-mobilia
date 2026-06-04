# Guía de Código - API Azara

> Explicación detallada del funcionamiento del código del backend.

---

## Índice

1. [Flujo General](#flujo-general)
2. [src/index.js - Punto de Entrada](#1-srcindexjs---punto-de-entrada)
3. [src/routes/libros.js - Endpoints](#2-srcrouteslibrosjs---endpoints)
4. [scripts/scraper.js - Recolector de Datos](#3-scriptsscraperjs---recolector-de-datos)
5. [Estructura de Datos](#estructura-de-datos)
6. [Cómo Probar la API](#cómo-probar-la-api)

---

## Flujo General

```
┌─────────────────────────────────────────────────────────────┐
│                         USUARIO / BOT                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    index.js (recepcionista)                  │
│              Recibe el pedido HTTP                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   routes/libros.js                          │
│              Procesa y devuelve los datos                    │
│              Lee/escribe en libros.json                      │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ (ejecuta por separado)
┌─────────────────────────┴───────────────────────────────────┐
│                    scripts/scraper.js                       │
│              Recolecta datos del sitio web                   │
│              Se ejecuta: npm run scrape                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. `src/index.js` - Punto de Entrada

### ¿Qué hace?

Es el archivo que se ejecuta cuando levantás el servidor. Actúa como **recepcionista**: recibe todas las peticiones HTTP y las deriva al lugar correcto.

### Código completo:

```javascript
require('dotenv').config();           // Carga variables del archivo .env
const express = require('express');   // Importa Express (el framework)
const cors = require('cors');         // Permite pedidos desde otros orígenes
const librosRoutes = require('./routes/libros');  // Importa las rutas

const app = express();                // Crea la aplicación Express
const PORT = process.env.PORT || 3000; // Puerto (usa .env o 3000 por defecto)

// ─────────── MIDDLEWARES ───────────
// Se ejecutan ANTES de cada request

app.use(cors());        // Permite que el bot de Discord llame a la API
                        // (sin esto, el navegador/bot bloquea la petición)
                        
app.use(express.json()); // Permite recibir y enviar JSON
                        // (sin esto, no podés enviar { "nombre": "valor" })

// ─────────── RUTAS ───────────

// Todas las rutas que empiecen con /api/libros van a libros.js
app.use('/api/libros', librosRoutes);

// Ruta de prueba - cuando entras a http://localhost:3000/
app.get('/', (req, res) => {
  res.json({ 
    mensaje: 'API Azara funcionando 🦎',
    version: '1.0.0',
    endpoints: {
      libros: '/api/libros',
      categorias: '/api/libros/categorias'
    }
  });
});

// ─────────── INICIAR SERVIDOR ───────────

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
```

### Analogía:

```
┌─────────────────────────────────────┐
│              EXPRESS                │
│                                     │
│   index.js = Recepcionista del     │
│              hotel                  │
│                                     │
│   • Recibe visitas (requests)     │
│   • Les pregunta qué necesitan     │
│   • Las deriva al sector correcto  │
│   • Devuelve la respuesta          │
└─────────────────────────────────────┘
```

### Conceptos importantes:

| Concepto | Qué es |
|----------|--------|
| `require()` | Importa un módulo (como `import` en ES6) |
| `app.use()` | Registra un middleware (se ejecuta en cada request) |
| `app.listen()` | Arranca el servidor en el puerto indicado |
| `.env` | Archivo de variables de entorno (claves secretas) |

---

## 2. `src/routes/libros.js` - Endpoints

### ¿Qué hace?

Define **qué pasa** cuando alguien llama a una ruta como `/api/libros`. Es como el **departamento de biblioteca** dentro del hotel.

### Estructura básica:

```javascript
const express = require('express');
const router = express.Router();  // Crea un "mini Express" para las rutas

// Rutas aquí...

module.exports = router;  // Exporta el router para usarlo en index.js
```

### Las 3 rutas principales:

---

### `GET /api/libros` — Lista todos los libros

```javascript
router.get('/', (req, res) => {
  // req = request (lo que el cliente envía)
  // res = response (lo que devolvemos)
})
```

**Query parameters (parámetros de consulta):**
```
/api/libros                              → todos
/api/libros?categoria=paleontologia       → filtrado por categoría
/api/libros?busqueda=dinosaurio           → búsqueda por texto
/api/libros?pagina=2&limite=10           → paginación
```

**Código detallado:**

```javascript
router.get('/', (req, res) => {
  try {
    // 1. Obtener parámetros de la query string
    const { categoria, busqueda, pagina = 1, limite = 20 } = req.query;
    
    // 2. Leer el archivo JSON
    const datos = leerDatos();  // Ver función más abajo
    
    // 3. Convertir categorías en array plano de libros
    let libros = [];
    datos.categorias.forEach(cat => {
      cat.libros.forEach(libro => {
        libros.push({ ...libro, categoria: cat.nombre });
      });
    });
    // Ejemplo: [{titulo: "Libro 1", categoria: "Paleontología"}, ...]
    
    // 4. Filtrar por categoría si existe
    if (categoria) {
      libros = libros.filter(l => 
        l.categoria.toLowerCase() === categoria.toLowerCase()
      );
    }
    
    // 5. Filtrar por búsqueda si existe
    if (busqueda) {
      const termino = busqueda.toLowerCase();
      libros = libros.filter(l => 
        l.titulo.toLowerCase().includes(termino)
      );
    }
    
    // 6. Paginación
    const total = libros.length;
    const inicio = (pagina - 1) * limite;
    const fin = inicio + parseInt(limite);
    libros = libros.slice(inicio, fin);
    
    // 7. Devolver respuesta
    res.json({
      success: true,
      data: libros,
      meta: {
        total,              // Total de libros encontrados
        pagina: parseInt(pagina),  // Página actual
        limite: parseInt(limite)    // Libros por página
      }
    });
    
  } catch (error) {
    // Si hay error, devolver 500 (error interno)
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Ejemplo de respuesta:**

```json
{
  "success": true,
  "data": [
    {
      "id": "lib-abc123",
      "titulo": "Enciclopedia de los Dinosaurios Argentinos",
      "categoria": "Paleontología",
      "linkPdf": "https://..."
    }
  ],
  "meta": {
    "total": 82,
    "pagina": 1,
    "limite": 20
  }
}
```

---

### `GET /api/libros/:id` — Un libro específico

```javascript
router.get('/:id', (req, res) => {
  const { id } = req.params;  // Obtiene el ID de la URL
})
```

**URL de ejemplo:** `/api/libros/lib-abc123`

**Código detallado:**

```javascript
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;  // "lib-abc123"
    const datos = leerDatos();
    
    // Buscar en TODAS las categorías
    for (const cat of datos.categorias) {
      const libro = cat.libros.find(l => l.id === id);
      if (libro) {
        // Encontrado: devolver con la categoría
        return res.json({
          success: true,
          data: { ...libro, categoria: cat.nombre }
        });
      }
    }
    
    // No encontrado
    res.status(404).json({ success: false, error: 'Libro no encontrado' });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

### `GET /api/libros/categorias/lista` — Lista categorías

```javascript
router.get('/categorias/lista', (req, res) => {
  // Devuelve: [{nombre: "Paleontología", cantidad: 5}, ...]
})
```

---

### Funciones auxiliares:

```javascript
// Leer datos del archivo JSON
function leerDatos() {
  const data = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(data);
}

// Guardar datos en el archivo JSON
function guardarDatos(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
```

| Función | Qué hace |
|---------|----------|
| `fs.readFileSync()` | Lee un archivo sincrónicamente |
| `JSON.parse()` | Convierte texto JSON a objeto JavaScript |
| `JSON.stringify()` | Convierte objeto JavaScript a texto JSON |
| `fs.writeFileSync()` | Escribe en un archivo sincrónicamente |

---

## 3. `scripts/scraper.js` - Recolector de Datos

### ¿Qué hace?

Se ejecuta **por separado** para extraer datos de la página web y guardarlos en `libros.json`. No corre junto con el servidor.

### Selector verificado

El selector que funciona es:
```css
div.qodef-e-media-image a
```

Esto extrae el enlace que contiene la imagen de portada de cada libro.

### ¿Cuándo ejecutarlo?

```bash
npm run scrape
# o
node scripts/scraper.js
```

### Estructura del código:

```javascript
// 1. Importar dependencias
const axios = require('axios');      // Para hacer requests HTTP
const cheerio = require('cheerio');  // Para parsear HTML
const fs = require('fs');            // Para escribir archivos

// 2. Definir las categorías a scrapear
const CATEGORIAS = [
  { nombre: 'Paleontología', slug: 'paleontologia', url: 'https://fundacionazara.org.ar/libros/libros-de-paleontologia/' },
  // ... las 13 categorías
];

// 3. Función para esperar entre requests
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 4. Función que convierte slug URL → título legible
function slugATitulo(slug) {
  return slug
    .replace(/^https?:\/\/fundacionazara\.org\.ar\/?/, '')  // Quitar URL
    .replace(/\/$/, '')                                       // Quitar slash final
    .replace(/-/g, ' ')                                      // Guiones a espacios
    .replace(/\s+/g, ' ')                                     // Espacios múltiples
    .replace(/\b\w/g, l => l.toUpperCase());                 // Primera letra mayúscula
}

// 5. Función que scrapea UNA categoría
async function scrapearCategoria(categoria) {
  // a. Hacer request a la URL
  const { data } = await axios.get(categoria.url, {
    headers: { 'User-Agent': 'Mozilla/5.0...' }
  });
  
  // b. Cargar HTML en Cheerio
  const $ = cheerio.load(data);
  
  // c. Buscar elementos con el selector verificado
  const libros = [];
  $('div.qodef-e-media-image a').each((i, el) => {
    const href = $(el).attr('href');           // URL del libro
    const imagenSrc = $(el).find('img').attr('src');  // Imagen de portada
    
    if (href) {
      libros.push({
        id: generarId(),
        titulo: slugATitulo(href),      // Extraer título de la URL
        linkPdf: href,                  // El href es la página del libro
        imagenPortada: imagenSrc,
        // Los demás campos se extraen si están disponibles
      });
    }
  });
  
  return { ...categoria, libros };
}

// 6. Función principal - recorre todas las categorías
async function run() {
  for (const categoria of CATEGORIAS) {
    await scrapearCategoria(categoria);
    await delay(1500);  // Esperar 1.5 segundos entre requests
  }
  
  // Guardar resultado en data/libros.json
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
}
```

### Conceptos importantes:

| Concepto | Qué es |
|----------|--------|
| `async/await` | Permite escribir código asíncrono como si fuera síncrono |
| `axios.get(url)` | Hace un request GET a la URL |
| `cheerio.load(html)` | Carga HTML para poder buscar elementos |
| `$('selector')` | Busca elementos CSS en el HTML (como en el navegador) |
| `.each()` | Itera sobre cada elemento encontrado |
| `.find('img')` | Busca un elemento hijo específico |
| `.attr('href')` | Obtiene el valor de un atributo |

### Diferencia: Navegador vs Cheerio

| Navegador (document) | Cheerio ($) |
|---------------------|-------------|
| `document.querySelectorAll('a')` | `$('a')` |
| `nodo.href` | `$(el).attr('href')` |
| `nodo.querySelector('img').src` | `$(el).find('img').attr('src')` |

### Ejemplo de Cheerio:

```javascript
// HTML:
<div class="qodef-e-media-image">
  <a href="https://fundacionazara.org.ar/enciclopedia-de-dinosaurios/">
    <img src="https://.../imagen.jpg">
  </a>
</div>

// Código Cheerio:
const html = '<div class="qodef-e-media-image"><a href="https://.../enciclopedia-de-dinosaurios/"><img src="https://.../imagen.jpg"></a></div>';
const $ = cheerio.load(html);

$('div.qodef-e-media-image a').attr('href')              // URL del libro
$('div.qodef-e-media-image a img').attr('src')            // URL de la imagen
```

---

## Estructura de Datos

### `data/libros.json`

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
          "linkPdf": "https://fundacionazara.org.ar/...",
          "imagenPortada": "https://fundacionazara.org.ar/...",
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

### Campos de un libro:

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `id` | string | ✅ | Identificador único |
| `titulo` | string | ✅ | Nombre del libro |
| `linkPdf` | string/null | ✅ | URL al PDF (null si no tiene) |
| `imagenPortada` | string/null | ✅ | URL de la imagen |
| `categoria` | string | ✅ | Categoría del libro |
| `autor` | string/null | ❌ | Autor (extraer si está disponible) |
| `anio` | number/null | ❌ | Año de publicación |
| `descripcion` | string/null | ❌ | Descripción |
| `paginas` | number/null | ❌ | Cantidad de páginas |
| `fechaExtraccion` | string | ✅ | Cuándo fue scrapeado |

---

## Cómo Probar la API

### 1. Instalar dependencias

```bash
cd backend
npm install
```

### 2. Crear archivo `.env`

```bash
cp .env.example .env
```

### 3. Arrancar servidor

```bash
npm run dev
```

### 4. Probar endpoints

En el navegador o con herramientas como Postman/Thunder Client:

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `http://localhost:3000/` | GET | Mensaje de prueba |
| `http://localhost:3000/api/libros` | GET | Lista todos los libros |
| `http://localhost:3000/api/libros/lib-abc123` | GET | Un libro específico |
| `http://localhost:3000/api/libros/categorias/lista` | GET | Lista categorías |

### 5. Probar con query parameters

```
GET http://localhost:3000/api/libros?categoria=paleontologia
GET http://localhost:3000/api/libros?busqueda=dinosaurio
GET http://localhost:3000/api/libros?pagina=2&limite=10
```

---

## Comandos Disponibles

```bash
# En la carpeta backend/

npm run dev      # Iniciar servidor con hot-reload
npm start        # Iniciar servidor normal
npm run scrape   # Ejecutar scraper
```

---

*Documento de consulta - API Azara*
