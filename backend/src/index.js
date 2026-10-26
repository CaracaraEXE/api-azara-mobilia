require('dotenv').config();
const express = require('express');
const cors = require('cors');
const catalogoRoutes = require('./routes/catalogo');
const categoriasRoutes = require('./routes/categorias');
const seccionesRoutes = require('./routes/secciones');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/catalogo', catalogoRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/secciones', seccionesRoutes);

/**
 * Mapa de la API (raíz) — DESCUBRIMIENTO: lista TODOS los endpoints y sus
 * filtros. Antes mostraba solo catalogo/categorias/stats y ni siquiera
 * declaraba que existen 4 SECCIONES, que es justo lo que confundía.
 */
app.get('/', (req, res) => {
  res.json({
    nombre: 'API Azara',
    descripcion: 'Catálogo de la Fundación Azara: libros, recursos educativos y hemeroteca.',
    secciones: ['libros', 'recursos-educativos', 'periodico-exploracion-y-ciencia', 'revista-azara'],
    endpoints: [
      {
        metodo: 'GET',
        ruta: '/api/catalogo',
        descripcion: 'Lista y filtra ítems de TODAS las secciones (paginado).',
        params: {
          seccion: "slug de sección (ej. 'libros', 'recursos-educativos'); inexistente → 400",
          categoria: "categoría temática de CUALQUIER sección (ej. 'ambiente', 'cuadernillos'); nombre o slug; inexistente → 400",
          coleccion: "colección/serie (ej. 'miradas', 'trazos'); parcial, inexistente → 400",
          busqueda: 'texto libre en título, autor y titulares (sin coincidencias → 200 vacío)',
          pagina: 'nº de página (def. 1)',
          limite: 'ítems por página (def. 20)'
        }
      },
      { metodo: 'GET', ruta: '/api/catalogo/:id', descripcion: 'Detalle de un ítem por id (404 si no existe).' },
      { metodo: 'GET', ruta: '/api/catalogo/stats/general', descripcion: 'Totales globales y desglose por sección.' },
      { metodo: 'GET', ruta: '/api/catalogo/categorias/lista', descripcion: 'Categorías de todas las secciones, con cantidad y url.' },
      { metodo: 'GET', ruta: '/api/catalogo/colecciones/lista', descripcion: 'Colecciones/series (con su metadata), de todas las secciones.' },
      { metodo: 'GET', ruta: '/api/secciones', descripcion: 'Las 4 secciones: naturaleza y subdivisiones (categorías con sus colecciones).' },
      { metodo: 'GET', ruta: '/api/categorias', descripcion: 'Unidades de navegación por sección.' }
    ]
  });
});

// Levantar el server solo si se corre directo (los tests importan `app`).
if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀 API escuchando en http://localhost:${PORT}`));
}

module.exports = app;
