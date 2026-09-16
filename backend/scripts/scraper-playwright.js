/**
 * Scraper con Playwright - Fundación Azara
 * 
 * Usa navegador real para evitar CloudFlare
 * 
 * Uso:
 *   node scripts/scraper-playwright.js                  (usa SCRAPEAR_CATEGORIA por defecto)
 *   node scripts/scraper-playwright.js --categoria=slug  (una categoría específica)
 *   node scripts/scraper-playwright.js --todas           (todas las categorías)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Categorías a scrapear
const CATEGORIAS = [
  { nombre: 'Institucionales', slug: 'institucionales', url: 'https://fundacionazara.org.ar/libros/' },
  { nombre: 'Astronomía y Geología', slug: 'astronomia-y-geologia', url: 'https://fundacionazara.org.ar/libros/libros-de-astronomia-y-geologia/' },
  { nombre: 'Paleontología', slug: 'paleontologia', url: 'https://fundacionazara.org.ar/libros/libros-de-paleontologia/' },
  { nombre: 'Evolución, genética, ecología y etología', slug: 'evolucion-genetica-ecologia-y-etologia', url: 'https://fundacionazara.org.ar/libros/libros-de-evolucion-genetica-ecologia-y-etologia/' },
  { nombre: 'Divulgación científica', slug: 'divulgacion-cientifica', url: 'https://fundacionazara.org.ar/libros/libros-de-divulgacion-cientifica/' },
  { nombre: 'Exploraciones, historia de la ciencia y biografías', slug: 'historia-de-la-ciencia', url: 'https://fundacionazara.org.ar/libros-de-exploraciones-historia-de-la-ciencia-y-biografias/' },
  { nombre: 'Ambiente', slug: 'ambiente', url: 'https://fundacionazara.org.ar/libros-de-ambiente/' },
  { nombre: 'Antropología', slug: 'antropologia', url: 'https://fundacionazara.org.ar/libros/libros-de-antropologia/' },
  { nombre: 'Flora y Fauna', slug: 'flora-y-fauna', url: 'https://fundacionazara.org.ar/libros/libros-de-flora-y-fauna/' },
  { nombre: 'Áreas naturales', slug: 'areas-naturales', url: 'https://fundacionazara.org.ar/libros/libros-de-areas-naturales/' },
  { nombre: 'Historia y patrimonio cultural', slug: 'patrimonio-cultural', url: 'https://fundacionazara.org.ar/libros-de-historia-y-patrimonio-cultural/' },
  { nombre: 'Infantiles', slug: 'infantiles', url: 'https://fundacionazara.org.ar/libros/libros-infantiles/' },
  { nombre: 'Auspiciados', slug: 'auspiciados', url: 'https://fundacionazara.org.ar/libros/libros-auspiciados/' },
];

// Colecciones multi-libro catalogadas (PLANV2.md §4.1). El scraper desglosa SOLO estas URLs;
// cualquier otra página con >1 PDF/h4/img se loguea como "posible colección no catalogada".
// patrones: pares-h4-pdf | contenedor-por-libro | div-titulos-carrousel | imagenes-sueltas | pdfs-romanos
const COLECCIONES_CONOCIDAS = [
  { url: 'https://fundacionazara.org.ar/coleccion-voces-ancestrales-de-los-valles-calchaquies/', patron: 'pares-h4-pdf', coleccion: 'Voces ancestrales de los Valles Calchaquíes' },
  { url: 'https://fundacionazara.org.ar/coleccion-viajeros-y-exploradores-de-la-patagonia/', patron: 'div-titulos-carrousel', coleccion: 'Viajeros y exploradores de la Patagonia' },
  { url: 'https://fundacionazara.org.ar/coleccion-viajeros-olvidados/', patron: 'contenedor-por-libro', coleccion: 'Viajeros olvidados' },
  { url: 'https://fundacionazara.org.ar/coleccion-ciencia-para-todos/', patron: 'contenedor-por-libro', coleccion: 'Ciencia para todos' },
  { url: 'https://fundacionazara.org.ar/guia-de-las-reservas-naturales-de-la-argentina/', patron: 'imagenes-sueltas', coleccion: 'Guía de las reservas naturales de la Argentina' },
  { url: 'https://fundacionazara.org.ar/fauna-argentina-amenazada/', patron: 'imagenes-sueltas', coleccion: 'Fauna argentina amenazada' },
  { url: 'https://fundacionazara.org.ar/los-invertebrados-fosiles/', patron: 'pdfs-romanos', coleccion: 'Los invertebrados fósiles' },
  { url: 'https://fundacionazara.org.ar/trazos-nativos-diseno-iconografico-de-las-sierras-de-cordoba-serie-infantil-para-colorear/', patron: 'imagenes-sueltas', coleccion: 'Trazos nativos. Diseño iconográfico de las sierras de Córdoba' },
];

// === CONFIGURACIÓN ===
// Categoría por defecto (se puede sobreescribir con --categoria= o --todas)
const SCRAPEAR_CATEGORIA = 'auspiciados';
// ====================

// --- Parsear argumentos CLI ---
const args = process.argv.slice(2);
const CATEGORIA_ARG = args.find(a => a.startsWith('--categoria='));
const ES_TODAS = args.includes('--todas');

const CATEGORIA_SELECTED = ES_TODAS
  ? 'TODAS'
  : CATEGORIA_ARG
    ? CATEGORIA_ARG.split('=')[1]
    : SCRAPEAR_CATEGORIA;
// -----------------------------

const DATA_DIR = path.join(__dirname, '../src/data');

// === AJUSTES ===
const GUARDAR_CADA = 5; // Guarda progreso cada N libros (para no perder si se corta)
// ==============

function generarId() {
  return 'lib-' + Math.random().toString(36).substring(2, 10);
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extraer URLs de libros desde la página de categoría
 */
async function obtenerUrlsLibros(page, urlCategoria) {
  console.log('   🔍 Obteniendo lista de libros...');
  
  await page.goto(urlCategoria, { waitUntil: 'networkidle' });
  await esperar(1000);
  
  // Extraer enlaces de artículos
  const urls = await page.$$eval('article a[href*="fundacionazara.org.ar"]', 
    links => links
      .map(a => a.href)
      .filter(h => h.match(/https:\/\/fundacionazara\.org\.ar\/[a-z0-9-]+\/$/))
  );
  
  const urlsUnicas = [...new Set(urls)];
  console.log(`   ✅ Encontradas ${urlsUnicas.length} URLs`);
  return urlsUnicas;
}

/**
 * Extraer datos de una página individual
 * 
 * Orden de selectores para el título:
 *   1. <h4> (99% de los libros)
 *   2. Fallback: primer <p> con contenido sustancial
 */
async function obtenerDatosLibro(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await esperar(500);
  
  // --- Título ---
  let titulo = await page.$eval('h4', el => el.textContent.trim()).catch(() => null);
  
// --- Autor y año ---
  let autor = null;
  let anio = null;
  
  const infoRaw = await page.$eval('h4 + p', el => el.textContent.trim()).catch(() => '');
  if (infoRaw) {
    // Fix B5 (PLANV2): limpiar prefijo "Editorial X | " ANTES del regex
    const infoLimpia = limpiarInformacionAutor(infoRaw);
    const match = infoLimpia.match(/^(.+?),\s*(\d{4})/);
    if (match) {
      autor = match[1].trim();
      anio = parseInt(match[2]);
    }
  }
  
  // --- Fallback si no hay <h4> (páginas con estructura diferente) ---
  if (!titulo) {
    const parrafos = await page.$$eval('.entry-content p, article p', els =>
      els.map(e => e.textContent.trim()).filter(t => t.length > 10 && t !== 'Avisos')
    ).catch(() => []);
    
    if (parrafos.length > 0) {
      const texto = parrafos[0];
      
      // Intentar separar título de "Autor, Año" al final del texto
      const matchAyA = texto.match(/^(.+?)\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*),\s*(\d{4})\.?$/);
      if (matchAyA) {
        titulo = matchAyA[1].trim();
        autor = matchAyA[2].trim();
        anio = parseInt(matchAyA[3]);
      } else {
        // Si no se puede separar, usar todo el texto como título
        // Fix B5: si trae prefijo "Editorial X | ", separarlo del título
        const limpiado = limpiarInformacionAutor(texto);
        titulo = limpiado;
      }
    }
  }
  
  // --- PDF ---
  // Fix C11 (PLANV2): el sitio a veces renderiza href="...pdf&#039;" (apóstrofo literal).
  // a[href$=".pdf"] NO matchea ese caso → usar a[href*=".pdf"] y limpiar el apóstrofo final.
  const linkPdfRaw = await page.$eval('a[href*=".pdf"]', el => el.href).catch(() => null);
  const linkPdf = linkPdfRaw ? limpiarUrlPdf(linkPdfRaw) : null;
  
  // --- Imagen de portada (excluir logo/banner/svg) ---
  // GOTCHA (2026-09-16): el viejo filtro `!src.includes('logo')` excluía portadas
  // cuyo filename contiene "logo" como subcadena ("zooLOGO", "bioLOGO") → Arnaldo
  // Winkelried Bertoni (primer zoologo) y Aventuras de un biólogo quedaban sin
  // portada. El logo del sitio es SIEMPRE "logo-azara-*" y el banner "banner-azara-*".
  const imagenPortada = await page.$$eval('img', imgs => {
    for (const img of imgs) {
      const src = img.src || img.getAttribute('data-src') || '';
      if (src && !/logo-azara|banner-azara/.test(src) && !src.endsWith('.svg')) {
        return src;
      }
    }
    return null;
  });
  
  return { titulo, autor, anio, linkPdf, imagenPortada };
}

// ============================================================
// FIXES Y HELPERS (PLANV2.md §4.2, §10)
// ============================================================

/** Fix C11: quitar apóstrofo/espacios residuales del href (ej: "...pdf&#039;" → "...pdf") */
function limpiarUrlPdf(href) {
  return (href || '').trim().replace(/'+$/, '').trim();
}

/** Fix B5: limpiar prefijo "Editorial X | " → quedarse con la última parte tras "|" */
function limpiarInformacionAutor(raw) {
  if (!raw) return '';
  return raw.split('|').pop().trim();
}

/** Normalizar URL de portada: quitar sufijo de resolución WP ("-300x258.jpg" → ".jpg") */
function normalizarImg(url) {
  return (url || '').trim().replace(/-\d{2,4}x\d{2,4}(?=\.(jpe?g|png|webp)$)/i, '');
}

/**
 * Claves estables de un libro para deduplicación transversal (PLANV2 §10):
 * portada > PDF > título normalizado. Prioridad por fiabilidad discriminante:
 * la portada identifica al libro real; el PDF puede estar mal puesto en la web
 * (caso Mikrokosmos→Alfredo-Castellanos) y el título puede repetirse.
 *
 * GOTCHA (2026-09-16): los esqueletos de colecciones "imagenes-sueltas" usan
 * títulos placeholder "Tomo NN" por POSICIÓN (i+1) → son IDÉNTICOS entre
 * colecciones (guía/flora/trazos) → la clave título los fusionaba en un id
 * con data distinta. El título placeholder NO es discriminatorio: se excluye.
 */
const TITULO_PLACEHOLDER = /^tomo\s+(\d+|[ivxlcdm]+)$/i;

function clavesDeLibro({ imagenPortada, linkPdf, titulo }) {
  const claves = [];
  if (imagenPortada) claves.push('img:' + normalizarImg(imagenPortada));
  if (linkPdf) claves.push('pdf:' + linkPdf.trim());
  if (titulo && !TITULO_PLACEHOLDER.test(titulo.trim())) claves.push('titulo:' + normalizarTexto(titulo));
  return claves;
}

/** Normalizar para emparejamiento: lowercase, sin acentos, sin puntuación, guiones */
function normalizarTexto(t) {
  return (t || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Autor, AÑO." / "Autor, AÑO-RANGO." o solo "Autor" → { autor, anio } */
function parsearAutorAnio(raw) {
  const texto = (raw || '').trim().replace(/\.\s*$/, '');
  const match = texto.match(/^(.+?),\s*(\d{4}(?:\s*[-–—]\s*\d{4})?)$/);
  if (match) {
    const rango = /[-–—]/.test(match[2]);
    return { autor: match[1].trim(), anio: rango ? null : parseInt(match[2]) };
  }
  return { autor: texto || null, anio: null };
}

/**
 * Título provisorio desde el filename de la portada (PLANV2 §4.2-d):
 * quita sufijo de resolución de WP (-300x258 / -550-232x200) y prefijo de colección.
 */
function tituloDesdeFilename(src, prefijo) {
  if (!src) return '';
  let f = decodeURIComponent(src.split('/').pop().replace(/\.(jpe?g|png|webp)$/i, ''));
  f = f.replace(/-\d+x\d+[a-z]*$/i, '');        // sufijo de resolución
  if (prefijo) {
    const esc = prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    f = f.replace(new RegExp('^' + esc + '-?', 'i'), '');
  }
  return f.replace(/[-_]+/g, ' ').trim();
}

/** Construir objeto libro con el modelo actual + campo `coleccion` (PLANV2 §2) */
function nuevoLibroExtraido(datos, coleccion) {
  const libro = {
    id: generarId(),
    titulo: datos.titulo,
    linkPdf: datos.linkPdf || null,
    imagenPortada: datos.imagenPortada || null,
    autor: datos.autor || null,
    anio: datos.anio ?? null,
    coleccion: coleccion || null,
    fechaExtraccion: new Date().toISOString()
  };
  if (datos.revisionPendiente) libro.revisionPendiente = true;
  return libro;
}

// ============================================================
// EXTRACTORES POR PATRÓN (PLANV2.md §4.2)
// ============================================================

/**
 * a) pares-h4-pdf (Voces ancestrales): contenedores Elementor con h4+img+a[href$=".pdf"].
 * El primer H4 de la saga no tiene PDF adyacente → se descarta solo.
 */
async function extraerParesH4Pdf(page, coleccion) {
  const bloques = await page.$$eval('div.elementor-widget-wrap', blocks =>
    blocks
      .filter(b => b.querySelector('h4') && b.querySelector('a[href$=".pdf"]'))
      .map(b => ({
        titulo: b.querySelector('h4').textContent.replace(/\s+/g, ' ').trim(),
        pdf: b.querySelector('a[href$=".pdf"]').href,
        img: (b.querySelector('img[src*="uploads"]') || {}).src || null
      }))
  );
  const libros = [];
  const vistos = new Set();
  for (const b of bloques) {
    if (!b.titulo) continue;
    const clave = b.img || b.pdf || b.titulo;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    libros.push(nuevoLibroExtraido({
      titulo: b.titulo,
      linkPdf: limpiarUrlPdf(b.pdf),
      imagenPortada: b.img
    }, coleccion.coleccion));
  }
  return libros;
}

/**
 * b) contenedor-por-libro (Viajeros olvidados / Ciencia para todos):
 * div.elementor-widget-wrap.elementor-element-populated con img + h4>strong + p (autor, año).
 * Dedup por imagen: Ciencia para todos duplica el contenedor del primer libro (verificado).
 */
async function extraerContenedorPorLibro(page, coleccion) {
  const bloques = await page.$$eval('div.elementor-widget-wrap.elementor-element-populated', blocks =>
    blocks
      .filter(b => b.querySelector('h4') && b.querySelector('img[src*="uploads"]'))
      .map(b => {
        const h4 = b.querySelector('h4');
        const pPost = b.querySelector('h4 + p');
        return {
          titulo: h4.textContent.replace(/\s+/g, ' ').trim(), // limpia <br> residual ("...<br>")
          raw: pPost ? pPost.textContent.replace(/\s+/g, ' ').trim() : '',
          img: b.querySelector('img[src*="uploads"]').src,
          pdf: (b.querySelector('a[href$=".pdf"]') || {}).href || null
        };
      })
  );
  const libros = [];
  const vistosImg = new Set();
  for (const b of bloques) {
    if (!b.img || vistosImg.has(b.img)) continue; // dedup contenedor duplicado
    vistosImg.add(b.img);
    const { autor, anio } = parsearAutorAnio(limpiarInformacionAutor(b.raw));
    libros.push(nuevoLibroExtraido({
      titulo: b.titulo,
      autor,
      anio,
      linkPdf: b.pdf ? limpiarUrlPdf(b.pdf) : null,
      imagenPortada: b.img
    }, coleccion.coleccion));
  }
  return libros;
}

/**
 * c) div-titulos-carrousel (Viajeros y exploradores de la Patagonia):
 * títulos en p>strong de un div (la página NO es Elementor: el div con más p strong
 * es el de la lista; p[0] intro sin strong → descarta solo); autor/año = p − strong.
 * Portadas: img[src*="uploads"] directas en article (dedup por src) — NO owl-carousel
 * (verificado 2026-09-09: la página actual no tiene .owl-carousel).
 * EMPAREJAR POR FILENAME normalizado (índice PROHIBIDO: orden carrousel ≠ orden títulos).
 */
async function extraerDivTitulosCarrousel(page, coleccion) {
  // 1) Títulos + autor/año: de TODOS los divs, tomar el que más p strong tenga
  const titulos = await page.$$eval('div', divs => {
    const candidatos = divs
      .filter(d => d.querySelectorAll('p strong').length >= 5)
      .sort((a, b) => b.querySelectorAll('p strong').length - a.querySelectorAll('p strong').length);
    const d = candidatos[0];
    if (!d) return [];
    return [...d.querySelectorAll('p')]
      .map(p => {
        const strong = p.querySelector('strong');
        if (!strong) return null;
        const titulo = strong.textContent.replace(/\s+/g, ' ').trim();
        const clon = p.cloneNode(true);               // p − strong (br incluidos)
        const s = clon.querySelector('strong');
        if (s) s.remove();
        const resto = clon.textContent.replace(/\s+/g, ' ').trim();
        return { titulo, resto };
      })
      .filter(Boolean);
  });

  // 2) Portadas: imgs directas del article (dedup por src, sin logo/banner/svg)
  const imgs = await page.$$eval('article img[src*="uploads"]', imgs =>
    [...new Set(imgs.map(i => i.src || '')
      .filter(s => !s.includes('logo') && !s.includes('banner') && !s.endsWith('.svg')))]
  );

  // 3) Emparejar por filename normalizado ("...coleccion-viajeros...-Cautivo-en-la-Patagonia.jpg")
  const prefijo = coleccion.url.split('/').filter(Boolean).pop(); // 'coleccion-viajeros-y-exploradores-de-la-patagonia'
  const disponibles = imgs.map(src => ({ src, limpio: normalizarTexto(tituloDesdeFilename(src, prefijo)) }));

  const libros = [];
  for (const t of titulos) {
    const tl = normalizarTexto(t.titulo);
    // Dos pasadas:
    // 1) Igualdad EXACTA (evita que un subtítulo que menciona la portada de otro libro
    //    la consuma — verificado: "cautivo en la Patagonia" en Guinnard 1856-1859).
    // 2) includes() cruzado como fallback: entre todos los candidatos, el MÁS ESPECÍFICO
    //    (filename más largo contenido en el título = el propio; los cortos tipo "cautivo
    //    en la patagonia" mencionado en un subtítulo quedan debajo en prioridad).
    let idx = disponibles.findIndex(p => p.limpio === tl);
    if (idx < 0) {
      const candidatos = disponibles.filter(p =>
        p.limpio && (p.limpio.includes(tl) || tl.includes(p.limpio)));
      if (candidatos.length) {
        candidatos.sort((a, b) => b.limpio.length - a.limpio.length);
        idx = disponibles.indexOf(candidatos[0]);
      }
    }
    let imagenPortada = null;
    if (idx >= 0) {
      imagenPortada = disponibles[idx].src;
      disponibles.splice(idx, 1);
    }
    const { autor, anio } = parsearAutorAnio(t.resto);
    // Sin match de portada → híbrido §4.2-d: provisorio + revisionPendiente
    libros.push(nuevoLibroExtraido({
      titulo: t.titulo,
      autor,
      anio,
      imagenPortada,
      revisionPendiente: !imagenPortada
    }, coleccion.coleccion));
  }
  return libros;
}

/**
 * e) imagenes-sueltas (Guía de reservas / Fauna amenazada / Trazos nativos):
 * SIN títulos en el DOM → esqueleto por imagen única, título provisorio desde filename,
 * revisionPendiente SIEMPRE (el humano completa vía PR). Subcolección desde H4 de sección.
 */
async function extraerImagenesSueltas(page, coleccion) {
  const info = await page.evaluate((coleccionNombre) => {
    const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    const norm = t => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // Imágenes de contenido únicas (dedup por src: clones owl comparten src)
    const srcs = [...new Set([...document.querySelectorAll('img')]
      .map(i => i.src || '')
      .filter(s => s.includes('uploads') && s && !/logo-azara|banner-azara/.test(s) && !s.endsWith('.svg')))];

    // Párrafo de la serie (autor): el p con "|" o mención a editorial (fix B5)
    let pSerie = '';
    for (const p of document.querySelectorAll('article p, .entry-content p')) {
      const t = txt(p);
      if (t.includes('|') || /editorial/i.test(t)) { pSerie = t; break; }
    }

    // Subcolección por H4 de sección (Fauna: "Los que se van" / "Otros que se van").
    // El H4 igual al nombre de la colección es la saga → no es subcolección.
    // GOTCHA verificado (2026-09-09): en Fauna las portadas van ANTES de sus H4 en el DOM
    // (H2 → imgs → H4 → img → H4). Si la primera img aparece antes del primer H4, la
    // subcolección NO es fiable → sub = null para todas (título provisorio Tomo NN).
    const normCol = norm(coleccionNombre);
    const nodos = [...document.querySelectorAll('article h4, article h5, article img')];
    const idxPrimerH4 = nodos.findIndex(n => n.tagName !== 'IMG');
    const idxPrimeraImg = nodos.findIndex(n => n.tagName === 'IMG' && srcs.includes(n.src));
    const imgsAntesDeH4 = idxPrimeraImg >= 0 && (idxPrimerH4 < 0 || idxPrimeraImg < idxPrimerH4);

    const subPorSrc = new Map();
    if (!imgsAntesDeH4) {
      let h4Actual = null;
      for (const n of nodos) {
        if (n.tagName === 'H4' || n.tagName === 'H5') {
          const t = txt(n);
          h4Actual = (t && norm(t) !== normCol) ? t : null;
        } else if (n.src && srcs.includes(n.src)) {
          subPorSrc.set(n.src, h4Actual);
        }
      }
    }

    return { srcs, pSerie, subPorSrc: Object.fromEntries(subPorSrc) };
  }, coleccion.coleccion);

  const autor = info.pSerie ? (() => { const { autor } = parsearAutorAnio(limpiarInformacionAutor(info.pSerie)); return autor; })() : null;

  const libros = [];
  info.srcs.forEach((src, i) => {
    // Tomo desde el numeral del filename (criterio de la fundación: guia-…-01 = Tomo 1,
    // Trazos-nativos-02.jpg = Tomo 2). GOTCHA ACTUALIZADO (2026-09-16): el DOM muestra las
    // láminas BARAJADAS (Guía: 02,03,04,05,01; Trazos: 06,07,08,02,base,03,disenos,04,05)
    // → la POSICIÓN (i+1) está mal. El gotcha viejo ("2019→07") queda cubierto porque el
    // patrón exige EXACTAMENTE 2 dígitos (un año de 4 dígitos no matchea → fallback posición).
    // Sin numeral: "Trazos-nativos.jpg" (base) → 1; "disenos-iconograficos" (cierre) → 9.
    const numero = String(tomoDesdeFilename(src) ?? (i + 1)).padStart(2, '0');
    const sub = info.subPorSrc[src] || null;
    // GOTCHA: el H4 puede YA incluir el prefijo de la colección ("Fauna argentina
    // amenazada: Los que se van") → no volver a concatenarlo.
    const col = sub ? (sub.startsWith(coleccion.coleccion) ? sub : `${coleccion.coleccion}: ${sub}`) : coleccion.coleccion;
    libros.push({ ...nuevoLibroExtraido({
      titulo: sub ? `${sub.trim()} ${numero}` : `Tomo ${numero}`,
      imagenPortada: src,
      autor,
      anio: null,
      revisionPendiente: true
    }, col), _ordenTomo: parseInt(numero, 10) });
  });
  // El DOM baraja las láminas → reordeno por tomo para que el listado salga 01..N.
  // La API no aplica sort: respeta el orden del array.
  libros.sort((a, b) => a._ordenTomo - b._ordenTomo);
  libros.forEach((l) => delete l._ordenTomo);
  return libros;
}

/**
 * Tomo de una lámina de colección "imagenes-sueltas" a partir del numeral del filename.
 * NaN/null → el caller usa la posición como fallback. Ver nota en extraerImagenesSueltas.
 */
function tomoDesdeFilename(f) {
  const d = decodeURIComponent((f || '').split('/').pop());
  let m = d.match(/-(\d{2})-550-232x200\.jpe?g$/i);        // guía: "-02-550-232x200.jpg"
  if (m) return parseInt(m[1], 10);
  m = d.match(/-(\d{2})\.jpe?g$/i);                        // trazos: "Trazos-nativos-02.jpg"
  if (m) return parseInt(m[1], 10);
  if (/^trazos-nativos\.jpe?g$/i.test(d)) return 1;        // archivo base → Tomo 1
  if (/disenos-iconograficos/.test(d)) return 9;           // lámina de la colección completa → Tomo 9
  return null;
}

/**
 * f) pdfs-romanos (Los invertebrados fósiles): N PDFs cuyo filename termina en numeral romano
 * (-I.pdf, -II.pdf) = N tomos. Título: "${h4} Tomo ${numeral}" — SIN revisión humana.
 */
async function extraerPdfsRomanos(page, coleccion) {
  const info = await page.evaluate(() => {
    const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    return {
      base: txt(document.querySelector('h4')) || txt(document.querySelector('h1')) || '',
      pdfs: [...document.querySelectorAll('a[href$=".pdf"]')].map(a => a.href),
      imgs: [...new Set([...document.querySelectorAll('img')]
        .map(i => i.src || '')
        .filter(s => s.includes('uploads') && s && !/logo-azara|banner-azara/.test(s) && !s.endsWith('.svg')))]
    };
  });

  const base = info.base.replace(/\.\s*$/, '').trim();
  const tomos = info.pdfs
    .map(href => {
      const f = href.split('/').pop();
      const m = f.match(/-([ivxlcdm]+)\.pdf$/i);
      return m ? { href, numeral: m[1].toUpperCase() } : null;
    })
    .filter(Boolean);

  const romanos = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const libros = tomos.map((t, i) => nuevoLibroExtraido({
    titulo: `${base} Tomo ${t.numeral || romanos[i] || i + 1}`,
    linkPdf: limpiarUrlPdf(t.href),
    imagenPortada: info.imgs[i] || info.imgs[0] || null // orden de aparición (01→I, 02→II)
  }, coleccion.coleccion));
  return libros;
}

/**
 * Desglose de colección: switch por patrón (PLANV2 §4.1/§4.2).
 * Devuelve array de libros; si el patrón no matchea devuelve [] → degradación segura.
 */
async function obtenerDatosColeccion(page, coleccion) {
  switch (coleccion.patron) {
    case 'pares-h4-pdf': return extraerParesH4Pdf(page, coleccion);
    case 'contenedor-por-libro': return extraerContenedorPorLibro(page, coleccion);
    case 'div-titulos-carrousel': return extraerDivTitulosCarrousel(page, coleccion);
    case 'imagenes-sueltas': return extraerImagenesSueltas(page, coleccion);
    case 'pdfs-romanos': return extraerPdfsRomanos(page, coleccion);
    default: return [];
  }
}

/**
 * Índice global de libros ya registrados (PLANV2 §10): clave estable → entrada.
 * Incluye TODAS las categorías y el temp de la actual para ids estables entre
 * re-scrapes y para que un libro publicado en 2 categorías comparta UN id.
 */
function construirIndiceGlobal(librosActuales, categoriaSlug) {
  const indice = new Map();
  const indexar = (libro, categoria) => {
    for (const clave of clavesDeLibro(libro)) {
      indice.set(clave, { id: libro.id, libro, categoria });
    }
  };
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!/^libros-.+\.json$/.test(f)) continue;
    if (f.includes(`${categoriaSlug}.temp`)) continue; // el temp actual se indexa vía librosActuales
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
      const cat = f.replace(/^libros-/, '').replace(/\.json$/, '');
      arr.forEach(l => indexar(l, cat));
    } catch { /* archivo ilegible: se ignora (el validar:data lo reporta) */ }
  }
  librosActuales.forEach(l => indexar(l, categoriaSlug));
  return indice;
}

/** Buscar libro ya registrado por portada/pdf/título (en ese orden de fiabilidad) */
function buscarDuplicado(indiceGlobal, datos) {
  for (const clave of clavesDeLibro(datos)) {
    const hit = indiceGlobal.get(clave);
    if (hit) return hit;
  }
  return null;
}

/**
 * Overrides de datos (PLANV2 §10): decisiones humanas que el re-scrape NO debe revertir.
 * El sitio tiene el PDF "Alfredo-Castellanos.pdf" mal puesto en la página de
 * Mikrokosmos (es el PDF de OTRO libro; verificado 2026). Decisión: no exponerlo.
 * Si algún día la web lo corrige, se quita esta entrada.
 */
const OVERRIDES = {
  'lib-fym7jqgi': { linkPdf: null }, // Mikrokosmos, Christofredo Jakob y el inicio de la neurociencia argentina
  // Títulos madre de las series "imagenes-sueltas": el desglose genera "Tomo 01" y perdería
  // el nombre real del libro/colección. Restaurados 2026-09-16 (backup pre-re-scrape).
  'lib-l48j7yzk': { titulo: 'Guía de las reservas naturales de la Argentina – Tomo 01' },
  'lib-46v47u68': { titulo: 'Trazos nativos. Diseño iconográfico de las sierras de Córdoba (serie infantil para colorear) – Tomo 01' },
  'lib-zqtj2wgi': { titulo: 'Fauna argentina amenazada: Los que se van – Tomo 01' },
};

/** Aplicar decisiones humanas sobre datos re-extraídos (se llama en cada registro) */
function aplicarOverrides(libro) {
  if (libro && OVERRIDES[libro.id]) {
    Object.assign(libro, OVERRIDES[libro.id]);
  }
  return libro;
}

/**
 * Reutilizar la entrada ya registrada (mismo id) o crear una nueva.
 * Cuando ya existe, se toma la data NUEVA del sitio (los parsers arreglados
 * refrescan los datos) conservando el id estable: { ...datos, id: dup.id }.
 */
function registrarOConsolidar(indiceGlobal, datos) {
  const dup = buscarDuplicado(indiceGlobal, datos);
  if (dup) {
    return { ...datos, id: dup.id, fechaExtraccion: new Date().toISOString(), _duplicadoDe: { id: dup.id, categoria: dup.categoria } };
  }
  return aplicarOverrides({ id: generarId(), ...datos, fechaExtraccion: new Date().toISOString() });
}

/**
 * Scrapear una categoría con guardado incremental
 */
async function scrapearCategoria(browser, categoria) {
  console.log(`\n📚 Scraping: ${categoria.nombre}`);
  
  const rutaFinal = path.join(DATA_DIR, `libros-${categoria.slug}.json`);
  const rutaTemp = path.join(DATA_DIR, `libros-${categoria.slug}.temp.json`);
  
  const page = await browser.newPage();
  
  try {
    // Obtener URLs
    const urlsLibros = await obtenerUrlsLibros(page, categoria.url);
    
    if (urlsLibros.length === 0) {
      console.log('   ⚠️ No se encontraron libros');
      return { ...categoria, libros: [] };
    }
    
    // Cargar progreso previo si existe archivo temporal
    let libros = [];
    let desde = 0;
    if (fs.existsSync(rutaTemp)) {
      try {
        libros = JSON.parse(fs.readFileSync(rutaTemp, 'utf-8'));
        desde = libros.length;
        console.log(`   ♻️ Progreso anterior encontrado: ${desde} libros ya scrapeados`);
      } catch {
        console.log('   ⚠️ Archivo temporal corrupto, empezando de cero');
        libros = [];
      }
    }
    
    // Índice global para deduplicación transversal (PLANV2 §10): mismo libro en 2
    // categorías → UN solo id. También estabiliza los ids entre re-scrapes.
    const indiceGlobal = construirIndiceGlobal(libros, categoria.slug);
    
    // Extraer datos de cada libro
    for (let i = desde; i < urlsLibros.length; i++) {
      const url = urlsLibros[i];
      console.log(`   📖 [${i + 1}/${urlsLibros.length}]`);
      
      try {
        const coleccion = COLECCIONES_CONOCIDAS.find(c => c.url === url);
        
        if (coleccion) {
          // Desglose de colección multi-libro (PLANV2 §4): esa URL representa varios libros.
          await page.goto(url, { waitUntil: 'networkidle' });
          await esperar(500);
          const librosColeccion = await obtenerDatosColeccion(page, coleccion);
          
          if (librosColeccion.length >= 1) {
            const consolidados = librosColeccion.map(l => {
              const { _duplicadoDe, ...limpio } = registrarOConsolidar(indiceGlobal, l);
              return { limpio: aplicarOverrides(limpio), reutilizado: Boolean(_duplicadoDe) };
            });
            libros.push(...consolidados.map(c => c.limpio));
            const reutilizados = consolidados.filter(c => c.reutilizado).length;
            console.log(`      🗂️ ${coleccion.coleccion}: ${consolidados.length} libros desglosados` + (reutilizados ? ` (${reutilizados} compartían id)` : ''));
} else {
            // Degradación segura (§4.1): el patrón no matcheó → ruta original
            console.log(`      ⚠️ Sin desglose para "${coleccion.coleccion}" (patrón ${coleccion.patron}) — ruta original`);
            const datos = await obtenerDatosLibro(page, url);
            if (datos.titulo) {
              const { _duplicadoDe, ...libro } = registrarOConsolidar(indiceGlobal, {
                titulo: datos.titulo,
                linkPdf: datos.linkPdf,
                imagenPortada: datos.imagenPortada,
                autor: datos.autor,
                anio: datos.anio
              });
              libros.push(aplicarOverrides(libro));
              if (_duplicadoDe) console.log(`      🔗 Combinado: ${_duplicadoDe.id} (ya estaba en ${_duplicadoDe.categoria})`);
              else console.log(`      ✅ ${datos.titulo.substring(0, 50)}...`);
            } else {
              console.log(`      ⚠️ Sin título (verificar URL)`);
            }
          }
        } else {
          const datos = await obtenerDatosLibro(page, url);
          
          if (datos.titulo) {
            const { _duplicadoDe, ...libro } = registrarOConsolidar(indiceGlobal, {
              titulo: datos.titulo,
              linkPdf: datos.linkPdf,
              imagenPortada: datos.imagenPortada,
              autor: datos.autor,
              anio: datos.anio
            });
            libros.push(aplicarOverrides(libro));
            if (_duplicadoDe) console.log(`      🔗 Combinado: ${_duplicadoDe.id} (ya estaba en ${_duplicadoDe.categoria})`);
            else console.log(`      ✅ ${datos.titulo.substring(0, 50)}...`);
          } else {
            console.log(`      ⚠️ Sin título (verificar URL)`);
          }
          
          // Detector de posibles colecciones no catalogadas (PLANV2 §8): la página ya
          // quedó navegada por obtenerDatosLibro → solo cuenta, sin goto extra.
          const sospecha = await page.evaluate(() => {
            const pdfs = document.querySelectorAll('a[href*=".pdf"]').length;
            const imgs = new Set([...document.querySelectorAll('img')]
              .map(i => i.src || '')
              .filter(s => s.includes('uploads') && s && !/logo-azara|banner-azara/.test(s) && !s.endsWith('.svg'))).size;
            const h4ConImg = [...document.querySelectorAll('h4')]
              .filter(h => h.querySelector('img[src*="uploads"]')).length;
            return { pdfs, imgs, h4ConImg };
          });
          if (sospecha.pdfs > 1 || sospecha.imgs > 1 || sospecha.h4ConImg > 1) {
            console.log(`      🚩 POSIBLE COLECCIÓN NO CATALOGADA → ${url} (pdfs:${sospecha.pdfs}, imgs:${sospecha.imgs}, h4+img:${sospecha.h4ConImg})`);
          }
        }
      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
      }
      
      // Guardado incremental cada N libros
      if ((i + 1) % GUARDAR_CADA === 0 && i > desde) {
        fs.writeFileSync(rutaTemp, JSON.stringify(libros, null, 2));
        console.log(`      💾 Progreso guardado (${libros.length} libros)`);
      }
      
      await esperar(800);
    }
    
    console.log(`   📊 Total extraídos: ${libros.length}`);
    
    // Guardar archivo final y limpiar temp
    fs.writeFileSync(rutaFinal, JSON.stringify(libros, null, 2));
    if (fs.existsSync(rutaTemp)) {
      fs.unlinkSync(rutaTemp);
    }
    
    return { ...categoria, libros };
    
  } finally {
    await page.close();
  }
}

/**
 * Función principal
 */
async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📚 Scraper Playwright - Fundación Azara');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Filtrar categorías
  const categoriasParaScrapear = CATEGORIA_SELECTED === 'TODAS' 
    ? CATEGORIAS 
    : CATEGORIAS.filter(c => c.slug === CATEGORIA_SELECTED);
  
  if (categoriasParaScrapear.length === 0) {
    console.error(`❌ Categoría '${CATEGORIA_SELECTED}' no encontrada.`);
    process.exit(1);
  }
  
  if (CATEGORIA_SELECTED !== 'TODAS') {
    console.log(`🎯 Scraping: ${CATEGORIA_SELECTED}\n`);
  }
  
  // Iniciar navegador
  const browser = await chromium.launch({ headless: true });
  
  try {
    for (const categoria of categoriasParaScrapear) {
      await scrapearCategoria(browser, categoria);
      console.log(`   💾 Guardado en: libros-${categoria.slug}.json`);
      await esperar(2000);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Scraping completado!');
    console.log('═══════════════════════════════════════════════════════════');
    
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = {
  CATEGORIAS,
  COLECCIONES_CONOCIDAS,
  obtenerUrlsLibros,
  obtenerDatosLibro,
  obtenerDatosColeccion,
  extraerParesH4Pdf,
  extraerContenedorPorLibro,
  extraerDivTitulosCarrousel,
  extraerImagenesSueltas,
  extraerPdfsRomanos,
  limpiarUrlPdf,
  limpiarInformacionAutor,
  normalizarTexto,
  parsearAutorAnio,
  tituloDesdeFilename
};