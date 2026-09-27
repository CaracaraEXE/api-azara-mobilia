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
 * Listar los archivos de datos de TODAS las secciones (src/data/libros/*.json,
 * src/data/recursos/*.json). La carpeta padre = seccion ('libros' | 'recursos'),
 * el nombre del archivo lleva el prefijo de la sección: libros-{slug}.json.
 * Se devuelve la ruta completa + la sección para derivar los campos en runtime.
 */
function listarArchivosData() {
  const archivos = [];
  for (const carpeta of ['libros', 'recursos']) {
    const dir = path.join(DATA_DIR, carpeta);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/^(libros|recursos)-.+\.json$/.test(f)) {
        archivos.push({ ruta: path.join(dir, f), seccion: carpeta });
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
      
      // Extraer slug del nombre del archivo: libros-paleontologia.json → paleontologia; recursos-educativos.json → recursos-educativos
      const nombreArchivo = path.basename(ruta);
      const slug = (nombreArchivo.startsWith('libros-') ? nombreArchivo.replace('libros-', '') : nombreArchivo).replace('.json', '');
      
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
        seccion,
        url: `/libros/libros-de-${slug}/`,
        libros: librosConCategoria
      });
    } catch (error) {
      console.error(`Error al leer ${ruta}:`, error.message);
    }
  }
  
  return categorias;
}

/**
 * Obtener todos los libros (flatten) con deduplicación por ID y categorías.
 *
 * PLANV2 §10: un libro publicado en 2 categorías comparte UN id (el scraper
 * reutiliza el id ya registrado). El dedup evita inflar la búsqueda global y
 * los stats, PERO el filtro por categoría debe usar `categorias` (todas donde
 * figura el libro) y no `categoria` (la principal). Sin esto, un libro
 * multi-categoría desaparece de la navegación de las categorías no-principales.
 */
function obtenerTodosLosLibros() {
  const porId = new Map();

  for (const { ruta, seccion } of listarArchivosData()) {
    try {
      const nombreArchivo = path.basename(ruta);
      const slug = (nombreArchivo.startsWith('libros-') ? nombreArchivo.replace('libros-', '') : nombreArchivo).replace('.json', '');
      const librosArr = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      const nombre = librosArr.length > 0 && librosArr[0].categoria
        ? librosArr[0].categoria
        : slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      for (const libro of librosArr) {
        if (!libro || !libro.id) continue;
        const existente = porId.get(libro.id);
        if (existente) {
          if (!existente.categorias.includes(nombre)) existente.categorias.push(nombre);
        } else {
          porId.set(libro.id, { ...libro, seccion, categoria: nombre, categorias: [nombre] });
        }
      }
    } catch (error) {
      console.error(`Error al leer ${ruta}:`, error.message);
    }
  }
  return [...porId.values()];
}

/**
 * Agrupar libros por `coleccion` (series/desgloses). Un consumidor cualquiera
 * (web, CLI, bot) puede navegar las series sin conocer el scraper.
 */
function obtenerColecciones() {
  const mapa = new Map();
  for (const libro of obtenerTodosLosLibros()) {
    if (!libro.coleccion) continue;
    let c = mapa.get(libro.coleccion);
    if (!c) {
      c = { nombre: libro.coleccion, cantidad: 0, conPdf: 0, categorias: new Set() };
      mapa.set(libro.coleccion, c);
    }
    c.cantidad++;
    if (libro.linkPdf) c.conPdf++;
    (libro.categorias && libro.categorias.length ? libro.categorias : [libro.categoria])
      .forEach(n => c.categorias.add(n));
  }
  return [...mapa.values()]
    .map(c => ({ nombre: c.nombre, cantidad: c.cantidad, conPdf: c.conPdf, categorias: [...c.categorias] }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Normalizar texto para búsquedas laxas: quita ACENTOS (áéíóúü) y pasa a
 * minúsculas, pero CONSERVA la ñ (carácter propio del español, no un acento):
 * NFD → eliminar combining marks (menos U+0303, el de la ñ) → NFC → lowercase.
 * Así "felix" encuentra "Félix" y "diaz" encuentra "Díaz"; "nandu" NO
 * encuentra "ñandú" (eso sería cambiar la fonética, no normalizar tildes).
 */
function normalizarBusqueda(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, c => (c === '\u0303' ? '\u0303' : ''))
    .normalize('NFC')
    .toLowerCase();
}

/**
 * Normalizar nombre/slug de categoría a una MISMA forma canónica para comparar.
 * "Areas Naturales" y "areas-naturales" → "areas-naturales"; "Evolución, Genética,
 * Ecología y Etología" → "evolucion-genetica-ecologia-y-etologia" (coincide con el slug
 * del archivo). Así el filtro acepta nombre O slug, con o sin tildes/comas.
 */
function normalizarCategoria(s) {
  return normalizarBusqueda(s)
    .replace(/[^a-z0-9ñ]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// GET /api/libros - Lista todos los libros
router.get('/', (req, res) => {
  try {
    const { categoria, coleccion, busqueda, pagina = 1, limite = 20 } = req.query;
    
    let libros = obtenerTodosLosLibros();
    
    // Filtrar por categoría: acepta NOMBRE ("Areas Naturales") o SLUG ("areas-naturales"),
    // con o sin tildes — la comparación se hace en forma canónica. Usa TODAS las categorías
    // del libro (un libro multi-categoría figura en cada una, sin repetir el registro).
    if (categoria) {
      const objetivo = normalizarCategoria(categoria);
      libros = libros.filter(l => {
        const cats = (l.categorias && l.categorias.length) ? l.categorias : [l.categoria];
        return cats.some(c => {
          const nc = normalizarCategoria(c);
          return nc === objetivo || nc.includes(objetivo);
        });
      });
    }

    // Filtrar por colección: acepta el nombre exacto o parcial, en forma canónica
    // (sin tildes/mayúsculas). `?coleccion=trazos` → toda la serie Trazos nativos.
    if (coleccion) {
      const objetivo = normalizarCategoria(coleccion);
      libros = libros.filter(l => l.coleccion && normalizarCategoria(l.coleccion).includes(objetivo));
    }
    
    // Filtrar por búsqueda (título, autor) — sin acentos ni mayúsculas
    if (busqueda) {
      const termino = normalizarBusqueda(busqueda);
      libros = libros.filter(l => 
        normalizarBusqueda(l.titulo).includes(termino) ||
        (l.autor && normalizarBusqueda(l.autor).includes(termino))
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

// GET /api/libros/colecciones/lista - Lista las colecciones/series (metadata, sin libros)
router.get('/colecciones/lista', (req, res) => {
  try {
    const colecciones = obtenerColecciones();

    res.json({
      success: true,
      data: colecciones,
      meta: {
        total: colecciones.length
      }
    });
  } catch (error) {
    console.error('Error en GET /api/libros/colecciones/lista:', error);
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

// GET /api/libros/stats - Estadísticas generales (deduplicadas por id, PLANV2 §10)
router.get('/stats/general', (req, res) => {
  try {
    const categorias = obtenerCategoriasYLibros();
    const todos = obtenerTodosLosLibros();
    
    const totalLibros = todos.length;
    const librosConPdf = todos.filter(l => l.linkPdf).length;
    const librosConAutor = todos.filter(l => l.autor).length;
    const librosConAnio = todos.filter(l => l.anio).length;
    
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
