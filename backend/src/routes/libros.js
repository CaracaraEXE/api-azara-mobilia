const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Ruta al archivo JSON
const DATA_FILE = path.join(__dirname, '../data/libros.json');

// Función para leer los datos
function leerDatos() {
  const data = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(data);
}

// Función para guardar los datos
function guardarDatos(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET /api/libros - Lista todos los libros
router.get('/', (req, res) => {
  try {
    const { categoria, busqueda, pagina = 1, limite = 20 } = req.query;
    const datos = leerDatos();
    
    let libros = [];
    
    // Flatten:把所有分类的书籍合并成一个数组
    datos.categorias.forEach(cat => {
      cat.libros.forEach(libro => {
        libros.push({ ...libro, categoria: cat.nombre });
      });
    });
    
    // Filtrar por categoría
    if (categoria) {
      libros = libros.filter(l => 
        l.categoria.toLowerCase() === categoria.toLowerCase()
      );
    }
    
    // Filtrar por búsqueda (título)
    if (busqueda) {
      const termino = busqueda.toLowerCase();
      libros = libros.filter(l => 
        l.titulo.toLowerCase().includes(termino)
      );
    }
    
    // Paginación
    const total = libros.length;
    const inicio = (pagina - 1) * limite;
    const fin = inicio + parseInt(limite);
    libros = libros.slice(inicio, fin);
    
    res.json({
      success: true,
      data: libros,
      meta: {
        total,
        pagina: parseInt(pagina),
        limite: parseInt(limite)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/libros/:id - Obtener un libro por ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const datos = leerDatos();
    
    // Buscar en todas las categorías
    for (const cat of datos.categorias) {
      const libro = cat.libros.find(l => l.id === id);
      if (libro) {
        return res.json({
          success: true,
          data: { ...libro, categoria: cat.nombre }
        });
      }
    }
    
    res.status(404).json({ success: false, error: 'Libro no encontrado' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/libros/categorias - Lista todas las categorías
router.get('/categorias/lista', (req, res) => {
  try {
    const datos = leerDatos();
    const categorias = datos.categorias.map(cat => ({
      nombre: cat.nombre,
      slug: cat.slug,
      cantidad: cat.libros.length
    }));
    
    res.json({
      success: true,
      data: categorias
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
