/**
 * test-integracion.js — Red de seguridad de la API Azara (backend).
 *
 * Zero-deps: `node test-integracion.js` (o `npm test` en backend/).
 * Monta el app REAL (src/index.js) en un puerto efímero y verifica el contrato
 * por HTTP. Red de seguridad del refactor de NAMING (`/api/libros` → `/api/catalogo`,
 * 2026-10-14): congela el COMPORTAMIENTO (totales, filtros, dedup, búsqueda por
 * titulares, stats, semántica ESTRICTA de ?categoria= y filtro ?seccion=).
 *
 * Los valores esperados se CALCULAN desde data/ (self-calibrating): si re-scrapeás
 * y cambian las cantidades, el test sigue siendo válido.
 */

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'src', 'data');
const app = require('./src/index');

const API_BASE = '/api/catalogo';

let ok = 0;
let fail = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log(`  \u2713 ${nombre}`); }
  else { fail++; console.log(`  \u2717 ${nombre}`); }
}
function igual(nombre, real, esperado) {
  check(`${nombre} (esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)})`, real === esperado);
}

// ── Cálculo de los valores esperados desde data/ (mismo descubrimiento que la API) ──
function descubrirArchivos() {
  const archivos = [];
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

const archivosData = descubrirArchivos();
const seccionesEsperadas = [...new Set(archivosData.map(a => a.seccion))].sort();
const idsUnicos = new Set();
const porSeccion = new Map();
const idsUnicosPorSeccion = new Map(); // dedup por id DENTRO de cada sección
const itemsPorArchivo = new Map();
for (const { seccion, ruta } of archivosData) {
  const items = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  itemsPorArchivo.set(ruta, items);
  porSeccion.set(seccion, (porSeccion.get(seccion) || 0) + items.length);
  if (!idsUnicosPorSeccion.has(seccion)) idsUnicosPorSeccion.set(seccion, new Set());
  for (const it of items) {
    if (!it || !it.id) continue;
    idsUnicos.add(it.id);
    idsUnicosPorSeccion.get(seccion).add(it.id);
  }
}
const TOTAL_ESPERADO = idsUnicos.size; // dedup por id (multi-categoría comparte id)
const ARCHIVOS_ESPERADOS = archivosData.length;

function primeraPalabraLarga(texto, min = 6) {
  const words = (texto || '').split(/[^A-Za-zÁÉÍÓÚáéíóúÑñ]+/).filter(w => w.length >= min);
  return words[0] || null;
}

// Categorías de Libros = nº de archivos de la sección 'libros'.
const CATEGORIAS_LIBROS_ESPERADAS = archivosData.filter(a => a.seccion === 'libros').length;

async function main() {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => (await fetch(base + p)).json();
  const status = async (p) => (await fetch(base + p)).status;
  const getRaw = async (p) => { const res = await fetch(base + p); return { status: res.status, body: await res.json() }; };

  try {
    console.log(`\nAPI bajo prueba: ${base}${API_BASE}  (${TOTAL_ESPERADO} ítems en ${ARCHIVOS_ESPERADOS} archivos)`);

    // ── 1. Integridad global ──────────────────────────────
    console.log('\n[1] Integridad global');
    {
      const r = await get(`${API_BASE}?limite=1000`);
      check('success', r.success === true);
      igual('meta.total === ids únicos de data/', r.meta.total, TOTAL_ESPERADO);
      igual('data.length === meta.total', r.data.length, TOTAL_ESPERADO);
      check('todo ítem tiene id y titulo', r.data.every(i => i.id && i.titulo));
      check('toda sección es conocida', r.data.every(i => seccionesEsperadas.includes(i.seccion)));
      check('toda sección esperada aparece', seccionesEsperadas.every(s => r.data.some(i => i.seccion === s)));
    }

    // ── 2. Paginación ─────────────────────────────────────
    console.log('\n[2] Paginación');
    {
      const p1 = await get(`${API_BASE}?limite=5&pagina=1`);
      const p2 = await get(`${API_BASE}?limite=5&pagina=2`);
      igual('pag 1: 5 ítems', p1.data.length, 5);
      igual('pag 2: 5 ítems', p2.data.length, 5);
      igual('meta.limite', p1.meta.limite, 5);
      igual('meta.totalPaginas', p1.meta.totalPaginas, Math.ceil(TOTAL_ESPERADO / 5));
      const ids1 = new Set(p1.data.map(i => i.id));
      check('páginas 1 y 2 no se solapan', p2.data.every(i => !ids1.has(i.id)));
    }

    // ── 3. Categorías ─────────────────────────────────────
    console.log('\n[3] /api/categorias');
    const cats = await get('/api/categorias');
    {
      check('success', cats.success === true);
      igual('total === nº de archivos', cats.meta.total, ARCHIVOS_ESPERADOS);
      check('cada categoría tiene nombre/slug/seccion/cantidad',
        cats.data.every(c => c.nombre && c.slug && c.seccion && typeof c.cantidad === 'number'));
      const secciones = [...new Set(cats.data.map(c => c.seccion))].sort();
      check('están las 4 secciones', JSON.stringify(secciones) === JSON.stringify(seccionesEsperadas));
    }

    // ── 3b. /api/secciones ────────────────────────────────
    console.log('\n[3b] /api/secciones');
    {
      const r = await get('/api/secciones');
      check('success', r.success === true);
      igual('una entrada por sección', r.data.length, seccionesEsperadas.length);
      check('cada sección trae slug/nombre/items/subdivision',
        r.data.every(s => s.slug && s.nombre && typeof s.items === 'number' && 'subdivision' in s));
      igual('orden: libros primero', r.data[0].slug, 'libros');
      igual('suma de items === TOTAL_ESPERADO', r.data.reduce((a, s) => a + s.items, 0), TOTAL_ESPERADO);

      // Libros se navega por CATEGORÍAS (una por archivo).
      const libros = r.data.find(s => s.slug === 'libros');
      check('libros → subdivision.tipo === "categorias"', libros.subdivision && libros.subdivision.tipo === 'categorias');
      igual('libros → subdivision.total === nº archivos de libros', libros.subdivision.total, CATEGORIAS_LIBROS_ESPERADAS);
      check('libros → cada unidad tiene nombre/slug/cantidad',
        libros.subdivision.items.every(u => u.nombre && u.slug && typeof u.cantidad === 'number'));

      // Recursos educativos se navega por COLECCIONES.
      const rec = r.data.find(s => s.slug === 'recursos');
      check('recursos → subdivision.tipo === "colecciones"', rec.subdivision && rec.subdivision.tipo === 'colecciones');
      check('recursos → subdivision.total >= 1', rec.subdivision.total >= 1);
      check('recursos → cada unidad tiene nombre/cantidad',
        rec.subdivision.items.every(u => u.nombre && typeof u.cantidad === 'number'));

      // Hemeroteca: la sección ES la publicación → sin subdivisión.
      const hem = r.data.filter(s => s.slug === 'periodico-exploracion-y-ciencia' || s.slug === 'revista-azara');
      igual('hemeroteca: 2 secciones', hem.length, 2);
      check('hemeroteca → subdivision === null', hem.every(s => s.subdivision === null));
    }

    // ── 4. Filtro por categoría ───────────────────────────
    console.log('\n[4] Filtro ?categoria=');
    {
      let todasNoVacias = true;
      for (const c of cats.data) {
        const r = await get(`${API_BASE}?categoria=${encodeURIComponent(c.nombre)}&limite=1000`);
        if (!r.success || r.data.length === 0) { todasNoVacias = false; console.log(`      (vacía: ${c.nombre})`); }
      }
      check('cada categoría devuelve >= 1 ítem', todasNoVacias);

      // Hemeroteca: nombres sin ambigüedad → conteo exacto
      for (const [nombre, seccion] of [['Revista Azara', 'revista-azara'], ['Periódico Exploración y Ciencia', 'periodico-exploracion-y-ciencia']]) {
        const r = await get(`${API_BASE}?categoria=${encodeURIComponent(nombre)}&limite=1000`);
        igual(`"${nombre}" → count de data`, r.data.length, porSeccion.get(seccion));
        check(`"${nombre}" → todos de su sección`, r.data.every(i => i.seccion === seccion));
      }

      // Validación 400 (2026-10-17): un valor de categoría INEXISTENTE ya NO
      // devuelve un 200 vacío (mentira silenciosa). Es un 400 con valores válidos.
      // (`?categoria=ciencia`/`paleonto` son términos PARCIALES → no son categoría exacta.)
      const rc = await getRaw(`${API_BASE}?categoria=ciencia&limite=1000`);
      igual('?categoria=ciencia (inexistente) → 400', rc.status, 400);
      check('...trae valoresValidos (array) y sugerencia', Array.isArray(rc.body.valoresValidos) && typeof rc.body.sugerencia === 'string');
      const rp = await getRaw(`${API_BASE}?categoria=paleonto&limite=1000`);
      igual('?categoria=paleonto (inexistente) → 400', rp.status, 400);
      // Un nombre de SECCIÓN pasado como categoría → 400 con pista explícita.
      const rl = await getRaw(`${API_BASE}?categoria=libros&limite=1000`);
      igual('?categoria=libros (es SECCIÓN) → 400', rl.status, 400);
      check('?categoria=libros → sugerencia menciona SECCIÓN', /secci[oó]n/i.test(rl.body.sugerencia || ''));
    }

    // ── 4b. Filtro por sección ────────────────────────────
    console.log('\n[4b] Filtro ?seccion=');
    {
      for (const sec of seccionesEsperadas) {
        const r = await get(`${API_BASE}?seccion=${encodeURIComponent(sec)}&limite=1000`);
        check(`seccion=${sec}: success, no vacía y todos de esa sección`,
          r.success === true && r.data.length > 0 && r.data.every(i => i.seccion === sec));
        igual(`seccion=${sec}: count === ids únicos de la sección`, r.data.length, idsUnicosPorSeccion.get(sec).size);
      }
      const rMal = await getRaw(`${API_BASE}?seccion=noexiste&limite=1000`);
      igual('seccion inexistente → 400', rMal.status, 400);
      check('seccion inexistente → valoresValidos incluye las secciones reales',
        Array.isArray(rMal.body.valoresValidos) && seccionesEsperadas.every(s => rMal.body.valoresValidos.includes(s)));
    }

    // ── 5. Filtro por colección (RE) ──────────────────────
    console.log('\n[5] Filtro ?coleccion=');
    {
      const r = await get(`${API_BASE}?coleccion=cuadernillos&limite=1000`);
      check('devuelve >= 1 ítem', r.data.length >= 1);
      check('todos tienen coleccion "Cuadernillos"',
        r.data.every(i => (i.coleccion || '').toLowerCase().includes('cuadernillo')));

      // Colección inexistente → 400 (filtro enumerable).
      const rMal = await getRaw(`${API_BASE}?coleccion=zzzz&limite=1000`);
      igual('coleccion inexistente → 400', rMal.status, 400);

      // `?busqueda=` es texto LIBRE → sin coincidencias sigue siendo 200 con data:[].
      const rVacia = await get(`${API_BASE}?busqueda=zzzzqqqqxx&limite=1000`);
      check('?busqueda= sin coincidencias → 200 con data:[]', rVacia.success === true && rVacia.data.length === 0);
    }

    // ── 6. Búsqueda por título + por titular (V3.6) ───────
    console.log('\n[6] Búsqueda');
    {
      const libro = itemsPorArchivo.get(archivosData.find(a => a.seccion === 'libros').ruta)[0];
      const palabra = primeraPalabraLarga(libro.titulo);
      const rt = await get(`${API_BASE}?busqueda=${encodeURIComponent(palabra)}&limite=1000`);
      check(`título "${palabra}" encuentra su ítem`, rt.data.some(i => i.id === libro.id));

      const edicion = itemsPorArchivo.get(archivosData.find(a => a.seccion === 'revista-azara').ruta)
        .find(i => Array.isArray(i.titulares) && i.titulares.length);
      const palabraTit = primeraPalabraLarga(edicion.titulares[0]);
      const rb = await get(`${API_BASE}?busqueda=${encodeURIComponent(palabraTit)}&limite=1000`);
      check(`titular "${palabraTit}" encuentra la edición`, rb.data.some(i => i.id === edicion.id));
    }

    // ── 7. Detalle /:id ───────────────────────────────────
    console.log('\n[7] Detalle /:id');
    {
      const idReal = [...idsUnicos][0];
      const r = await get(`${API_BASE}/${idReal}`);
      check('id real → success', r.success === true);
      igual('id real → devuelve ese id', r.data.id, idReal);
      check('ítem expone `categorias` (array no vacío)', Array.isArray(r.data.categorias) && r.data.categorias.length > 0);
      check('ítem NO expone `categoria` singular (redundancia eliminada)', !('categoria' in r.data));
      igual('id inexistente → 404', await status(`${API_BASE}/lib-noexiste`), 404);
    }

    // ── 8. Stats y sub-listas ─────────────────────────────
    console.log('\n[8] Stats y sub-listas');
    {
      const s = await get(`${API_BASE}/stats/general`);
      igual('stats.totalItems === ids únicos', s.data.totalItems, TOTAL_ESPERADO);
      igual('stats.totalCategorias === nº de archivos', s.data.totalCategorias, ARCHIVOS_ESPERADOS);
      check('stats: itemsConPdf + itemsSinPdf === totalItems',
        s.data.itemsConPdf + s.data.itemsSinPdf === s.data.totalItems);
      check('stats: sin claves "libros*" (terminología neutra)',
        !Object.keys(s.data).some(k => k.toLowerCase().includes('libros')));

      // Desglose por SECCIÓN (2026-10-14): el shape ya no acopla todo a "libros".
      check('stats.secciones es un array', Array.isArray(s.data.secciones));
      igual('stats.secciones.length === nº de secciones', s.data.secciones.length, seccionesEsperadas.length);
      igual('stats.secciones: suma de items === totalItems',
        s.data.secciones.reduce((a, x) => a + x.items, 0), s.data.totalItems);
      igual('stats.secciones: suma de categorias === totalCategorias',
        s.data.secciones.reduce((a, x) => a + x.categorias, 0), s.data.totalCategorias);
      {
        let seccionesOk = true;
        for (const sec of seccionesEsperadas) {
          const e = s.data.secciones.find(x => x.seccion === sec);
          if (!e) { seccionesOk = false; console.log(`      (falta sección ${sec})`); continue; }
          if (e.items !== idsUnicosPorSeccion.get(sec).size) {
            seccionesOk = false; console.log(`      (items ${sec}: ${e.items} ≠ ${idsUnicosPorSeccion.get(sec).size})`);
          }
          if (e.itemsConPdf + e.itemsSinPdf !== e.items) seccionesOk = false;
        }
        check('stats.secciones: cada sección con items y PDF consistentes', seccionesOk);
      }

      igual('categorias/lista total', (await get(`${API_BASE}/categorias/lista`)).meta.total, ARCHIVOS_ESPERADOS);
      check('colecciones/lista success', (await get(`${API_BASE}/colecciones/lista`)).success === true);

      const home = await get('/');
      check('GET / anuncia /api/catalogo', home.endpoints && home.endpoints.catalogo === '/api/catalogo');
    }
  } finally {
    server.close();
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${ok} OK, ${fail} FALLIDOS (de ${ok + fail})`);
  console.log('='.repeat(50));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error('\n❌ Error inesperado:', err); process.exit(1); });
