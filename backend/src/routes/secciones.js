/**
 * routes/secciones.js — GET /api/secciones
 *
 * Expone las SECCIONES como concepto de primer nivel, con su navegación:
 *
 *   libros                          → categorías (13 temáticas)
 *   recursos-educativos             → categorías (10 grupos: Cuadernillos, Posters, ...)
 *   periodico-exploracion-y-ciencia → sin subdivisión (la sección ES la publicación)
 *   revista-azara                   → sin subdivisión
 *
 * MODELO (2026-10-17): toda sección con navegación fina se subdivide en
 * CATEGORÍAS (no en "colecciones"); cada categoría puede a su vez tener
 * COLECCIONES (series). Ej.: RE → "Cuadernillos" (categoría) que contiene la
 * colección "Miradas de la Argentina". Igual que Libros: "Áreas Naturales"
 * contiene "Trazos nativos". Se unifica el término.
 */

const express = require('express');
const router = express.Router();

const { listarItems, listarCategorias } = require('../lib/datos');

// Nombres y orden: ESPEJO de discord-bot/src/formatos.js (no hay módulo compartido
// entre los paquetes backend y bot). Si cambian allá, actualizar acá también.
const NOMBRES_SECCION = {
  libros: 'Libros',
  'recursos-educativos': 'Recursos educativos',
  'periodico-exploracion-y-ciencia': 'Periódico Exploración y Ciencia',
  'revista-azara': 'Revista Azara'
};
const ORDEN_SECCIONES = ['libros', 'recursos-educativos', 'periodico-exploracion-y-ciencia', 'revista-azara'];

/**
 * Subdivisión de una sección: sus categorías con las colecciones anidadas.
 * Con 0/1 categoría (hemeroteca) no hay subdivisión → null.
 */
function subdivisionDe(categorias, items) {
  if (categorias.length <= 1) return null;

  const unidades = categorias.map(cat => {
    const deCat = items.filter(it => it.categorias.includes(cat.nombre));
    const porColeccion = new Map();
    for (const it of deCat) {
      if (it.coleccion) porColeccion.set(it.coleccion, (porColeccion.get(it.coleccion) || 0) + 1);
    }
    return {
      nombre: cat.nombre,
      slug: cat.slug,
      cantidad: cat.cantidad,
      colecciones: [...porColeccion.entries()]
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    };
  });

  return { tipo: 'categorias', total: unidades.length, items: unidades };
}

// GET /api/secciones — Las 4 secciones con su subdivisión (categorías/colecciones).
router.get('/', (req, res) => {
  try {
    const items = listarItems();
    const categorias = listarCategorias();

    // Secciones presentes en data/ (una por subcarpeta).
    const slugs = [...new Set(
      [...categorias.map(c => c.seccion)]
    )];

    const data = slugs
      .map(slug => ({
        slug,
        nombre: NOMBRES_SECCION[slug] || slug,
        items: items.filter(it => it.seccion === slug).length,
        subdivision: subdivisionDe(categorias.filter(c => c.seccion === slug), items.filter(it => it.seccion === slug))
      }))
      .sort((a, b) => {
        const ia = ORDEN_SECCIONES.indexOf(a.slug);
        const ib = ORDEN_SECCIONES.indexOf(b.slug);
        return (ia === -1 ? ORDEN_SECCIONES.length : ia) - (ib === -1 ? ORDEN_SECCIONES.length : ib);
      });

    res.json({
      success: true,
      data,
      meta: { total: data.length }
    });
  } catch (error) {
    console.error('Error en GET /api/secciones:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
