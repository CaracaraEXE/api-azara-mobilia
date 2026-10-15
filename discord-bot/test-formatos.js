/**
 * test-formatos.js — Verificación de la presentación del bot (formatos.js).
 *
 * Zero-deps: se corre con `node test-formatos.js` (o `npm test`). Vive en el
 * REPO a propósito: los tests en temp se pierden y no sirven de red de seguridad.
 *
 * Cubre el helper construirMensajeLibro y el TOGGLE de titulares de /ficha:
 *   - estado oculto (default): sin field 🗞️, botón "📖 Ver titulares (N)"
 *   - estado visible: field 🗞️ con "• " + titulares, botón "🔽 Ocultar titulares"
 *   - el estado viaja en el custom_id ({cmd:'tits-toggle', id, v})
 *   - ítems SIN titulares (libros/RE): sin botón, sin field 🗞️
 *   - regresión: título/color/orden de fields/colección (libros vs RE)/PDF/bilingüe
 *   - truncado > 1000 chars con contador (data REAL: Revista Azara N1/N2)
 */

const path = require('path');
const formatos = require('./src/formatos');

const revista = require(
  path.join(__dirname, '..', 'backend', 'src', 'data', 'revista-azara', 'revista-azara.json')
);

let ok = 0;
let fail = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log(`  \u2713 ${nombre}`); }
  else { fail++; console.log(`  \u2717 ${nombre}`); }
}
function igual(nombre, real, esperado) {
  check(`${nombre} (esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)})`, real === esperado);
}
const names = campos => campos.map(f => f.name);

// ── Fixtures ──────────────────────────────────────────────
const conTitulares = {
  id: 'lib-test01',
  titulo: 'Edición de prueba',
  seccion: 'revista-azara',
  categorias: ['Revista Azara'],
  autor: 'Autor X',
  anio: 2020,
  linkPdf: 'http://ejemplo/x.pdf',
  imagenPortada: 'http://ejemplo/p.jpg',
  titulares: ['Uno', 'Dos', 'Tres']
};

const libroNormal = {
  id: 'lib-test02',
  titulo: 'Libro de prueba',
  seccion: 'libros',
  categorias: ['Mastozoología'],
  autor: null,
  anio: 2019,
  coleccion: 'Serie Ñandú',
  linkPdf: 'http://ejemplo/l.pdf',
  imagenPortada: 'http://ejemplo/p2.jpg'
};

const reCurso = {
  id: 'lib-re01',
  titulo: 'Cuadernillo X',
  seccion: 'recursos',
  categorias: ['Recursos Educativos'],
  coleccion: 'Cuadernillos',
  autor: 'Autor RE',
  anio: 2021,
  linkPdf: 'http://ejemplo/r.pdf'
};

// ── 1. /ficha con titulares, estado OCULTO (default) ─────
console.log('\n[1] /ficha con titulares — estado OCULTO');
{
  const m = formatos.construirMensajeLibro(conTitulares, false);
  const e = m.embeds[0];

  igual('título', e.title, 'Edición de prueba');
  igual('color', e.color, 0x00AE86);
  check('orden de fields (sin Titulares)', JSON.stringify(names(e.fields)) ===
    JSON.stringify(['\uD83D\uDCF0 Sección', '\uD83D\uDCC1 Categoría', '\u270D\uFE0F Autor', '\uD83D\uDCC5 Año', '\uD83D\uDCC4 PDF']));
  igual('Sección', e.fields[0].value, 'Revista Azara');
  igual('Categoría', e.fields[1].value, 'Revista Azara');
  igual('Autor', e.fields[2].value, 'Autor X');
  igual('Año', e.fields[3].value, '2020');
  igual('PDF', e.fields[4].value, '[Español](http://ejemplo/x.pdf)');
  igual('imagen', e.image?.url, 'http://ejemplo/p.jpg');
  check('NO hay field Titulares', !e.fields.some(f => f.name === '🗞️ Titulares'));

  check('hay 1 ActionRow', m.components?.length === 1 && m.components[0].type === 1);
  const b = m.components?.[0]?.components?.[0];
  check('hay botón type 2 / style 2', b?.type === 2 && b?.style === 2);
  igual('label (oculto)', b?.label, '\uD83D\uDCD6 Ver titulares (3)');
  check('label <= 80 chars', (b?.label || '').length <= 80);
  igual('custom_id', b?.custom_id, JSON.stringify({ cmd: 'tits-toggle', id: 'lib-test01', v: false }));
}

// ── 2. /ficha con titulares, estado VISIBLE ──────────────
console.log('\n[2] /ficha con titulares — estado VISIBLE');
{
  const m = formatos.construirMensajeLibro(conTitulares, true);
  const e = m.embeds[0];
  const tits = e.fields.find(f => f.name === '🗞️ Titulares');

  check('hay field Titulares', !!tits);
  igual('value Titulares (con "• ")', tits?.value, '\u2022 Uno\n\u2022 Dos\n\u2022 Tres');

  const b = m.components?.[0]?.components?.[0];
  igual('label (visible)', b?.label, '\uD83D\uDD3D Ocultar titulares');
  igual('custom_id v:true', b?.custom_id, JSON.stringify({ cmd: 'tits-toggle', id: 'lib-test01', v: true }));
}

// ── 3. Ítem SIN titulares (libro normal): sin botón ──────
console.log('\n[3] /ficha sin titulares — sin botón, con Colección');
{
  const m = formatos.construirMensajeLibro(libroNormal, false);
  const e = m.embeds[0];

  check('NO hay components (sin botón)', m.components === undefined);
  check('hay field Colección', e.fields.some(f => f.name === '\uD83D\uDDC2\uFE0F Colección'));
  check('NO hay field Titulares', !e.fields.some(f => f.name === '🗞️ Titulares'));
  igual('Sección', e.fields[0].value, 'Libros');
  igual('Categoría', e.fields[1].value, 'Mastozoología');
  igual('Autor null → Desconocido', e.fields[2].value, 'Desconocido');
  igual('Año', e.fields[3].value, '2019');
  igual('Colección', e.fields.find(f => f.name === '\uD83D\uDDC2\uFE0F Colección')?.value, 'Serie Ñandú');
}

// ── 4. RE: coleccion es la CATEGORÍA, no Colección ───────
console.log('\n[4] RE — la colección es la categoría (sin field Colección)');
{
  const e = formatos.construirMensajeLibro(reCurso, false).embeds[0];
  check('NO hay field Colección', !e.fields.some(f => f.name === '\uD83D\uDDC2\uFE0F Colección'));
  igual('Categoría = coleccion', e.fields[1].value, 'Cuadernillos');
  igual('Sección', e.fields[0].value, 'Recursos educativos');
}

// ── 5. PDF bilingüe + sin PDF ────────────────────────────
console.log('\n[5] PDF bilingüe y sin PDF');
{
  const bilingue = { ...libroNormal, id: 'lib-b', linkPdf: 'http://e/es.pdf', linkPdfEn: 'http://e/en.pdf' };
  igual('PDF ES · EN', formatos.construirMensajeLibro(bilingue, false).embeds[0]
    .fields.find(f => f.name === '\uD83D\uDCC4 PDF')?.value,
    '[Español](http://e/es.pdf) · [English](http://e/en.pdf)');

  const sinPdf = { ...libroNormal, id: 'lib-c', linkPdf: null };
  check('sin linkPdf → sin field PDF', !formatos.construirMensajeLibro(sinPdf, false).embeds[0]
    .fields.some(f => f.name === '\uD83D\uDCC4 PDF'));
}

// ── 6. Título largo truncado a 256 ───────────────────────
console.log('\n[6] Título largo');
{
  const largo = { ...libroNormal, id: 'lib-d', titulo: 'x'.repeat(300) };
  igual('título truncado a 256', formatos.construirMensajeLibro(largo, false).embeds[0].title.length, 256);
}

// ── 7. Truncado: real (sanity) + fixture sintético (fuerza > 1000) ──
console.log('\n[7] Truncado de titulares > 1000 chars');
{
  const masTitulares = revista.slice().sort((a, b) => b.titulares.length - a.titulares.length)[0];
  const real = formatos.construirMensajeLibro(masTitulares, true).embeds[0]
    .fields.find(f => f.name === '🗞️ Titulares');
  console.log(`  (real ${masTitulares.id}: ${masTitulares.titulares.length} titulares, ${real.value.length} chars)`);
  check('real: value <= 1024 (límite Discord)', real.value.length <= 1024);

  // Fixture: 30 titulares largos → plano ~1.9k chars → DEBE truncar con contador
  const largos = Array.from({ length: 30 }, (_, i) => `Titular número ${i + 1} `.padEnd(60, 'x'));
  const grande = { ...conTitulares, id: 'lib-big', titulares: largos };
  const planoGrande = largos.map(t => `• ${t}`).join('\n');
  const valor = formatos.construirMensajeLibro(grande, true).embeds[0]
    .fields.find(f => f.name === '🗞️ Titulares').value;

  check('sintético: plano > 1000', planoGrande.length > 1000);
  check('sintético: incluye contador "(mostrando X de 30"', /\(mostrando \d+ de 30 titulares\)/.test(valor));
  check('sintético: value <= 1024 (límite Discord)', valor.length <= 1024);
}

// ── 8. Regresión data REAL: N14 oculto/visible ───────────
console.log('\n[8] Revista Azara N14 — toggle oculto/visible');
{
  const n14 = revista.find(x => x.id === 'lib-pued1cal');
  const oculto = formatos.construirMensajeLibro(n14, false);
  const visible = formatos.construirMensajeLibro(n14, true);

  check('oculto: sin field Titulares', !oculto.embeds[0].fields.some(f => f.name === '🗞️ Titulares'));
  igual('oculto: label con total', oculto.components[0].components[0].label, `\uD83D\uDCD6 Ver titulares (${n14.titulares.length})`);
  igual('oculto: custom_id v false', JSON.parse(oculto.components[0].components[0].custom_id).v, false);
  check('visible: field Titulares presente', visible.embeds[0].fields.some(f => f.name === '🗞️ Titulares'));
  igual('visible: custom_id v true', JSON.parse(visible.components[0].components[0].custom_id).v, true);
}

// ── Resumen ──────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${ok} OK, ${fail} FALLIDOS (de ${ok + fail})`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
