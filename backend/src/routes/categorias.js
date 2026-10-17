/**
 * Rutas de la API - Categorías
 *
 * Devuelve TODAS las categorías de TODAS las secciones (Libros 13, Recursos
 * educativos 10, hemeroteca 2), con su sección, cantidad y slug. La carga vive
 * en ../lib/datos (compartida con /api/catalogo y /api/secciones).
 */

const express = require('express');
const router = express.Router();

const { listarCategorias } = require('../lib/datos');

// GET /api/categorias - Lista todas las categorías
router.get('/', (req, res) => {
  try {
    const categorias = listarCategorias();

    res.json({
      success: true,
      data: categorias,
      meta: {
        total: categorias.length
      }
    });
  } catch (error) {
    console.error('Error en GET /api/categorias:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
