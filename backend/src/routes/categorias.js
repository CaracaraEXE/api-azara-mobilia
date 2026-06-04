/**
 * Rutas de la API - Categorías
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

/**
 * Obtener todas las categorías y sus libros desde archivos individuales
 */
function obtenerCategoriasYLibros() {
  const archivos = fs.readdirSync(DATA_DIR);
  const categorias = [];
  
  archivos
    .filter(archivo => archivo.startsWith('libros-') && archivo.endsWith('.json') && archivo !== 'libros.json')
    .forEach(archivo => {
      try {
        const rutaCompleta = path.join(DATA_DIR, archivo);
        const libros = JSON.parse(fs.readFileSync(rutaCompleta, 'utf8'));
        
        const slug = archivo.replace('libros-', '').replace('.json', '');
        
        const nombre = libros.length > 0 && libros[0].categoria 
          ? libros[0].categoria 
          : slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        
        categorias.push({
          nombre,
          slug,
          url: `/libros/libros-de-${slug}/`,
          cantidad: libros.length
        });
      } catch (error) {
        console.error(`Error al leer ${archivo}:`, error.message);
      }
    });
  
  return categorias;
}

// GET /api/categorias - Lista todas las categorías
router.get('/', (req, res) => {
  try {
    const categorias = obtenerCategoriasYLibros();
    
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
