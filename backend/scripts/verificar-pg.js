/**
 * scripts/verificar-pg.js — Fase 4b: comparación campo por campo JSON vs PG.
 *
 * Los 72 tests de integración verifican COMPORTAMIENTO (totales, filtros, 400),
 * pero no comparan los 450 objetos completos. Este script sí lo hace: detecta
 * alias mal mapeados, fechas corridas, opcionales que aparecen de más o de menos.
 *
 * Uso (desde backend/):
 *   npm.cmd run verificar:pg
 *
 * Requiere USE_PG=true en .env (o variable de entorno) y la carga ya hecha.
 */

require('dotenv').config();

const { listarItemsJSON } = require('../src/lib/datos');
const queries = require('../src/db/queries');
const pool = require('../src/db');

async function main() {
  const desdeJson = listarItemsJSON();
  const desdePg = await queries.listarItems();

  console.log(`JSON: ${desdeJson.length} ítems | PG: ${desdePg.length} ítems`);

  const porId = new Map(desdePg.map(i => [i.id, i]));
  const diffs = [];

  for (const esperado of desdeJson) {
    const real = porId.get(esperado.id);
    if (!real) {
      diffs.push(`${esperado.id}: falta en PG`);
      continue;
    }

    const campos = new Set([...Object.keys(esperado), ...Object.keys(real)]);
    for (const campo of campos) {
      const a = esperado[campo];
      const b = real[campo];

      // `categorias` y `titulares` son conjuntos/orden preservado; comparamos
      // ordenados para no confundir "mismo dato, distinto orden de inserción".
      const igual = Array.isArray(a) && Array.isArray(b)
        ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
        : a === b;

      if (!igual) {
        diffs.push(`${esperado.id}.${campo}: JSON=${JSON.stringify(a)} PG=${JSON.stringify(b)}`);
      }
    }
  }

  const idsJson = new Set(desdeJson.map(i => i.id));
  for (const item of desdePg) {
    if (!idsJson.has(item.id)) diffs.push(`${item.id}: sobra en PG`);
  }

  if (diffs.length === 0) {
    console.log('\n✅ Fidelidad total: 450/450 ítems idénticos campo por campo.');
  } else {
    console.log(`\n❌ ${diffs.length} diferencia(s):`);
    for (const d of diffs.slice(0, 20)) console.log(`  ${d}`);
    if (diffs.length > 20) console.log(`  ... y ${diffs.length - 20} más`);
    process.exitCode = 1;
  }

  await pool.end();
}

main().catch(async err => {
  console.error('❌ Error:', err.message);
  process.exitCode = 1;
  await pool.end();
});
