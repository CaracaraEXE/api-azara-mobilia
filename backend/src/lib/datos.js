/**
 * lib/datos.js — Capa de datos COMPARTIDA por las rutas (catalogo, categorias, secciones).
 *
 * Descubre las secciones solas (data/<seccion>/<archivo>.json) y expone:
 *   - listarArchivosData(): [{ ruta, seccion }]
 *   - listarItems():        todos los ítems con { seccion, categorias[], coleccion? }, dedup por id
 *   - listarCategorias():   [{ nombre, slug, seccion, cantidad, url }]
 *
 * MODELO (2026-10-17): una SECCIÓN se navega por CATEGORÍAS y cada categoría puede
 * tener COLECCIONES (series hiperespecíficas):
 *   - Libros:  13 categorías (una por archivo); colecciones = "Trazos nativos", ...
 *   - RE:      10 categorías (agrupadas por el campo `categoria` de cada ítem);
 *              "Miradas de la Argentina" es una COLECCIÓN de "Cuadernillos".
 *   - Hemeroteca: la sección YA es la publicación (sin subdivisión).
 * Así RE y Libros se tratan IGUAL (sección → categorías → colecciones).
 *
 * CATEGORÍA DE UN ÍTEM:
 *   - si el ítem trae `categoria` (hemeroteca y RE, con acentos) → ESA manda;
 *   - si no (libros) → la categoría es el archivo (una por archivo).
 * El campo `categoria` singular NO se expone en el ítem (redundancia eliminada
 * 2026-10-15): los consumidores leen `categorias`.
 */

const fs = require('fs');
const path = require('path');

// Carpeta de datos
const DATA_DIR = path.join(__dirname, '..', 'data');

// Conectores que NO aportan al slug de categoría (regla pedida 2026-10-17):
// "Posters de Ambiente" → "posters-ambiente". Los slugs de ARCHIVO de libros
// (libros-areas-naturales.json) son otra cosa: siguen mandando vía el nombre
// derivado del archivo, así que "Areas Naturales" == "Areas Naturales".
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'a']);

// Alias CORTOS a mano (2026-10-17) para las 2 categorías de nombre largo.
// Clave = slug completo sin conectores; valor = slug corto elegido.
const ALIAS_SLUG = {
  'folletos-museos-sitios-arqueologicos-areas-naturales-protegidas': 'folletos-museos',
  'posters-antropologia-historia-patrimonio': 'posters-antropologia'
};

/**
 * Normalizar texto para búsquedas laxas: quita ACENTOS (áéíóúü) y pasa a
 * minúsculas, pero CONSERVA la ñ (carácter propio del español, no un acento):
 * NFD → eliminar combining marks (menos U+0303, el de la ñ) → NFC → lowercase.
 */
function normalizarBusqueda(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, c => (c === '\u0303' ? '\u0303' : ''))
    .normalize('NFC')
    .toLowerCase();
}

/**
 * Forma canónica para comparar nombre/slug de categoría:
 * "Areas Naturales" y "areas-naturales" → "areas-naturales".
 */
function normalizarCategoria(s) {
  return normalizarBusqueda(s)
    .replace(/[^a-z0-9ñ]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Slug de una CATEGORÍA: forma canónica menos los conectores, con los alias
 * cortos aplicados. "Folletos de Museos, … Protegidas" → "folletos-museos".
 */
function slugificarCategoria(nombre) {
  const base = normalizarCategoria(nombre)
    .split('-')
    .filter(p => p && !CONECTORES.has(p))
    .join('-');
  return ALIAS_SLUG[base] || base;
}

/**
 * Listar los archivos de datos de TODAS las secciones (todas las subcarpetas de
 * data/). Descubrimiento AUTOMÁTICO (PLANV3 V3.6): toda subcarpeta de data/ es una
 * SECCIÓN; los archivos válidos EMPIEZAN con el nombre de la carpeta:
 *   libros/libros-*.json (13), recursos-educativos/recursos-educativos.json,
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
      if (re.test(f)) archivos.push({ ruta: path.join(dir, f), seccion: carpeta.name });
    }
  }
  return archivos;
}

/** Nombre de categoría derivado del ARCHIVO (fallback si el ítem no trae `categoria`). */
function nombreDeArchivo(ruta) {
  const base = path.basename(ruta).replace(/\.json$/, '');
  const slug = base.replace(/^libros-/, '');
  return slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/**
 * Todos los ítems (flatten) con `seccion` y `categorias`.
 * Dedup por id (un ítem publicado en 2 categorías comparte UN id y acumula
 * categorías, PLANV2 §10). El campo `categoria` del archivo se DESCARTA del ítem
 * expuesto; en su lugar, cada ítem expone `categorias` (array).
 */
function listarItems() {
  const porId = new Map();

  for (const { ruta, seccion } of listarArchivosData()) {
    let arr;
    try {
      arr = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    } catch (error) {
      console.error(`Error al leer ${ruta}:`, error.message);
      continue;
    }
    const nombreArchivo = nombreDeArchivo(ruta);

    for (const crudo of arr) {
      if (!crudo || !crudo.id) continue;
      const nombre = crudo.categoria || nombreArchivo;
      const existente = porId.get(crudo.id);
      if (existente) {
        if (!existente.categorias.includes(nombre)) existente.categorias.push(nombre);
      } else {
        const { categoria, ...resto } = crudo; // se descarta la `categoria` singular
        porId.set(crudo.id, { ...resto, seccion, categorias: [nombre] });
      }
    }
  }

  return [...porId.values()];
}

/**
 * Lista de categorías de TODAS las secciones, agrupando los ítems por su
 * categoría real (item.categoria) o, si no la traen, por archivo.
 * `cantidad` = filas crudas de esa categoría (un libro multi-categoría cuenta en
 * cada una, igual que /categorias históricamente).
 */
function listarCategorias() {
  const porClave = new Map(); // `${seccion}|${nombre}` → { nombre, seccion, cantidad }

  for (const { ruta, seccion } of listarArchivosData()) {
    let arr;
    try {
      arr = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    } catch (error) {
      console.error(`Error al leer ${ruta}:`, error.message);
      continue;
    }
    const porNombre = new Map();
    for (const it of arr) {
      if (!it || !it.id) continue;
      const nombre = it.categoria || nombreDeArchivo(ruta);
      porNombre.set(nombre, (porNombre.get(nombre) || 0) + 1);
    }

    for (const [nombre, cantidad] of porNombre) {
      const clave = `${seccion}|${nombre}`;
      const e = porClave.get(clave);
      if (e) { e.cantidad += cantidad; continue; }
      porClave.set(clave, { nombre, seccion, cantidad });
    }
  }

  return [...porClave.values()].map(({ nombre, seccion, cantidad }) => {
    const slug = slugificarCategoria(nombre);
    return { nombre, seccion, cantidad, slug, url: `/libros/libros-de-${slug}/` };
  });
}

/**
 * ¿El nombre de una categoría coincide con el valor pedido? Acepta el nombre
 * ("Areas Naturales") o su slug ("areas-naturales" / "posters-biodiversidad").
 * El valor ya viene canónico (normalizarCategoria).
 */
function coincideCategoria(nombreCat, valorCanonico) {
  return normalizarCategoria(nombreCat) === valorCanonico
    || slugificarCategoria(nombreCat) === valorCanonico;
}

module.exports = {
  DATA_DIR,
  listarArchivosData,
  listarItems,
  listarCategorias,
  nombreDeArchivo,
  normalizarBusqueda,
  normalizarCategoria,
  slugificarCategoria,
  coincideCategoria
};
