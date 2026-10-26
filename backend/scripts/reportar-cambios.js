/**
 * reportar-cambios.js — Reporte de cambios del catálogo (SOLO-LECTURA sobre data/).
 *
 * Compara el estado ACTUAL de data/ contra un SNAPSHOT guardado de la corrida
 * anterior y reporta, POR OBRA (no por id):
 *   - MOVIDOS        : dejó categorías Y entró a otras (MOVIMIENTO real, ej. A → B)
 *   - SUMAS          : sigue en todas y ADEMÁS entró a otra (multi-categoría, A → A + B)
 *   - BAJAS          : perdió categorías sin ganar ninguna (A + B → A)
 *   - AGREGADOS      : obra nueva (no estaba en el snapshot)
 *   - QUITADOS       : obra que estaba y ya no está
 *   - ID REGENERADO  : misma obra y mismas categorías, pero cambió el id
 *
 * MOTIVACIÓN: el scraper PISA cada archivo de categoría. Un libro que se mueve
 * A→B desaparece de A y reaparece en B — pero con id NUEVO si A se scrapeó antes
 * que B (el índice de dedup se rearma del disco categoría por categoría). Ese
 * movimiento es SILENCIOSO; este reporte lo hace VISIBLE. No mueve nada: el
 * scraper ya mueve solo. Esto solo informa.
 *
 * OJO: "MOVIDO" es SÓLO cuando se pierde Y se gana categoría. Una obra que gana
 * una categoría extra PERO sigue en la original es una SUMA (multi-categoría),
 * NO un movimiento — distinción clave para no generar falsas alarmas con las
 * series que se publican en varias categorías.
 *
 * El emparejamiento es por OBRA usando la MISMA clave estable del scraper
 * (`clavesDeLibro`: portada > PDF > título), NO por id — porque los ids cambian.
 *
 * Uso:
 *   node scripts/reportar-cambios.js                 → compara vs. snapshot y lo actualiza
 *   node scripts/reportar-cambios.js --solo-movidos  → imprime SÓLO los movimientos reales
 *   node scripts/reportar-cambios.js --exit-movidos  → exit 2 si hay movimientos reales (para el cron)
 *   node scripts/reportar-cambios.js --no-guardar    → sólo reporta (no pisa el snapshot)
 *   node scripts/reportar-cambios.js --reset         → re-baselínea (guarda el estado actual)
 *   node scripts/reportar-cambios.js --json          → salida JSON (para automatizar)
 *   node scripts/reportar-cambios.js --seccion=libros → limita a UNA sección
 *
 * Cron (nube), por sección — avisa SOLO si un libro se movió de categoría:
 *   node scripts/scraper-playwright.js --seccion=libros && node scripts/reportar-cambios.js --solo-movidos --exit-movidos
 *
 * Snapshot: scripts/.cache/reporte-estado.json (fuera de src/data → invisible
 * para la API, el scraper y validar-data). Exit: 0 por defecto (reporte, no
 * validador); con --exit-movidos devuelve 2 cuando hubo movimientos reales.
 */
const fs = require('fs');
const path = require('path');
const { clavesDeLibro } = require('./scraper-playwright');

const DATA_DIR = path.join(__dirname, '../src/data');
const CACHE_DIR = path.join(__dirname, '.cache');
const SNAPSHOT = path.join(CACHE_DIR, 'reporte-estado.json');

// --- CLI ---
const args = process.argv.slice(2);
const NO_GUARDAR = args.includes('--no-guardar');
const RESET = args.includes('--reset');
const JSON_OUT = args.includes('--json');
const SOLO_MOVIDOS = args.includes('--solo-movidos');
const EXIT_MOVIDOS = args.includes('--exit-movidos');
const SECCION = (args.find(a => a.startsWith('--seccion=')) || '').split('=')[1] || null;

/**
 * Listar archivos de datos de todas las secciones (misma convención que
 * validar-data.js): toda subcarpeta de data/ es una sección; los archivos
 * válidos EMPIEZAN con el nombre de la carpeta.
 */
function listarArchivosData(filtroSeccion) {
  const out = [];
  if (!fs.existsSync(DATA_DIR)) return out;
  for (const carpeta of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!carpeta.isDirectory()) continue;
    if (filtroSeccion && carpeta.name !== filtroSeccion) continue;
    const dir = path.join(DATA_DIR, carpeta.name);
    const re = new RegExp(`^${carpeta.name}(-.+)?\\.json$`);
    for (const f of fs.readdirSync(dir)) {
      if (re.test(f)) out.push({ seccion: carpeta.name, archivo: f, ruta: path.join(dir, f) });
    }
  }
  return out.sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** Slug de categoría desde el nombre de archivo: libros-paleontologia.json → paleontologia. */
function slugDeArchivo(seccion, archivo) {
  const base = path.basename(archivo).replace(/\.json$/, '');
  return seccion === 'libros' ? base.replace(/^libros-/, '') : base;
}

/**
 * Etiqueta de categoría visible de un ítem dentro de su sección.
 * En libros: 1 archivo = 1 categoría de libro (el slug del archivo, al margen de
 * `coleccion`, que en libros es un subgrupo interno). En el resto: `coleccion` (RE)
 * o `categoria` (hemeroteca) si están, si no el slug del archivo.
 */
function categoriaDe(seccion, archivo, item) {
  if (seccion === 'libros') return slugDeArchivo(seccion, archivo);
  return item.coleccion || item.categoria || slugDeArchivo(seccion, archivo);
}

/** Clave primaria estable de una obra: la más fuerte disponible (img > pdf > título). */
function clavePrimaria(item) {
  const keys = clavesDeLibro(item);
  return keys[0] || `id:${item.id}`;
}

/**
 * Construir el estado actual: sección → clavePrimaria → { titulo, ids[], categorias[] }.
 * La misma obra en varias categorías se FUSIONA (misma clave → un registro con N
 * categorías), igual que la multi-categoría del scraper.
 */
function construirEstado(filtroSeccion) {
  const secciones = {};
  for (const { seccion, archivo, ruta } of listarArchivosData(filtroSeccion)) {
    let items;
    try { items = JSON.parse(fs.readFileSync(ruta, 'utf-8')); } catch { continue; }
    if (!Array.isArray(items)) continue;
    const bucket = (secciones[seccion] = secciones[seccion] || {});
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const k = clavePrimaria(item);
      const reg = (bucket[k] = bucket[k] || { titulo: item.titulo || '', ids: [], categorias: [] });
      if (item.id && !reg.ids.includes(item.id)) reg.ids.push(item.id);
      const cat = categoriaDe(seccion, archivo, item);
      if (!reg.categorias.includes(cat)) reg.categorias.push(cat);
    }
  }
  return secciones;
}

/**
 * Comparar el estado previo contra el actual de UNA sección.
 * Clasifica el cambio de categorías en MOVIMIENTO (pierde Y gana), SUMA (sólo
 * gana) o BAJA (sólo pierde) — así "movido" no se confunde con ganar una
 * categoría extra (multi-categoría).
 */
function diffSeccion(before = {}, after = {}) {
  const movidos = [], sumas = [], bajas = [], agregados = [], quitados = [], idsRegenerados = [];
  const keysBefore = new Set(Object.keys(before));
  const keysAfter = new Set(Object.keys(after));

  for (const k of keysAfter) {
    const a = after[k];
    if (!keysBefore.has(k)) { agregados.push({ clave: k, ...a }); continue; }
    const b = before[k];
    const afterSet = new Set(a.categorias);
    const beforeSet = new Set(b.categorias);
    const perdidas = b.categorias.filter(c => !afterSet.has(c));
    const ganadas = a.categorias.filter(c => !beforeSet.has(c));
    const idCambio = !b.ids.some(id => a.ids.includes(id));

    if (perdidas.length && ganadas.length) {
      movidos.push({ clave: k, titulo: a.titulo, de: b.categorias, a: a.categorias, perdidas, ganadas, idAntes: b.ids, idDespues: a.ids });
    } else if (ganadas.length) {
      sumas.push({ clave: k, titulo: a.titulo, categorias: a.categorias, ganadas, idAntes: b.ids, idDespues: a.ids });
    } else if (perdidas.length) {
      bajas.push({ clave: k, titulo: a.titulo, categorias: a.categorias, perdidas, idAntes: b.ids, idDespues: a.ids });
    } else if (idCambio) {
      idsRegenerados.push({ clave: k, titulo: a.titulo, categorias: a.categorias, idAntes: b.ids, idDespues: a.ids });
    }
  }
  for (const k of keysBefore) {
    if (!keysAfter.has(k)) quitados.push({ clave: k, ...before[k] });
  }
  return { movidos, sumas, bajas, agregados, quitados, idsRegenerados };
}

function cargarSnapshot() {
  try { return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf-8')); } catch { return null; }
}

function guardarSnapshot(estado) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify({ fecha: new Date().toISOString(), secciones: estado }, null, 2));
}

const cats = arr => (arr || []).join(' + ');
const fmtFecha = d => new Date(d).toLocaleString('es-AR');
const ids = arr => (arr || []).join(',');

function imprimir(reporte, fechaPrevia, totalMovidos, soloMovidos) {
  console.log('═'.repeat(64));
  console.log('📋 REPORTE DE CAMBIOS DEL CATÁLOGO' + (soloMovidos ? ' — SÓLO MOVIMIENTOS' : ''));
  console.log(`   Snapshot previo: ${fmtFecha(fechaPrevia)}`);
  console.log('═'.repeat(64));

  for (const sec of Object.keys(reporte).sort()) {
    const d = reporte[sec];
    console.log(`\n📦 ${sec}`);

    if (d.movidos?.length) {
      console.log(`\n   🔀 MOVIDOS de categoría (${d.movidos.length}) — movimiento real:`);
      for (const m of d.movidos) {
        const nota = ids(m.idAntes) !== ids(m.idDespues) ? `  (id: ${ids(m.idAntes)} → ${ids(m.idDespues)})` : '';
        console.log(`      • ${m.titulo}`);
        console.log(`        ${cats(m.de)}  →  ${cats(m.a)}${nota}`);
      }
    }
    if (d.sumas?.length) {
      console.log(`\n   ➕ SUMAS de categoría (${d.sumas.length}) — multi-categoría, sigue en la original:`);
      for (const s of d.sumas) console.log(`      • ${s.titulo}  [${cats(s.categorias)}]   (+ ${cats(s.ganadas)})`);
    }
    if (d.bajas?.length) {
      console.log(`\n   ➖ BAJAS de categoría (${d.bajas.length}) — perdió categorías:`);
      for (const b of d.bajas) console.log(`      • ${b.titulo}  [${cats(b.categorias)}]   (− ${cats(b.perdidas)})`);
    }
    if (d.agregados?.length) {
      console.log(`\n   🆕 AGREGADOS (${d.agregados.length}):`);
      for (const a of d.agregados) console.log(`      • ${a.titulo}  [${cats(a.categorias)}]  ${ids(a.ids)}`);
    }
    if (d.quitados?.length) {
      console.log(`\n   🗑️ QUITADOS (${d.quitados.length}):`);
      for (const q of d.quitados) console.log(`      • ${q.titulo}  [${cats(q.categorias)}]  ${ids(q.ids)}`);
    }
    if (d.idsRegenerados?.length) {
      console.log(`\n   🔁 ID REGENERADO — misma categoría (${d.idsRegenerados.length}):`);
      for (const r of d.idsRegenerados) console.log(`      • ${r.titulo}  [${cats(r.categorias)}]  ${ids(r.idAntes)} → ${ids(r.idDespues)}`);
    }
  }

  const t = { movidos: 0, sumas: 0, bajas: 0, agregados: 0, quitados: 0, ids: 0 };
  for (const sec of Object.keys(reporte)) {
    const d = reporte[sec];
    t.movidos += d.movidos?.length || 0;
    t.sumas += d.sumas?.length || 0;
    t.bajas += d.bajas?.length || 0;
    t.agregados += d.agregados?.length || 0;
    t.quitados += d.quitados?.length || 0;
    t.ids += d.idsRegenerados?.length || 0;
  }
  console.log('\n' + '─'.repeat(64));
  console.log(`📊 TOTAL: ${t.movidos} movidos | ${t.sumas} sumas | ${t.bajas} bajas | ${t.agregados} agregados | ${t.quitados} quitados | ${t.ids} ids regenerados`);
  if (totalMovidos) console.log(`⚠️  ${totalMovidos} movimiento(s) real(es) de categoría — revisar.`);
}

// --- Main ---
const actual = construirEstado(SECCION);
const previo = RESET ? null : cargarSnapshot();

if (!previo) {
  console.log('🆕 Sin snapshot previo — guardando estado BASE.');
  console.log('   (las próximas corridas comparan contra este estado)');
  if (!NO_GUARDAR) guardarSnapshot(actual);
  process.exit(0);
}

const reporte = {};
for (const sec of new Set([...Object.keys(previo.secciones || {}), ...Object.keys(actual)])) {
  const d = diffSeccion(previo.secciones?.[sec] || {}, actual[sec] || {});
  const hubo = d.movidos.length || d.sumas.length || d.bajas.length || d.agregados.length || d.quitados.length || d.idsRegenerados.length;
  if (hubo) reporte[sec] = d;
}

const totalMovidos = Object.values(reporte).reduce((n, d) => n + d.movidos.length, 0);
const sinCambios = Object.keys(reporte).length === 0;

// Filtro de salida (no afecta el snapshot ni el exit code)
let salida = reporte;
if (SOLO_MOVIDOS) {
  salida = {};
  for (const sec of Object.keys(reporte)) {
    if (reporte[sec].movidos.length) salida[sec] = { movidos: reporte[sec].movidos };
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    fechaPrevia: previo.fecha,
    fechaActual: new Date().toISOString(),
    totalMovidos,
    reporte: salida,
  }, null, 2));
} else if (sinCambios) {
  console.log('✅ Sin cambios respecto a la corrida anterior.');
} else if (SOLO_MOVIDOS && totalMovidos === 0) {
  console.log('✅ Sin movimientos reales (hubo otros cambios: sumas/bajas/agregados/quitados/ids).');
} else {
  imprimir(salida, previo.fecha, totalMovidos, SOLO_MOVIDOS);
}

if (!NO_GUARDAR) guardarSnapshot(actual);
process.exit(EXIT_MOVIDOS && totalMovidos > 0 ? 2 : 0);
