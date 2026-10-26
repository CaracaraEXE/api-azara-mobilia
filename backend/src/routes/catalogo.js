/**
 * Rutas de la API - Catálogo
 *
 * Lee dinámicamente TODAS las secciones de data/ (data/<seccion>/<archivo>.json):
 * libros, recursos educativos y hemeroteca (periódico + Revista Azara). El término
 * "catálogo" es neutro: la API sirve más que libros.
 *
 * La carga y derivación de categorías vive en ../lib/datos (compartida con
 * /api/categorias y /api/secciones).
 */

const express = require('express');
const router = express.Router();

const {
  listarArchivosData,
  listarItems,
  listarCategorias,
  normalizarBusqueda,
  normalizarCategoria,
  slugificarCategoria
} = require('../lib/datos');

/** ¿El nombre de categoría coincide con el valor pedido (por nombre o por slug)? */
function coincideCategoria(nombreCat, valorCanonico) {
  return normalizarCategoria(nombreCat) === valorCanonico
    || slugificarCategoria(nombreCat) === valorCanonico;
}

/** Secciones válidas = subcarpetas de data/ (cada una es una SECCIÓN). */
function listarSeccionesValidas() {
  return [...new Set(listarArchivosData().map(a => a.seccion))];
}

/** Categorías válidas (para el 400): nombres + slugs, sin repetir. */
function categoriasValidas() {
  const set = new Set();
  for (const c of listarCategorias()) { set.add(c.nombre); set.add(c.slug); }
  return [...set];
}

/**
 * Colecciones/series agrupadas (metadata, sin ítems). Se deriva del campo
 * `coleccion` de cada ítem: series de Libros (Trazos nativos, ...) y de RE
 * ("Miradas de la Argentina"). `categorias` = a qué categorías pertenece.
 */
function obtenerColecciones() {
  const porNombre = new Map();
  for (const item of listarItems()) {
    const nombre = item.coleccion;
    if (!nombre) continue;
    let c = porNombre.get(nombre);
    if (!c) {
      c = { nombre, cantidad: 0, conPdf: 0, categorias: new Set() };
      porNombre.set(nombre, c);
    }
    c.cantidad++;
    if (item.linkPdf) c.conPdf++;
    (item.categorias || []).forEach(n => c.categorias.add(n));
  }
  return [...porNombre.values()]
    .map(c => ({ nombre: c.nombre, cantidad: c.cantidad, conPdf: c.conPdf, categorias: [...c.categorias] }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Colecciones válidas (para el 400). */
function coleccionesValidas() {
  return obtenerColecciones().map(c => c.nombre);
}

// --- Validación de filtros enumerables (400 honesto) -------------------------
// Un filtro con un valor que NO existe antes devolvía 200 con data:[]: una
// mentira silenciosa (el catálogo SÍ tiene categorías, solo que no con ESE
// nombre). Ahora devolvemos 400 + valores válidos + sugerencia. SOLO para
// filtros enumerables (seccion/categoria/coleccion); `busqueda` es texto LIBRE
// → 0 coincidencias sigue siendo un 200 con data:[].

/** Sugerencia de "¿quisiste decir X?": primer valor con forma similar. */
function sugerir(valor, validos) {
  const objetivo = normalizarCategoria(valor);
  return validos.find(v => {
    const c = normalizarCategoria(v);
    return c.includes(objetivo) || objetivo.includes(c);
  }) || null;
}

/**
 * Construir el cuerpo de error 400 de un filtro enumerable inválido.
 * `sugerenciaCustom` permite un mensaje a medida (p.ej. "es una SECCIÓN").
 */
function errorFiltro400(parametro, valor, valoresValidos, sugerenciaCustom) {
  const sug = sugerir(valor, valoresValidos);
  return {
    error: `Valor inválido para "${parametro}": "${valor}"`,
    parametro,
    valor,
    valoresValidos,
    sugerencia: sugerenciaCustom
      || (sug ? `¿Quisiste decir "${sug}"?` : 'Consultá los valores válidos en /api/categorias o /api/secciones')
  };
}

// GET /api/catalogo - Lista todos los libros
router.get('/', (req, res) => {
  try {
    const { seccion, categoria, coleccion, busqueda, pagina = 1, limite = 20 } = req.query;

    // Validación 400 de filtros enumerables (ANTES de paginar). Un valor
    // inexistente no es "0 resultados": es un error del cliente.
    const seccionesValidas = listarSeccionesValidas();
    const seccionCanonica = seccion ? normalizarCategoria(seccion) : null;
    if (seccion && !seccionesValidas.includes(seccionCanonica)) {
      return res.status(400).json({ success: false, ...errorFiltro400('seccion', seccion, seccionesValidas) });
    }
    if (categoria) {
      const objetivo = normalizarCategoria(categoria);
      if (!listarCategorias().some(c => coincideCategoria(c.nombre, objetivo))) {
        // Pista útil: si lo que pasaron es en realidad una SECCIÓN, decirlo.
        const esSeccion = seccionesValidas.includes(objetivo);
        const hint = esSeccion
          ? `"${categoria}" es una SECCIÓN, no una categoría. Usá ?seccion=${objetivo}`
          : null;
        return res.status(400).json({ success: false, ...errorFiltro400('categoria', categoria, categoriasValidas(), hint) });
      }
    }
    if (coleccion) {
      const colsValidas = coleccionesValidas();
      const objetivo = normalizarCategoria(coleccion);
      const hayParcial = colsValidas.some(c => normalizarCategoria(c).includes(objetivo));
      if (!hayParcial) {
        return res.status(400).json({ success: false, ...errorFiltro400('coleccion', coleccion, colsValidas) });
      }
    }

    let libros = listarItems();

    // Filtrar por SECCIÓN: 'libros' | 'recursos-educativos' | 'periodico-...' | 'revista-azara'
    // (el campo `seccion` se deriva de la carpeta de data/). Match exacto por slug.
    if (seccion) {
      libros = libros.filter(l => l.seccion === seccionCanonica);
    }

    // Filtrar por categoría: acepta NOMBRE ("Areas Naturales", "Cuadernillos") o
    // SLUG ("areas-naturales", "posters-biodiversidad"), con o sin tildes. MATCH
    // EXACTO; para parcial usar `?busqueda=`. Usa TODAS las categorías del ítem.
    if (categoria) {
      const objetivo = normalizarCategoria(categoria);
      libros = libros.filter(l => (l.categorias || []).some(c => coincideCategoria(c, objetivo)));
    }

    // Filtrar por colección: acepta el nombre exacto o parcial, en forma canónica.
    // `?coleccion=trazos` → toda la serie Trazos nativos; `?coleccion=miradas`.
    if (coleccion) {
      const objetivo = normalizarCategoria(coleccion);
      libros = libros.filter(l => l.coleccion && normalizarCategoria(l.coleccion).includes(objetivo));
    }

    // Filtrar por búsqueda (título, autor, titulares de hemeroteca) — sin acentos ni mayúsculas
    if (busqueda) {
      const termino = normalizarBusqueda(busqueda);
      libros = libros.filter(l =>
        normalizarBusqueda(l.titulo).includes(termino) ||
        (l.autor && normalizarBusqueda(l.autor).includes(termino)) ||
        (Array.isArray(l.titulares) && l.titulares.some(t => normalizarBusqueda(t).includes(termino)))
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
    console.error('Error en GET /api/catalogo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/catalogo/:id - Obtener un libro por ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const libros = listarItems();

    const libro = libros.find(l => l.id === id);

    if (libro) {
      res.json({ success: true, data: libro });
    } else {
      res.status(404).json({ success: false, error: 'Libro no encontrado' });
    }
  } catch (error) {
    console.error('Error en GET /api/catalogo/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/catalogo/colecciones/lista - Lista las colecciones/series (metadata, sin libros)
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
    console.error('Error en GET /api/catalogo/colecciones/lista:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/catalogo/categorias/lista - Lista todas las categorías
router.get('/categorias/lista', (req, res) => {
  try {
    const categorias = listarCategorias();

    const lista = categorias.map(cat => ({
      nombre: cat.nombre,
      slug: cat.slug,
      seccion: cat.seccion,
      cantidad: cat.cantidad,
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
    console.error('Error en GET /api/catalogo/categorias/lista:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Resumen de un conjunto de ítems (global o de una sección): total y cuántos
 * tienen PDF/autor/año. Terminología NEUTRA "items" (2026-10-14): el catálogo
 * sirve 4 secciones, no solo libros.
 */
function resumirItems(items) {
  const itemsConPdf = items.filter(l => l.linkPdf).length;
  return {
    items: items.length,
    itemsConPdf,
    itemsSinPdf: items.length - itemsConPdf,
    itemsConAutor: items.filter(l => l.autor).length,
    itemsConAnio: items.filter(l => l.anio).length
  };
}

// GET /api/catalogo/stats/general - Estadísticas del catálogo completo Y por
// SECCIÓN (deduplicadas por id, PLANV2 §10). Sin claves "libros*": el catálogo
// sirve 4 secciones (libros | recursos-educativos | periodico-... | revista-azara).
router.get('/stats/general', (req, res) => {
  try {
    const categorias = listarCategorias();
    const todos = listarItems();

    // Categorías (una por archivo o grupo) por sección.
    const categoriasPorSeccion = new Map();
    for (const cat of categorias) {
      const sec = cat.seccion || 'libros';
      categoriasPorSeccion.set(sec, (categoriasPorSeccion.get(sec) || 0) + 1);
    }

    // Ítems únicos por sección (mismo dedup por id que la API).
    const itemsPorSeccion = new Map();
    for (const item of todos) {
      const sec = item.seccion;
      if (!itemsPorSeccion.has(sec)) itemsPorSeccion.set(sec, []);
      itemsPorSeccion.get(sec).push(item);
    }

    const total = resumirItems(todos);
    const secciones = [...itemsPorSeccion.entries()]
      .map(([seccion, items]) => ({
        seccion,
        categorias: categoriasPorSeccion.get(seccion) || 0,
        ...resumirItems(items)
      }))
      .sort((a, b) => a.seccion.localeCompare(b.seccion, 'es'));

    res.json({
      success: true,
      data: {
        totalItems: total.items,
        totalCategorias: categorias.length,
        itemsConPdf: total.itemsConPdf,
        itemsSinPdf: total.itemsSinPdf,
        itemsConAutor: total.itemsConAutor,
        itemsConAnio: total.itemsConAnio,
        secciones
      }
    });
  } catch (error) {
    console.error('Error en GET /api/catalogo/stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
