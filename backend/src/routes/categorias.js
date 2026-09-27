/**
 * Rutas de la API - Categorías
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

/**
 * Listar los archivos de datos de TODAS las secciones (todas las subcarpetas de data/).
 * Descubrimiento AUTOMÁTICO (PLANV3 V3.6): toda subcarpeta de data/ es una SECCIÓN;
 * los archivos válidos son los que EMPIEZAN con el nombre de la carpeta:
 *   libros/libros-*.json (13), recursos/recursos-educativos.json,
 *   periodico-exploracion-y-ciencia/periodico-exploracion-y-ciencia.json, ...
 */
function listarArchivosData() {
  const archivos = [];
  if (!fs.existsSync(DATA_DIR)) return archivos;
  for (const carpeta of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!carpeta.isDirectory()) continue;
    const dir = path.join(DATA_DIR, carpeta.name);
    const re = new RegExp(`^${carpeta.name}(-.+)?\\.json$`);
    for (const f of fs.readdirSync(dir)) {
      if (re.test(f)) {
        archivos.push({ ruta: path.join(dir, f), seccion: carpeta.name });
      }
    }
  }
  return archivos;
}

/**
 * Obtener todas las categorías y sus libros desde archivos individuales
 */
function obtenerCategoriasYLibros() {
  const categorias = [];
  
  for (const { ruta, seccion } of listarArchivosData()) {
    try {
      const libros = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      
      const nombreArchivo = path.basename(ruta);
      const slug = (nombreArchivo.startsWith('libros-') ? nombreArchivo.replace('libros-', '') : nombreArchivo).replace('.json', '');
      
      const nombre = libros.length > 0 && libros[0].categoria 
        ? libros[0].categoria 
        : slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      
      categorias.push({
        nombre,
        slug,
        seccion,
        url: `/libros/libros-de-${slug}/`,
        cantidad: libros.length
      });
    } catch (error) {
      console.error(`Error al leer ${ruta}:`, error.message);
    }
  }
  
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
