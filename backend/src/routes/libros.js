/**
 * Rutas de la API - Libros
 * 
 * Lee dinámicamente todos los archivos libros-[categoria].json
 * desde la carpeta data/
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Carpeta de datos
const DATA_DIR = path.join(__dirname, '../data');

/**
 * Obtener todas las categorías y sus libros desde archivos individuales
 */
function obtenerCategoriasYLibros() {
  const archivos = fs.readdirSync(DATA_DIR);
  const categorias = [];
  
  // Filtrar solo archivos libros-*.json (excluir libros.json centralizado)
  archivos
    .filter(archivo => archivo.startsWith('libros-') && archivo.endsWith('.json') && archivo !== 'libros.json')
    .forEach(archivo => {
      try {
        const rutaCompleta = path.join(DATA_DIR, archivo);
        const libros = JSON.parse(fs.readFileSync(rutaCompleta, 'utf8'));
        
        // Extraer slug del nombre del archivo: libros-paleontologia.json → paleontologia
        const slug = archivo.replace('libros-', '').replace('.json', '');
        
        // Determinar nombre de la categoría desde el primer libro o el slug
        const nombre = libros.length > 0 && libros[0].categoria 
          ? libros[0].categoria 
          : slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        
        // Agregar categoría a cada libro
        const librosConCategoria = libros.map(libro => ({
          ...libro,
          categoria: nombre
        }));
        
        categorias.push({
          nombre,
          slug,
          url: `/libros/libros-de-${slug}/`,
          libros: librosConCategoria
        });
      } catch (error) {
        console.error(`Error al leer ${archivo}:`, error.message);
      }
    });
  
  return categorias;
}

/**
 * Obtener todos los libros (flatten)
 */
function obtenerTodosLosLibros() {
  const categorias = obtenerCategoriasYLibros();
  let todosLosLibros = [];
  
  categorias.forEach(cat => {
    todosLosLibros = todosLosLibros.concat(cat.libros);
  });
  
  return todosLosLibros;
}

// GET /api/libros - Lista todos los libros
router.get('/', (req, res) => {
  try {
    const { categoria, busqueda, pagina = 1, limite = 20 } = req.query;
    
    let libros = obtenerTodosLosLibros();
    
    // Filtrar por categoría
    if (categoria) {
      const catLower = categoria.toLowerCase();
      libros = libros.filter(l => 
        l.categoria.toLowerCase() === catLower ||
        l.categoria.toLowerCase().includes(catLower)
      );
    }
    
    // Filtrar por búsqueda (título, autor)
    if (busqueda) {
      const termino = busqueda.toLowerCase();
      libros = libros.filter(l => 
        l.titulo.toLowerCase().includes(termino) ||
        (l.autor && l.autor.toLowerCase().includes(termino))
      );
    }
    
    // Paginación
    const total = libros.length;
    const inicio = (pagina - 1) * limite;
    const fin = inicio + parseInt(limite);
    const librosPaginados = libros.slice(inicio, fin);
    
    res.json({
      success: true,
      data: librosPaginados,
      meta: {
        total,
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        totalPaginas: Math.ceil(total / limite)
      }
    });
  } catch (error) {
    console.error('Error en GET /api/libros:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/libros/:id - Obtener un libro por ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const libros = obtenerTodosLosLibros();
    
    const libro = libros.find(l => l.id === id);
    
    if (libro) {
      res.json({
        success: true,
        data: libro
      });
    } else {
      res.status(404).json({ success: false, error: 'Libro no encontrado' });
    }
  } catch (error) {
    console.error('Error en GET /api/libros/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/libros/categorias/lista - Lista todas las categorías
router.get('/categorias/lista', (req, res) => {
  try {
    const categorias = obtenerCategoriasYLibros();
    
    const lista = categorias.map(cat => ({
      nombre: cat.nombre,
      slug: cat.slug,
      cantidad: cat.libros.length,
      url: cat.url
    }));
    
    res.json({
      success: true,
      data: lista,
      meta: {
        total: lista.length
      }
    });
  } catch (error) {
    console.error('Error en GET /api/libros/categorias/lista:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/libros/stats - Estadísticas generales
router.get('/stats/general', (req, res) => {
  try {
    const categorias = obtenerCategoriasYLibros();
    
    const totalLibros = categorias.reduce((acc, cat) => acc + cat.libros.length, 0);
    const librosConPdf = categorias.reduce((acc, cat) => 
      acc + cat.libros.filter(l => l.pdfLink).length, 0
    );
    const librosConAutor = categorias.reduce((acc, cat) => 
      acc + cat.libros.filter(l => l.autor).length, 0
    );
    const librosConAnio = categorias.reduce((acc, cat) => 
      acc + cat.libros.filter(l => l.anio).length, 0
    );
    
    res.json({
      success: true,
      data: {
        totalLibros,
        totalCategorias: categorias.length,
        librosConPdf,
        librosSinPdf: totalLibros - librosConPdf,
        librosConAutor,
        librosConAnio
      }
    });
  } catch (error) {
    console.error('Error en GET /api/libros/stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
