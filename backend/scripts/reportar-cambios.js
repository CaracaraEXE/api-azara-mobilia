/**
 * reportar-cambios.js — Reporte de cambios del catálogo (SOLO-LECTURA sobre data/).
 *
 * Compara el estado ACTUAL de data/ contra un SNAPSHOT guardado de la corrida
 * anterior y reporta, POR OBRA (no por id):
 *   - MOVIDOS        : misma obra, cambió su conjunto de categorías
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
 * El emparejamiento es por OBRA usando la MISMA clave estable del scraper
 * (`clavesDeLibro`: portada > PDF > título), NO por id — porque los ids cambian.
 *
 * Uso:
 *   node scripts/reportar-cambios.js               → compara vs. snapshot y lo actualiza
 *   node scripts/reportar-cambios.js --no-guardar  → solo reporta (no pisa el snapshot)
 *   node scripts/reportar-cambios.js --reset       → re-baselínea (guarda el estado actual)
 *   node scripts/reportar-cambios.js --json        → salida JSON (para automatizar)
 *   node scripts/reportar-cambios.js --seccion=libros  → limita a UNA sección
 *
 * Snapshot: scripts/.cache/reporte-estado.json (fuera de src/data → invisible
 * para la API, el scraper y validar-data). Exit: 0 siempre (es un reporte, no
 * un validador: no debe cortar una cadena de cron).
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

/** Comparar el estado previo contra el actual de UNA sección. */
function diffSeccion(before = {}, after = {}) {
  const movidos = [], agregados = [], quitados = [], idsRegenerados = [];
  const keysBefore = new Set(Object.keys(before));
  const keysAfter = new Set(Object.keys(after));

  for (const k of keysAfter) {
    const a = after[k];
    if (!keysBefore.has(k)) { agregados.push({ clave: k, ...a }); continue; }
    const b = before[k];
    const catsBefore = [...b.categorias].sort();
    const catsAfter = [...a.categorias].sort();
    const catsIguales = catsBefore.length === catsAfter.length && catsBefore.every((c, i) => c === catsAfter[i]);
    const idCambio = !b.ids.some(id => a.ids.includes(id));
    if (!catsIguales) {
      movidos.push({ clave: k, titulo: a.titulo, de: b.categorias, a: a.categorias, idAntes: b.ids, idDespues: a.ids });
    } else if (idCambio) {
      idsRegenerados.push({ clave: k, titulo: a.titulo, categorias: a.categorias, idAntes: b.ids, idDespues: a.ids });
    }
  }
  for (const k of keysBefore) {
    if (!keysAfter.has(k)) quitados.push({ clave: k, ...before[k] });
  }
  return { movidos, agregados, quitados, idsRegenerados };
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

function imprimir(reporte, fechaPrevia) {
  console.log('═'.repeat(64));
  console.log('📋 REPORTE DE CAMBIOS DEL CATÁLOGO');
  console.log(`   Snapshot previo: ${fmtFecha(fechaPrevia)}`);
  console.log('═'.repeat(64));

  const secs = Object.keys(reporte).sort();
  if (!secs.length) {
    console.log('\n✅ Sin cambios respecto a la corrida anterior.');
    return;
  }

  for (const sec of secs) {
    const d = reporte[sec];
    console.log(`\n📦 ${sec}`);
    if (d.movidos.length) {
      console.log(`\n   🔀 MOVIDOS de categoría (${d.movidos.length}):`);
      for (const m of d.movidos) {
        const nota = m.idAntes.join(',') !== m.idDespues.join(',')
          ? `  (id: ${m.idAntes.join(',')} → ${m.idDespues.join(',')})` : '';
        console.log(`      • ${m.titulo}`);
        console.log(`        ${cats(m.de)}  →  ${cats(m.a)}${nota}`);
      }
    }
    if (d.agregados.length) {
      console.log(`\n   ➕ AGREGADOS (${d.agregados.length}):`);
      for (const a of d.agregados) console.log(`      • ${a.titulo}  [${cats(a.categorias)}]  ${a.ids.join(',')}`);
    }
    if (d.quitados.length) {
      console.log(`\n   ➖ QUITADOS (${d.quitados.length}):`);
      for (const q of d.quitados) console.log(`      • ${q.titulo}  [${cats(q.categorias)}]  ${q.ids.join(',')}`);
    }
    if (d.idsRegenerados.length) {
      console.log(`\n   🔁 ID REGENERADO — misma categoría (${d.idsRegenerados.length}):`);
      for (const r of d.idsRegenerados) {
        console.log(`      • ${r.titulo}  [${cats(r.categorias)}]  ${r.idAntes.join(',')} → ${r.idDespues.join(',')}`);
      }
    }
  }

  const t = { m: 0, a: 0, q: 0, i: 0 };
  for (const sec of secs) {
    t.m += reporte[sec].movidos.length;
    t.a += reporte[sec].agregados.length;
    t.q += reporte[sec].quitados.length;
    t.i += reporte[sec].idsRegenerados.length;
  }
  console.log('\n' + '─'.repeat(64));
  console.log(`📊 TOTAL: ${t.m} movidos | ${t.a} agregados | ${t.q} quitados | ${t.i} ids regenerados`);
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
  if (d.movidos.length || d.agregados.length || d.quitados.length || d.idsRegenerados.length) {
    reporte[sec] = d;
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ fechaPrevia: previo.fecha, fechaActual: new Date().toISOString(), reporte }, null, 2));
} else {
  imprimir(reporte, previo.fecha);
}

if (!NO_GUARDAR) guardarSnapshot(actual);
process.exit(0);
