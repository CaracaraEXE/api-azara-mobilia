/**
 * routes/secciones.js — GET /api/secciones
 *
 * Expone las SECCIONES como concepto de primer nivel. Responde a la confusión
 * "¿para qué 'sección' si con 'categoria' llego a todo?": la API nunca declaraba
 * que existen 4 secciones de NATURALEZA distinta ni cómo se navega cada una.
 *
 *   libros                          → subdivisión 'categorias'  (13 temáticas)
 *   recursos                        → subdivisión 'colecciones' (subgrupos del archivo único)
 *   periodico-exploracion-y-ciencia → sin subdivisión (la sección ES una publicación)
 *   revista-azara                   → sin subdivisión
 *
 * OJO: las categorías temáticas son PROPIAS de la sección 'libros'; en Recursos
 * educativos la navegación fina son las COLECCIONES y en hemeroteca la sección
 * ya es la publicación. Ese es el término que faltaba.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// Nombres y orden: ESPEJO de discord-bot/src/formatos.js (no hay módulo compartido
// entre los paquetes backend y bot). Si cambian allá, actualizar acá también.
const NOMBRES_SECCION = {
  libros: 'Libros',
  recursos: 'Recursos educativos',
  'periodico-exploracion-y-ciencia': 'Periódico Exploración y Ciencia',
  'revista-azara': 'Revista Azara'
};
const ORDEN_SECCIONES = ['libros', 'recursos', 'periodico-exploracion-y-ciencia', 'revista-azara'];

// Cómo se navega cada sección → deriva `subdivision.tipo`.
// Las que no figuran (hemeroteca) no tienen subdivisión → subdivision: null.
const SUBDIVISION = {
  libros: 'categorias',
  recursos: 'colecciones'
};

/** Listar los archivos de datos de TODAS las secciones (todas las subcarpetas de data/). */
function listarArchivosData() {
  const archivos = [];
  if (!fs.existsSync(DATA_DIR)) return archivos;
  for (const carpeta of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!carpeta.isDirectory()) continue;
    const dir = path.join(DATA_DIR, carpeta.name);
    const re = new RegExp(`^${carpeta.name}(-.+)?\\.json$`);
    for (const f of fs.readdirSync(dir)) {
      if (re.test(f)) archivos.push({ seccion: carpeta.name, ruta: path.join(dir, f) });
    }
  }
  return archivos;
}

/** Slug de categoría desde el nombre de archivo: libros-paleontologia.json → paleontologia. */
function slugDeArchivo(archivo) {
  const base = path.basename(archivo).replace(/\.json$/, '');
  return base.replace(/^libros-/, '');
}

/** Nombre visible de una categoría (columna categorias): campo `categoria` del archivo o slug capitalizado. */
function nombreDeArchivo(ruta, arr) {
  if (arr.length > 0 && arr[0].categoria) return arr[0].categoria;
  const slug = (path.basename(ruta).startsWith('libros-') ? path.basename(ruta).replace('libros-', '') : path.basename(ruta)).replace('.json', '');
  return slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/** Construir la ficha de UNA sección (items únicos + subdivisión navegable). */
function cargarSeccion(seccion, archivos) {
  const tipo = SUBDIVISION[seccion] || (archivos.length > 1 ? 'categorias' : null);

  // Ítems únicos por id (mismo dedup que la API y /stats).
  const porId = new Map();
  for (const { ruta } of archivos) {
    const arr = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    for (const it of arr) {
      if (!it || !it.id || porId.has(it.id)) continue;
      porId.set(it.id, it);
    }
  }
  const items = [...porId.values()];

  // Subdivisión navegable de la sección.
  let unidades = [];
  if (tipo === 'categorias') {
    // Una entrada por archivo (categoría temática de Libros).
    unidades = archivos.map(({ ruta }) => {
      const arr = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      const nombreArchivo = path.basename(ruta);
      const slug = (nombreArchivo.startsWith('libros-') ? nombreArchivo.replace('libros-', '') : nombreArchivo).replace('.json', '');
      const nombre = (arr.length && arr[0].categoria) ? arr[0].categoria
        : slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      return { nombre, slug, cantidad: arr.length };
    });
  } else if (tipo === 'colecciones') {
    const mapa = new Map();
    for (const it of items) {
      if (!it.coleccion) continue;
      mapa.set(it.coleccion, (mapa.get(it.coleccion) || 0) + 1);
    }
    unidades = [...mapa.entries()]
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  return {
    slug: seccion,
    nombre: NOMBRES_SECCION[seccion] || seccion,
    items: items.length,
    subdivision: tipo ? { tipo, total: unidades.length, items: unidades } : null
  };
}

// GET /api/secciones — Las 4 secciones con su naturaleza y sus subdivisiones.
router.get('/', (req, res) => {
  try {
    const porSeccion = new Map();
    for (const a of listarArchivosData()) {
      if (!porSeccion.has(a.seccion)) porSeccion.set(a.seccion, []);
      porSeccion.get(a.seccion).push(a);
    }

    const data = [...porSeccion.entries()]
      .map(([seccion, archivosDeSeccion]) => cargarSeccion(seccion, archivosDeSeccion))
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
