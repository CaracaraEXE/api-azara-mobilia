/**
 * db/queries.js — Traducción de filas SQL a la MISMA forma que hoy devuelve
 * lib/datos.js. Es el contrato que permite cambiar de storage SIN tocar rutas.
 *
 * Contrato:
 *   listarArchivosData() -> [{ ruta: null, seccion }]  (solo se usa .seccion)
 *   listarItems()        -> [{ id, titulo, linkPdf, imagenPortada, autor, anio,
 *                              fechaExtraccion, seccion, categorias[],
 *                              coleccion?, titulares[]?, linkPdfEn? }]
 *   listarCategorias()   -> [{ nombre, seccion, cantidad, slug, url }]
 *
 * Ojo con los opcionales: en JSON, `coleccion`, `titulares` y `linkPdfEn`
 * NO existen en la mayoría de los ítems. Acá solo los agregamos si hay datos,
 * para no cambiar la forma de la respuesta de la API.
 */

const pool = require('./index');

/** Equivalente PG de "descubrir subcarpetas de data/". No hay archivos: hay filas. */
async function listarArchivosData() {
  const { rows } = await pool.query(`
    SELECT slug AS seccion
    FROM secciones
    ORDER BY slug
  `);
  return rows.map(row => ({ ruta: null, seccion: row.seccion }));
}

/**
 * Todos los ítems con sus categorías y titulares ya armados como arrays.
 * Se hacen 3 queries simples en paralelo en vez de un json_agg gigante: es
 * más fácil de leer y sigue siendo solo 3 viajes, no uno por ítem.
 */
async function listarItems() {
  const [itemsRes, catsRes, titsRes] = await Promise.all([
    pool.query(`
      SELECT id,
             titulo,
             link_pdf          AS "linkPdf",
             imagen_portada    AS "imagenPortada",
             autor,
             anio,
             fecha_extraccion  AS "fechaExtraccion",
             seccion_slug      AS seccion,
             coleccion,
             link_pdf_en       AS "linkPdfEn"
      FROM items
      ORDER BY id
    `),
    pool.query(`
      SELECT ic.item_id AS "itemId", c.nombre
      FROM item_categorias ic
      JOIN categorias c ON c.id = ic.categoria_id
      ORDER BY ic.item_id, c.id
    `),
    pool.query(`
      SELECT item_id AS "itemId", texto
      FROM titulares
      ORDER BY item_id, orden
    `)
  ]);

  const porId = new Map();

  for (const row of itemsRes.rows) {
    const item = {
      id: row.id,
      titulo: row.titulo,
      linkPdf: row.linkPdf,
      imagenPortada: row.imagenPortada,
      autor: row.autor,
      anio: row.anio,
      // pg devuelve timestamptz como Date; lo dejamos como ISO string, que es
       // exactamente lo que el JSON tenía y lo que el cliente recibe por HTTP.
      fechaExtraccion: row.fechaExtraccion
        ? new Date(row.fechaExtraccion).toISOString()
        : row.fechaExtraccion,
      seccion: row.seccion,
      categorias: []
    };

    if (row.coleccion != null) item.coleccion = row.coleccion;
    if (row.linkPdfEn != null) item.linkPdfEn = row.linkPdfEn;

    porId.set(row.id, item);
  }

  for (const { itemId, nombre } of catsRes.rows) {
    const item = porId.get(itemId);
    if (item) item.categorias.push(nombre);
  }

  for (const { itemId, texto } of titsRes.rows) {
    const item = porId.get(itemId);
    if (!item) continue;
    if (!item.titulares) item.titulares = [];
    item.titulares.push(texto);
  }

  return [...porId.values()];
}

/** Categorías con su cantidad de vínculos (un ítem en 2 categorías cuenta en cada una). */
async function listarCategorias() {
  const { rows } = await pool.query(`
    SELECT c.nombre,
           c.seccion_slug AS seccion,
           c.slug,
           COUNT(ic.item_id)::int AS cantidad
    FROM categorias c
    LEFT JOIN item_categorias ic ON ic.categoria_id = c.id
    GROUP BY c.id, c.nombre, c.seccion_slug, c.slug
    ORDER BY c.seccion_slug, c.id
  `);

  // La URL hardcodeada a /libros/ es un legado del JSON original. Se mantiene
  // para no cambiar la forma de la respuesta; no es un error de este archivo.
  return rows.map(row => ({
    nombre: row.nombre,
    seccion: row.seccion,
    cantidad: row.cantidad,
    slug: row.slug,
    url: `/libros/libros-de-${row.slug}/`
  }));
}

module.exports = {
  listarArchivosData,
  listarItems,
  listarCategorias
};
