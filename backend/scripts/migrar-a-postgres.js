/**
 * scripts/migrar-a-postgres.js — Fase 4: carga transaccional desde los JSON.
 *
 * El JSON sigue siendo la FUENTE DE VERDAD hasta el cutover. Este script lee
 * exactamente las mismas funciones `...JSON` que usa la API (para no duplicar
 * reglas de dedup/slug) y reemplaza el contenido de las 5 tablas de una sola
 * transacción: si algo falla, ROLLBACK y la base queda como estaba.
 *
 * Idempotente: se puede correr las veces que quiera. OJO: TRUNCATE borra lo que
 * haya en esas tablas. No correr contra una base con datos escritos a mano.
 *
 * Uso (desde backend/):
 *   npm.cmd run migrate:pg
 */

require('dotenv').config();

const pool = require('../src/db');
const {
  listarArchivosDataJSON,
  listarItemsJSON,
  listarCategoriasJSON
} = require('../src/lib/datos');

// Espejo de routes/secciones.js y discord-bot/src/formatos.js (no hay módulo
// compartido entre paquetes). Si agregás una sección, actualizá los tres.
const NOMBRES_SECCION = {
  libros: 'Libros',
  'recursos-educativos': 'Recursos educativos',
  'periodico-exploracion-y-ciencia': 'Periódico Exploración y Ciencia',
  'revista-azara': 'Revista Azara'
};

async function main() {
  const archivos = listarArchivosDataJSON();
  const secciones = [...new Set(archivos.map(a => a.seccion))].sort();
  const categorias = listarCategoriasJSON();
  const items = listarItemsJSON();

  console.log('Origen JSON:');
  console.log(`  secciones:  ${secciones.length}`);
  console.log(`  categorías: ${categorias.length}`);
  console.log(`  ítems:      ${items.length}`);

  const client = await pool.connect();
  let enTransaccion = false;

  try {
    await client.query('BEGIN');
    enTransaccion = true;

    // Orden: hijos primero no hace falta porque CASCADE, pero se lee mejor así.
    await client.query(`
      TRUNCATE TABLE titulares, item_categorias, items, categorias, secciones
      RESTART IDENTITY CASCADE
    `);

    // ── secciones ────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO secciones (slug, nombre)
       SELECT * FROM unnest($1::text[], $2::text[])`,
      [secciones, secciones.map(s => NOMBRES_SECCION[s] || s)]
    );

    // ── categorias ───────────────────────────────────────────────────────────
    // RETURNING nos da el identity generado. La clave compuesta con NUL ('\0')
    // evita colisiones entre "sección|nombre" raros.
    const catRes = await client.query(
      `INSERT INTO categorias (seccion_slug, nombre, slug)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
       RETURNING id, seccion_slug, nombre`,
      [
        categorias.map(c => c.seccion),
        categorias.map(c => c.nombre),
        categorias.map(c => c.slug)
      ]
    );
    const idCategoria = new Map(
      catRes.rows.map(c => [`${c.seccion_slug}\u0000${c.nombre}`, Number(c.id)])
    );

    // ── items ────────────────────────────────────────────────────────────────
    // unnest con arrays paralelos = UNA sola sentencia, no 450 INSERT. Los
    // opcionales van como null explícito para que el driver no mezcle undefined.
    await client.query(
      `INSERT INTO items (
         id, seccion_slug, titulo, link_pdf, imagen_portada,
         autor, anio, fecha_extraccion, coleccion, link_pdf_en
       )
       SELECT * FROM unnest(
         $1::text[],  $2::text[],  $3::text[],  $4::text[],  $5::text[],
         $6::text[],  $7::smallint[], $8::timestamptz[], $9::text[], $10::text[]
       )`,
      [
        items.map(i => i.id),
        items.map(i => i.seccion),
        items.map(i => i.titulo),
        items.map(i => i.linkPdf ?? null),
        items.map(i => i.imagenPortada ?? ''),
        items.map(i => i.autor ?? null),
        items.map(i => i.anio ?? null),
        items.map(i => i.fechaExtraccion),
        items.map(i => i.coleccion ?? null),
        items.map(i => i.linkPdfEn ?? null)
      ]
    );

    // ── item_categorias ──────────────────────────────────────────────────────
    // Acá se materializa el array `categorias[]` del JSON. La tabla de unión
    // reemplaza la dedup por id: un libro en 2 categorías genera 2 filas.
    const vinculoItems = [];
    const vinculoCats = [];
    for (const item of items) {
      for (const nombre of item.categorias || []) {
        const id = idCategoria.get(`${item.seccion}\u0000${nombre}`);
        if (id == null) {
          throw new Error(`Categoría no encontrada: ${item.seccion} / ${nombre}`);
        }
        vinculoItems.push(item.id);
        vinculoCats.push(id);
      }
    }
    await client.query(
      `INSERT INTO item_categorias (item_id, categoria_id)
       SELECT * FROM unnest($1::text[], $2::bigint[])`,
      [vinculoItems, vinculoCats]
    );

    // ── titulares ────────────────────────────────────────────────────────────
    const titItems = [];
    const titOrdenes = [];
    const titTextos = [];
    for (const item of items) {
      (item.titulares || []).forEach((texto, orden) => {
        titItems.push(item.id);
        titOrdenes.push(orden);
        titTextos.push(texto);
      });
    }
    await client.query(
      `INSERT INTO titulares (item_id, orden, texto)
       SELECT * FROM unnest($1::text[], $2::integer[], $3::text[])`,
      [titItems, titOrdenes, titTextos]
    );

    // ── verificación DENTRO de la transacción ────────────────────────────────
    const { rows } = await client.query(`
      SELECT
        (SELECT count(*) FROM secciones)        AS secciones,
        (SELECT count(*) FROM categorias)       AS categorias,
        (SELECT count(*) FROM items)            AS items,
        (SELECT count(*) FROM item_categorias)  AS vinculos,
        (SELECT count(*) FROM titulares)        AS titulares
    `);
    const real = rows[0];
    const esperado = {
      secciones: String(secciones.length),
      categorias: String(categorias.length),
      items: String(items.length),
      vinculos: String(vinculoItems.length),
      titulares: String(titTextos.length)
    };

    console.log('\nCarga en DB:');
    for (const clave of Object.keys(esperado)) {
      console.log(`  ${clave.padEnd(11)} ${real[clave]} / ${esperado[clave]}`);
      if (real[clave] !== esperado[clave]) {
        throw new Error(`Conteo inconsistente en ${clave}: ${real[clave]} ≠ ${esperado[clave]}`);
      }
    }

    await client.query('COMMIT');
    enTransaccion = false;
    console.log('\n✅ COMMIT. Datos cargados.');
    console.log('Siguiente paso: poner USE_PG=true en backend/.env y reiniciar la API.');
  } catch (error) {
    if (enTransaccion) {
      try { await client.query('ROLLBACK'); } catch (e) { console.error('ROLLBACK falló:', e.message); }
    }
    console.error('\n❌ Migración abortada:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
