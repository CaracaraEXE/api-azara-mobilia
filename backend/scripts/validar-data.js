/**
 * validar-data.js — Comando de validación SOLO-LECTURA (PLANV2 §6).
 * NO escribe nada: inspecciona los JSON de data/ y reporta:
 *   - IDs duplicados (dentro y entre categorías)
 *   - URLs duplicadas (misma linkPdf y/o imagenPortada) → posible duplicado
 *   - Formato inválido por objeto (campos requeridos, tipos, anio numérico)
 *   - coleccion consistente (impide coleccion vacía)
 *   - Portal de revisión humana: libros con titulo vacío o revisionPendiente: true
 *   - Resumen: libros por categoría, con PDF, revisionPendiente, sin título
 * Uso: node scripts/validar-data.js   (o npm run validar:data)
 * Exit: 0 si OK, 1 si hay problemas.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../src/data');

const archivos = fs.readdirSync(DATA_DIR)
  .filter(f => /^libros-.+\.json$/.test(f))
  .sort();

const problemas = [];
const idsGlobales = new Map();      // id → { categoria, libro }
const linkPdfs = new Map();         // linkPdf → [{ categoria, titulo, id }]
const portadas = new Map();         // imagenPortada → [{ categoria, titulo, id }]
const multiCategoria = new Set();   // ids que figuran en 2+ categorías (intencional, PLANV2 §10)

const resumenGeneral = { total: 0, conPdf: 0, conRevision: 0, sinTitulo: 0 };

/**
 * Multi-categoría (PLANV2 §10): un libro publicado en 2 categorías comparte UN id.
 * Para que sea intencional y no corrupción, la data debe ser idéntica.
 */
function mismaData(a, b) {
  return a.titulo === b.titulo &&
    (a.linkPdf || null) === (b.linkPdf || null) &&
    (a.imagenPortada || '') === (b.imagenPortada || '') &&
    (a.autor || null) === (b.autor || null) &&
    (a.anio || null) === (b.anio || null);
}

function leerArchivo(archivo) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, archivo), 'utf-8'));
  } catch (e) {
    problemas.push(`[${archivo}] JSON inválido o ilegible: ${e.message}`);
    return null;
  }
}

for (const archivo of archivos) {
  const categoria = archivo.replace(/^libros-/, '').replace(/\.json$/, '');
  const datos = leerArchivo(archivo);
  if (datos === null) continue;
  if (!Array.isArray(datos)) {
    problemas.push(`[${categoria}] El JSON no es un array`);
    continue;
  }

  const porCategoria = { total: 0, conPdf: 0, conRevision: 0, sinTitulo: 0 };
  const idsCategoria = new Set();

  datos.forEach((libro, i) => {
    const ref = `[${categoria}] #${i + 1}`;
    porCategoria.total++;

    // --- Formato del objeto ---
    if (!libro || typeof libro !== 'object' || Array.isArray(libro)) {
      problemas.push(`${ref} No es un objeto`);
      return;
    }

    if (typeof libro.id !== 'string' || !libro.id) {
      problemas.push(`${ref} id inválido o faltante`);
    } else {
      if (idsCategoria.has(libro.id)) {
        problemas.push(`${ref} id duplicado DENTRO de la categoría: ${libro.id}`);
      } else {
        idsCategoria.add(libro.id);
      }
      if (idsGlobales.has(libro.id)) {
        const previo = idsGlobales.get(libro.id);
        if (!mismaData(previo.libro, libro)) {
          problemas.push(`id duplicado ENTRE categorías con DATA DISTINTA: ${libro.id} (${previo.categoria} y ${categoria}) — revisar`);
        } else {
          multiCategoria.add(libro.id); // intencional: figura en ambas con el mismo id
        }
      } else {
        idsGlobales.set(libro.id, { categoria, libro });
      }
    }

    if (typeof libro.titulo !== 'string' || !libro.titulo.trim()) {
      problemas.push(`${ref} sin título (${libro.id || 'sin id'})`);
      porCategoria.sinTitulo++;
    }

    if (libro.linkPdf != null && typeof libro.linkPdf !== 'string') {
      problemas.push(`${ref} linkPdf no es string|null: ${JSON.stringify(libro.linkPdf)}`);
    }
    if (typeof libro.imagenPortada !== 'string' || !libro.imagenPortada) {
      problemas.push(`${ref} imagenPortada inválida o faltante (${libro.id || 'sin id'})`);
    }
    if (libro.autor != null && typeof libro.autor !== 'string') {
      problemas.push(`${ref} autor no es string|null: ${JSON.stringify(libro.autor)}`);
    }
    if (libro.anio != null && (typeof libro.anio !== 'number' || Number.isNaN(libro.anio))) {
      problemas.push(`${ref} anio no es number|null: ${JSON.stringify(libro.anio)}`);
    }
    if (typeof libro.fechaExtraccion !== 'string' || Number.isNaN(Date.parse(libro.fechaExtraccion))) {
      problemas.push(`${ref} fechaExtraccion inválida: ${JSON.stringify(libro.fechaExtraccion)}`);
    }

    // coleccion: si está presente, debe ser string no vacía
    if ('coleccion' in libro && (typeof libro.coleccion !== 'string' || !libro.coleccion.trim())) {
      problemas.push(`${ref} coleccion vacía o no string: ${JSON.stringify(libro.coleccion)}`);
    }
    // revisionPendiente: solo true (o ausente)
    if ('revisionPendiente' in libro && libro.revisionPendiente !== true) {
      problemas.push(`${ref} revisionPendiente debe ser true (o ausente): ${JSON.stringify(libro.revisionPendiente)}`);
    }

    // --- URLs duplicadas (posible duplicado) ---
    // Con el MISMO id (multi-categoría) se saltea; con ids DISTINTOS es problema.
    if (libro.linkPdf) {
      const previos = linkPdfs.get(libro.linkPdf) || [];
      if (previos.length && previos.every(p => p.id !== libro.id)) {
        problemas.push(`linkPdf duplicado (ids distintos): ${libro.linkPdf} → ${previos.map(p => `${p.categoria}|${p.titulo}`).join(', ')} y ${categoria}|${libro.titulo}`);
      }
      previos.push({ categoria, titulo: libro.titulo, id: libro.id });
      linkPdfs.set(libro.linkPdf, previos);
    }
    if (libro.imagenPortada) {
      const previos = portadas.get(libro.imagenPortada) || [];
      if (previos.length && previos.every(p => p.id !== libro.id)) {
        problemas.push(`imagenPortada duplicada (ids distintos): ${libro.imagenPortada} → ${previos.map(p => `${p.categoria}|${p.titulo}`).join(', ')} y ${categoria}|${libro.titulo}`);
      }
      previos.push({ categoria, titulo: libro.titulo, id: libro.id });
      portadas.set(libro.imagenPortada, previos);
    }

    // --- Conteos ---
    if (libro.linkPdf) porCategoria.conPdf++;
    if (libro.revisionPendiente === true) porCategoria.conRevision++;
  });

  resumenGeneral.total += porCategoria.total;
  resumenGeneral.conPdf += porCategoria.conPdf;
  resumenGeneral.conRevision += porCategoria.conRevision;
  resumenGeneral.sinTitulo += porCategoria.sinTitulo;

  console.log(`📊 ${categoria}: ${porCategoria.total} libros | ${porCategoria.conPdf} con PDF | ${porCategoria.conRevision} revisionPendiente | ${porCategoria.sinTitulo} sin título`);
}

// --- Portal de revisión humana (§6) ---
console.log('\n🧑‍🔬 Portal de revisión humana (esqueletos por completar vía PR):');
let hayEsqueletos = false;
for (const archivo of archivos) {
  const categoria = archivo.replace(/^libros-/, '').replace(/\.json$/, '');
  const datos = leerArchivo(archivo);
  if (!Array.isArray(datos)) continue;
  for (const l of datos) {
    if (!l) continue;
    if (l.revisionPendiente === true || !l.titulo) {
      hayEsqueletos = true;
      console.log(`   ⚠️ [${categoria}] ${l.id} | ${l.titulo || '(SIN TÍTULO)'} | img:${l.imagenPortada ? l.imagenPortada.split('/').pop() : '(sin portada)'}`);
    }
  }
}
if (!hayEsqueletos) console.log('   (ninguno)');

// --- Salida final ---
console.log('\n' + '═'.repeat(64));
console.log(`📦 TOTAL: ${resumenGeneral.total} libros | ${resumenGeneral.conPdf} con PDF | ${resumenGeneral.conRevision} revisionPendiente | ${resumenGeneral.sinTitulo} sin título`);
console.log(`🔗 Libros en múltiples categorías (intencional, mismo id): ${multiCategoria.size}`);
if (problemas.length) {
  console.log(`\n❌ ${problemas.length} problema(s) encontrados:`);
  problemas.forEach(p => console.log(`   • ${p}`));
  process.exit(1);
}
console.log('\n✅ Todo OK — 0 duplicados, formato consistente.');
process.exit(0);