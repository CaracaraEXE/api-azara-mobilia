/**
 * Scraper con Playwright - Fundación Azara
 * 
 * Usa navegador real para evitar CloudFlare
 * 
 * Uso:
 *   node scripts/scraper-playwright.js                        (usa SCRAPEAR_CATEGORIA por defecto)
 *   node scripts/scraper-playwright.js --categoria=slug       (UNA categoría puntual de una sección por-categoría, ej. 'paleontologia'; SOLO secciones por-categoría = libros)
 *   node scripts/scraper-playwright.js --seccion=slug         (UNA sección completa: 'libros', 'recursos-educativos', 'periodico-exploracion-y-ciencia' o 'revista-azara')
 *   node scripts/scraper-playwright.js --todas                (todas las secciones: libros + recursos educativos + hemeroteca)
 *   --seccion y --categoria son mutuamente excluyentes; --todas es prioritario.
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

/**
 * Categorías de Recursos Educativos (PLANV3 §4): los 10 subgrupos del usuario (hoy
 * usuario, cada uno con su URL raíz de grilla. Son categorías planas, IGUAL que las
 * 13 de libros (crítica del usuario 2026-09-27: "RE tiene categorías propias igual
 * que libros") — lo que cambia con Libros es SOLO la persistencia (ver SECCIONES).
 * OJO: "Posters de Paleontología" es SINGULAR (/poster-de-paleontologia/), el plural da 404.
 */
const CATEGORIAS_RECURSOS = [
  { nombre: 'Cuadernillos', slug: 'cuadernillos', url: 'https://fundacionazara.org.ar/cuadernillos/' },
  { nombre: 'Posters de Geología', slug: 'posters-de-geologia', url: 'https://fundacionazara.org.ar/posters-de-geologia/' },
  { nombre: 'Posters de Paleontología', slug: 'poster-de-paleontologia', url: 'https://fundacionazara.org.ar/poster-de-paleontologia/' },
  { nombre: 'Posters de Ambiente', slug: 'posters-de-ambiente', url: 'https://fundacionazara.org.ar/posters-de-ambiente/' },
  { nombre: 'Posters de Biodiversidad', slug: 'posters-de-biodiversidad', url: 'https://fundacionazara.org.ar/posters-de-biodiversidad/' },
  { nombre: 'Posters de Antropología, Historia y Patrimonio', slug: 'posters-de-antropologia', url: 'https://fundacionazara.org.ar/posters-de-antropologia/' },
  { nombre: 'Cartillas', slug: 'cartillas', url: 'https://fundacionazara.org.ar/cartillas' },
  { nombre: 'Folletos de Biodiversidad', slug: 'folletos-de-biodiversidad', url: 'https://fundacionazara.org.ar/folletos-de-biodiversidad/' },
  { nombre: 'Folletos de Museos, Sitios Arqueológicos y Áreas Naturales Protegidas', slug: 'folletos-de-museos-sitios-arqueologicos-y-areas-naturales-protegidas', url: 'https://fundacionazara.org.ar/folletos-de-museos-sitios-arqueologicos-y-areas-naturales-protegidas/' },
  { nombre: 'Postales', slug: 'postales', url: 'https://fundacionazara.org.ar/postales' },
];

/**
 * SECCIONES unificadas (PLANV3 §5.1 rediseñado 2026-09-27): Libros y Recursos
 * educativos comparten la MISMA estructura — sección → categorías planas → grilla →
 * página individual — y se scrapean con EL MISMO flujo (scrapearSeccion) y EL MISMO
 * extractor (obtenerDatosItem). La diferencia entre secciones es declarativa:
 *   - prefijoArchivo: base de los nombres de archivo ('libros' → libros-*.json,
 *     'recursos' → recursos-*.json, 'periodico-exploracion-y-ciencia' → su carpeta).
 *   - archivoUnico: false (Libros) → 1 archivo por categoría; true (Recursos educativos
 *     y Hemeroteca) → 1 archivo por sección ({slug}.json, fix V3.6).
 * HEMEROTECA (PLANV3 V3.6, 2026-09-27): la ÚNICA excepción con extractores propios —
 * sus grillas son portfolio de Qode Bridge (article.mix en .projects_holder) y la
 * página individual NO trae h1/h4/portada fiables → obtenerUrlsPortafolio /
 * obtenerDatosPortafolio / extraerTitularesDeHtml (ver más abajo). El resto del
 * flujo (persistencia, dedup, temp) es el mismo archivo único de RE.
 */
const SECCIONES = [
  {
    tipo: 'libros',
    nombre: 'Libros',
    slug: 'libros',
    prefijoArchivo: 'libros',
    categorias: CATEGORIAS, // las 13 categorías de libros, igual que RE hardcodea las suyas
  },
  {
    tipo: 'recursos',
    nombre: 'Recursos educativos',
    slug: 'recursos-educativos',
    prefijoArchivo: 'recursos',
    archivoUnico: true, // 1 archivo recursos-educativos.json con coleccion = categoría
    categorias: CATEGORIAS_RECURSOS,
  },
  // Hemeroteca (PLANV3 V3.6, 2026-09-27): cada publicación periódica es una SECCIÓN
  // de primer nivel (NO una categoría intermedia — corrección del usuario). tipo
  // 'hemeroteca' (NO 'publicaciones': choca con las Publicaciones Científicas de la
  // Fundación, fuera de alcance — decisión del usuario 2026-09-27). archivoUnico con
  // slug === prefijoArchivo → el archivo final es {slug}.json (fix V3.6). La grilla
  // es portfolio de Qode Bridge (article.mix en .projects_holder) → extractores
  // DEDICADOS obtenerUrlsPortafolio/obtenerDatosPortafolio: es la ÚNICA excepción al
  // flujo unificado (libros/RE comparten extractores; la individual de hemeroteca no
  // tiene h1/h4/portada fiables — título y portada vienen de la grilla).
  {
    tipo: 'hemeroteca',
    nombre: 'Periódico Exploración y Ciencia',
    slug: 'periodico-exploracion-y-ciencia',
    prefijoArchivo: 'periodico-exploracion-y-ciencia',
    archivoUnico: true,
    categorias: [
      { nombre: 'Periódico Exploración y Ciencia', slug: 'periodico-exploracion-y-ciencia', url: 'https://fundacionazara.org.ar/periodico-exploracion-y-ciencia/' },
    ],
  },
  {
    tipo: 'hemeroteca',
    nombre: 'Revista Azara',
    slug: 'revista-azara',
    prefijoArchivo: 'revista-azara',
    archivoUnico: true,
    categorias: [
      { nombre: 'Revista Azara', slug: 'revista-azara', url: 'https://fundacionazara.org.ar/revista-azara/' },
    ],
  },
];

// Alias compat: RECURSOS_EDUCATIVOS era la sección de recursos.
const RECURSOS_EDUCATIVOS = SECCIONES[1];

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
  // PLANV3 §5.2: colección de Recursos Educativos (7 cuadernillos). Sus PDFs usan
  // www.fundacionazara.org.ar (host mezclado) → clavesDeLibro normaliza el host.
  { url: 'https://fundacionazara.org.ar/miradas-de-la-argentina/', patron: 'pares-h4-pdf', coleccion: 'Miradas de la Argentina' },
];

// === CONFIGURACIÓN ===
// Categoría por defecto (se puede sobreescribir con --categoria= o --todas)
const SCRAPEAR_CATEGORIA = 'auspiciados';
// ====================

// --- Parsear argumentos CLI ---
const args = process.argv.slice(2);
const ARG_TODAS = args.includes('--todas');
const ARG_SECCION = args.find(a => a.startsWith('--seccion='));
const ARG_CATEGORIA = args.find(a => a.startsWith('--categoria='));

// --todas es prioritario (compat con el uso histórico); --seccion y --categoria
// son mutuamente excluyentes: ambos piden un objetivo puntual DISTINTO.
if (ARG_TODAS && (ARG_SECCION || ARG_CATEGORIA)) {
  console.warn('⚠️ --todas gana: se ignora el objetivo puntual indicado.');
}
if (ARG_SECCION && ARG_CATEGORIA) {
  console.error('❌ No se pueden usar --seccion y --categoria juntos. Elegí uno.');
  process.exit(1);
}

// MODO: 'todas' | 'seccion' | 'categoria' — el objetivo explícito gana sobre el
// default histórico (SCRAPEAR_CATEGORIA = una categoría puntual).
const MODO = ARG_TODAS ? 'todas' : ARG_SECCION ? 'seccion' : 'categoria';
const OBJETIVO_SLUG = ARG_SECCION
  ? ARG_SECCION.split('=')[1]
  : ARG_CATEGORIA
    ? ARG_CATEGORIA.split('=')[1]
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
 * Extraer ediciones desde la grilla portfolio de hemeroteca (PLANV3 V3.6):
 * Qode Bridge arma los ítems como article.mix dentro de .projects_holder. Devuelve
 * objetos {url, titulo, portada} — la grilla es la FUENTE DE VERDAD del título y la
 * portada (la página individual NO trae h1/h4 fiables: la edición N14 de Revista
 * Azara no tiene h1).
 * Selectores verificados (N3 Periódico / N14 Revista Azara, 2026-09-27):
 *   - título `.portfolio_title a` POR CLASE (h6 en Periódico, h5 en Revista — NO por
 *     tag): trae espacio leading → .trim() obligatorio.
 *   - portada `.image_holder img` (con <span class='image'> intermedio; soporta
 *     lazy-load con data-src / data-lazy-src).
 *   - `a.portfolio_link_class` es un ancla VACÍA → el href del ítem sale de
 *     .portfolio_title a (fallback a[href*="portfolio_page"]).
 * Nota capitalización: Revista Azara N12-N14 viene en MAYÚSCULAS + EN DASH (U+2013) —
 * se guarda tal cual (fidelidad a la grilla); la búsqueda es case-insensitive.
 */
async function obtenerUrlsPortafolio(page, urlCategoria) {
  console.log('   🔍 Obteniendo lista de ediciones (grilla portfolio)...');

  await page.goto(urlCategoria, { waitUntil: 'networkidle' });
  await esperar(1000);

  const items = await page.$$eval('.projects_holder article.mix', arts =>
    arts.map(a => {
      const t = a.querySelector('.portfolio_title a');
      let img = '';
      for (const im of a.querySelectorAll('img')) {
        const src = im.src || im.getAttribute('data-src') || im.getAttribute('data-lazy-src') || '';
        if (src && !/logo-azara|banner-azara/.test(src) && !src.endsWith('.svg')) { img = src; break; }
      }
      return {
        url: (t && t.href) || (a.querySelector('a[href*="portfolio_page"]') || {}).href || '',
        titulo: t ? t.textContent.replace(/\s+/g, ' ').trim() : '',
        portada: img
      };
    }).filter(p => p.url && p.titulo)
  );

  const unicos = items.filter((p, i, arr) => arr.findIndex(x => x.url === p.url) === i);
  console.log(`   ✅ Encontradas ${unicos.length} ediciones`);
  return unicos;
}

/**
 * Extraer datos de una página individual — extractor ÚNICO para libros Y recursos
 * educativos (PLANV3 §5.2 unificado): el sitio usa el mismo theme para ambos tipos,
 * solo cambia qué nodo trae el título. La cascada lo resuelve SIN ramas por sección:
 *
 * Título (cascada): <h4> (libros, fiable al 99%) → JSON-LD headline (Yoast, limpio) →
 * og:title → document.title → fallback primer <p> sustancial.
 *   - Las páginas de RE NO tienen <h4> de título (está oculto/contaminado con la fecha,
 *     p.ej. "24 Nov Miradas...") → caen naturalmente a la cascada SEO.
 *   - og:title y document.title traen sufijo "- Fundación Azara" → se limpia.
 *   - El <h2 class="entry_title"> NUNCA se usa: viene oculto por CSS y con la fecha.
 *
 * Autor/año: si el título salió del <h4>, se intenta "h4 + p" con formato "Autor, Año"
 * (convención de libros). Si salió de la cascada SEO (RE), el año es la fecha de
 * publicación del post (article:published_time) — dato base, la cura manda.
 */
async function obtenerDatosItem(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await esperar(500);

  // --- Título (cascada) ---
  let titulo = await page.$eval('h4', el => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
  const esH4 = Boolean(titulo);

  if (!titulo) {
    titulo = await page.evaluate(() => {
      // 1) JSON-LD (Yoast): primer nodo con "headline" = título del post
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const data = JSON.parse(s.textContent);
          const nodos = data && data['@graph'] ? data['@graph'] : (Array.isArray(data) ? data : [data]);
          for (const n of nodos) {
            if (n && typeof n.headline === 'string' && n.headline.trim()) return n.headline.trim();
          }
        } catch { /* script JSON inválido → probar el siguiente */ }
      }
      // 2) og:title
      const og = document.querySelector('meta[property="og:title"]');
      if (og && og.getAttribute('content')) return og.getAttribute('content').trim();
      // 3) document.title
      return document.title.trim();
    }).catch(() => null);

    if (titulo) {
      // Quitar sufijo del sitio ("Título - Fundación Azara") y colapsar espacios
      titulo = titulo
        .replace(/\s*-\s*Fundaci[oó]n Azara\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // --- Autor y año ---
  let autor = null;
  let anio = null;

  if (esH4) {
    // Convención de libros: "h4 + p" con "Autor, Año" (fix B5: limpiar "Editorial X |")
    const infoRaw = await page.$eval('h4 + p', el => el.textContent.trim()).catch(() => '');
    if (infoRaw) {
      const match = limpiarInformacionAutor(infoRaw).match(/^(.+?),\s*(\d{4})/);
      if (match) {
        autor = match[1].trim();
        anio = parseInt(match[2]);
      }
    }
  } else {
    // Recursos educativos: año = fecha de publicación del post (dato base)
    anio = await page.$eval(
      'meta[property="article:published_time"]',
      el => { const m = (el.getAttribute('content') || '').match(/^(\d{4})/); return m ? parseInt(m[1], 10) : null; }
    ).catch(() => null);
  }

  // --- Fallback si no hay <h4> ni cabecera SEO (páginas con estructura diferente) ---
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
        // Fix B5: si trae prefijo "Editorial X | ", separarlo del título
        titulo = limpiarInformacionAutor(texto);
      }
    }
  }

  // --- PDF ---
  // Fix C11 (PLANV2): el sitio a veces renderiza href="...pdf&#039;" (apóstrofo literal).
  // a[href$=".pdf"] NO matchea ese caso → usar a[href*=".pdf"] y limpiar el apóstrofo final.
  // Scoping a <article> (los hrefs del header/footer no contaminan) con fallback global
  // por si alguna página vieja no envuelve el contenido en <article>.
  const linkPdfRaw = await page.$eval('article a[href*=".pdf"]', el => el.href)
    .catch(() => page.$eval('a[href*=".pdf"]', el => el.href))
    .catch(() => null);
  const linkPdf = linkPdfRaw ? limpiarUrlPdf(linkPdfRaw) : null;

  // --- Imagen de portada (excluir logo/banner/svg) ---
  // GOTCHA (2026-09-16): el viejo filtro `!src.includes('logo')` excluía portadas
  // cuyo filename contiene "logo" como subcadena ("zooLOGO", "bioLOGO") → Arnaldo
  // Winkelried Bertoni (primer zoologo) y Aventuras de un biólogo quedaban sin
  // portada. El logo del sitio es SIEMPRE "logo-azara-*" y el banner "banner-azara-*".
  // Fallback: og:image si el loop de <img> no encontró nada.
  let imagenPortada = await page.$$eval('img', imgs => {
    for (const img of imgs) {
      const src = img.src || img.getAttribute('data-src') || '';
      if (src && !/logo-azara|banner-azara/.test(src) && !src.endsWith('.svg')) {
        return src;
      }
    }
    return null;
  }).catch(() => null);

  if (!imagenPortada) {
    imagenPortada = await page.$eval('meta[property="og:image"]', el => (el.getAttribute('content') || '').trim()).catch(() => '') || null;
  }

  return { titulo, autor, anio, linkPdf, imagenPortada };
}

// Alias compat: obtenerDatosLibro era el extractor de páginas individuales (libros).
const obtenerDatosLibro = obtenerDatosItem;

/**
 * Extraer titulares desde el HTML del contenedor de texto-editor de una edición de
 * hemeroteca — función PURA exportada (testeable con fixture real, PLANV3 V3.6).
 * Header "<p><strong>Contenido</strong></p>" se descarta. Los titulares se separan
 * por <br> Y por <p> (verificado): Periódico usa UN solo <p> con titulares separados
 * por <br>; Revista Azara es MIXTA — ediciones modernas (N14, 2025) usan 1 <p> POR
 * titular (el bullet "•" vive dentro de <span lang="ES-MX">, salvo el primer titular
 * que trae el "•" crudo), ediciones viejas (N1, 2013) usan UN solo <p> con <br> como
 * el Periódico (verificado 2026-09-27 contra N14 y N1). Se quita el bullet inicial
 * "•" — se guarda SIN bullet (dato puro; el bot pinta el "• " al renderizar, decisión
 * V3.6) — y se limpian tags/entidades/espacios (usa textContent-equivalente tras
 * quitar tags: el "•" puede estar crudo o en <span lang="ES-MX">, algunos titulares
 * tienen <i>/<em>).
 */
function extraerTitularesDeHtml(html) {
  if (!html) return [];
  const limpiar = t => t
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&ndash;|&mdash;/gi, '–')
    .replace(/\s+/g, ' ')
    .trim();
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .split('\n')
    .map(limpiar)
    .map(t => t.replace(/^[•·∙]\s*/, '').trim())
    .filter(t => t && !/^contenido$/i.test(t));
}

/**
 * Extraer datos de UNA edición de hemeroteca desde su página individual
 * (PLANV3 V3.6): el título y la portada vienen de la GRULLA (contextoDeGrilla = el
 * objeto {url, titulo, portada} de obtenerUrlsPortafolio) — la individual solo
 * aporta PDF de la edición + titulares + año.
 * PDF: botón qodef "Descargar archivo" (a.qodef-qi-button[href$=".pdf"]) dentro de
 * .elementor-widget-qi_addons_for_elementor_button — exactamente 1 por edición
 * (verificado N3 y N14). Guard: la grilla de Revista Azara tiene un PDF de "Normas
 * para autores" (en la grilla, con botón propio) → excluir hrefs/textos que
 * matcheen /norma|autores/i; si quedara >1 → linkPdf: null + revisionPendiente
 * (cortafuegos humano). Titulares vía extraerTitularesDeHtml sobre el contenedor
 * con header "Contenido". Año = regex \((\d{4})\) del título de la grilla.
 * NO lleva `coleccion` (decisión V3.6): la única categoría YA es la publicación.
 */
async function obtenerDatosPortafolio(page, url, { titulo, portada }) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await esperar(500);

  // --- PDF de la edición (botón qodef, 1 solo) ---
  const botones = await page.$$eval('a.qodef-qi-button[href$=".pdf"]', as =>
    as.map(a => ({ href: a.href || '', texto: (a.textContent || '').trim() }))
  ).catch(() => []);
  const candidatos = botones.filter(b => !/norma|autores/i.test(b.href + ' ' + b.texto));
  const linkPdf = candidatos.length === 1 ? limpiarUrlPdf(candidatos[0].href) : null;
  const revisionPendiente = candidatos.length !== 1;

  // --- Titulares: contenedor text-editor con header "Contenido" ---
  const htmlTitulares = await page.evaluate(() => {
    for (const cont of document.querySelectorAll('.elementor-widget-text-editor .elementor-widget-container')) {
      if (/<strong>\s*Contenido\s*<\/strong>/i.test(cont.innerHTML)) return cont.innerHTML;
    }
    return null;
  }).catch(() => null);
  const titulares = extraerTitularesDeHtml(htmlTitulares);

  // --- Año desde el título de la grilla ("Número 3 (2014)" / "NÚMERO 14 (2025)") ---
  const m = String(titulo || '').match(/\((\d{4})\)/);
  const anio = m ? parseInt(m[1], 10) : null;

  const item = {
    titulo: (titulo || '').trim(),
    linkPdf,
    imagenPortada: portada || null,
    autor: null,
    anio,
    titulares,
  };
  if (revisionPendiente) item.revisionPendiente = true;
  return item;
}

// ============================================================
// FIXES Y HELPERS (PLANV2.md §4.2, §10)
// ============================================================

/** Fix C11: quitar apóstrofo/espacios residuales del href (ej: "...pdf&#039;" → "...pdf") */
function limpiarUrlPdf(href) {
  return (href || '').trim().replace(/'+$/, '').trim();
}

/**
 * Normalizar URL para CLAVES de dedup (PLANV3 §5.2): el sitio mezcla hosts — los
 * PDFs de Recursos Educativos usan www.fundacionazara.org.ar, el resto no. Para que
 * el MISMO ítem dedupice entre re-scrapes/archivos, la clave ignora www. y el slash final.
 * NO se usa para almacenar: el linkPdf guardado conserva la URL real.
 */
function normalizarHostUrl(url) {
  return (url || '').trim().replace(/^https?:\/\/www\./i, 'https://').replace(/\/+$/, '');
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
  if (linkPdf) claves.push('pdf:' + normalizarHostUrl(linkPdf));
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
    if (esImagenNoLibro(src)) return; // no es una lámina de tomo (ver IMAGENES_NO_LIBRO)
    // Tomo desde el numeral del filename (criterio de la fundación: guia-…-01 = Tomo 1,
    // Trazos-nativos-02.jpg = Tomo 2). GOTCHA ACTUALIZADO (2026-09-16): el DOM muestra las
    // láminas BARAJADAS (Guía: 02,03,04,05,01; Trazos: 06,07,08,02,base,03,disenos,04,05)
    // → la POSICIÓN (i+1) está mal. El gotcha viejo ("2019→07") queda cubierto porque el
    // patrón exige EXACTAMENTE 2 dígitos (un año de 4 dígitos no matchea → fallback posición).
    // Sin numeral: "Trazos-nativos.jpg" (base) → 1; resto sin numeral → posición (fallback).
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
 * Índice global de ítems ya registrados (PLANV2 §10 / PLANV3 §5.4): clave estable → entrada.
 * Incluye los archivos del prefijo indicado y el temp de la sección actual, para ids
 * estables entre re-scrapes y para que un ítem publicado en 2 categorías comparta UN id.
 *
 * prefijo: 'libros' → solo libros-*.json (las categorías de libros se deduplican entre
 * sí, PLANV2 §10). 'recursos' → SOLO recursos-*.json: un recurso NUNCA se consolida
 * contra un libro automáticamente (PLANV3 §6); si comparte linkPdf/portada con un libro,
 * validar-data lo reporta y la verificación/decisión es humana.
 */
function construirIndiceGlobal(librosActuales, categoriaSlug, prefijo = 'libros') {
  const indice = new Map();
  const indexar = (libro, categoria) => {
    for (const clave of clavesDeLibro(libro)) {
      indice.set(clave, { id: libro.id, libro, categoria });
    }
  };
  // FIX V3.6: aceptar también la base {prefijo}.json (hemeroteca: archivo único =
  // {slug}.json con slug === prefijoArchivo; antes `^prefijo-.+\.json$` no lo veía
  // y el re-scrape rompía el dedup "existente gana").
  const esDePrefijo = new RegExp(`^${prefijo}(-.+)?\\.json$`);
  const quitarPrefijo = new RegExp(`^${prefijo}-`);
  // Cada sección vive en su propia carpeta (src/data/libros/, src/data/recursos/):
  // el índice escanea SOLO la de la sección en curso.
  const dirSeccion = path.join(DATA_DIR, prefijo);
  if (fs.existsSync(dirSeccion)) {
    for (const f of fs.readdirSync(dirSeccion)) {
      if (!esDePrefijo.test(f)) continue;
      if (f.includes('.temp')) continue; // cualquier .temp (categoría o sección) se indexa vía los arrays en memoria
      try {
        const arr = JSON.parse(fs.readFileSync(path.join(dirSeccion, f), 'utf-8'));
        const cat = f.replace(quitarPrefijo, '').replace(/\.json$/, '');
        arr.forEach(l => indexar(l, cat));
      } catch { /* archivo ilegible: se ignora (el validar:data lo reporta) */ }
    }
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
 * Overrides de datos: decisiones humanas que se aplican SIEMPRE sobre la data extraída.
 * Con la política "el libro existente gana" (2026-09-16), los overrides de TÍTULO ya no
 * son necesarios (el humano edita el JSON y el re-scrape lo conserva) y son DAÑINOS
 * (pisaban los títulos curados a mano, p.ej. "Trazos nativos - Rostros para colorear").
 * Solo se mantienen decisiones sobre campos que el scrape trae mal y que no se corrigen
 * en la data: Mikrokosmos → PDF mal puesto en el sitio. Si la web lo corrige, se quita.
 */
const OVERRIDES = {
  'lib-fym7jqgi': { linkPdf: null }, // Mikrokosmos, Christofredo Jakob y el inicio de la neurociencia argentina
};

/**
 * Imágenes sueltas que NO representan un libro (decisión humana, verificada 2026-09-16
 * por el usuario con el ejemplar físico): en Trazos nativos, el archivo
 * "…-disenos-iconograficos-de-las-sierras-de-cordoba.jpg" es la portada/arte de la
 * colección COMPLETA — duplicado visual de la portada del Tomo 1 —, NO una lámina de tomo.
 * El scraper la tomaba como libro aparte (lib-srak0ssa). Se excluye del desglose.
 */
const IMAGENES_NO_LIBRO = [
  'trazos-nativos-disenos-iconograficos-de-sierras-cordoba.jpg',
  'trazos-nativos-disenos-iconograficos-de-las-sierras-de-cordoba.jpg',
];

/** ¿Esta imagen suelta representa un libro? (false → no crear libro) */
function esImagenNoLibro(src) {
  return IMAGENES_NO_LIBRO.includes(decodeURIComponent((src || '').split('/').pop()).toLowerCase());
}

/** Aplicar decisiones humanas sobre datos re-extraídos (se llama en cada registro) */
function aplicarOverrides(libro) {
  if (libro && OVERRIDES[libro.id]) {
    Object.assign(libro, OVERRIDES[libro.id]);
  }
  return libro;
}

/**
 * Reutilizar la entrada ya registrada (mismo id) o crear una nueva.
 * POLÍTICA (2026-09-16): si el libro YA existe, GANAN LOS DATOS EXISTENTES — el re-scrape
 * NO los pisa. Motivo: los datos pueden haber sido completados/curados a mano (títulos
 * madre, autores, años, quitar revisionPendiente) y el scrape debe ser idempotente
 * (no revertir trabajo humano). Se devuelve la entrada EXISTENTE —NO los datos nuevos—
 * para que el libro siga figurando en ESTA categoría sin perder su contenido (así se
 * preserva la multi-categoría: el mismo id aparece en cada categoría donde figura).
 * TRADEOFF aceptado: un cambio en el sitio sobre un libro ya registrado NO se captura
 * automáticamente (se corrige a mano o vía OVERRIDES). Los libros NUEVOS sí se registran.
 */
function registrarOConsolidar(indiceGlobal, datos) {
  const dup = buscarDuplicado(indiceGlobal, datos);
  if (dup) {
    return { ...dup.libro, id: dup.id, _duplicadoDe: { id: dup.id, categoria: dup.categoria } };
  }
  return aplicarOverrides({ id: generarId(), ...datos, fechaExtraccion: new Date().toISOString() });
}

/**
 * Scrapear UNA sección completa — MISMO flujo para libros y recursos educativos
 * (PLANV3 §5.3 unificado 2026-09-27): itera las categorías de la sección (13 de
 * libros, 10 de RE), desglosa colecciones catalogadas (COLECCIONES_CONOCIDAS) y
 * aplica dedup "existente gana" (registrarOConsolidar) contra un índice construido
 * SOLO con el prefijo de la sección (un recurso NUNCA se consolida contra un libro;
 * los parecidos los reporta validar-data — PLANV3 §6).
 *
 * Dos modos de persistencia, declarados en la sección:
 *  - archivoUnico: false (Libros) → 1 archivo {prefijo}-{categoria.slug}.json POR
 *    categoría, con progreso incremental por categoría (temp .temp.json + reanudación
 *    desde N ítems).
 *  - archivoUnico: true (Recursos educativos) → 1 archivo {prefijo}-{slug}.json para
 *    toda la sección; `coleccion` de cada ítem = nombre de su categoría; el temp
 *    guarda las categorías completadas + los ítems acumulados (al retomar salta las
 *    completadas y re-scrapea la categoría en curso — sus ítems se consolidan por id).
 */
async function scrapearSeccion(browser, seccion) {
  console.log(`\n📦 Scraping sección: ${seccion.nombre}`);
  
  const page = await browser.newPage();
  const prefijo = seccion.prefijoArchivo;
  // Cada sección vive en su propia carpeta (libros/, recursos/, y las de hemeroteca:
  // periodico-exploracion-y-ciencia/, revista-azara/); se crea al arrancar para que
  // la primera corrida no rompa el índice.
  const carpetaSeccion = path.join(DATA_DIR, prefijo);
  fs.mkdirSync(carpetaSeccion, { recursive: true });
  // FIX V3.6: el archivo único es {slug}.json — cuando slug === prefijoArchivo
  // (hemeroteca) NO duplicar el prefijo (evita 'revista-azara-revista-azara.json').
  // Recursos queda igual: slug 'recursos-educativos' → 'recursos-educativos.json'.
  const rutaFinal = seccion.archivoUnico
    ? path.join(carpetaSeccion, `${seccion.slug}.json`)
    : null;
  const rutaTemp = seccion.archivoUnico
    ? path.join(carpetaSeccion, `${seccion.slug}.temp.json`)
    : null;
  
  // Progreso previo (modo archivo único): categorías completadas + ítems acumulados
  let categoriasCompletadas = new Set();
  let items = [];
  if (seccion.archivoUnico && fs.existsSync(rutaTemp)) {
    try {
      const previo = JSON.parse(fs.readFileSync(rutaTemp, 'utf-8'));
      categoriasCompletadas = new Set(previo.categoriasCompletadas || []);
      items = Array.isArray(previo.items) ? previo.items : [];
      console.log(`   ♻️ Progreso anterior: ${items.length} ítems acumulados, ${categoriasCompletadas.size} categorías completadas`);
    } catch {
      console.log('   ⚠️ Archivo temporal corrupto, empezando de cero');
    }
  }
  
  try {
    for (const categoria of seccion.categorias) {
      const rutaCategoriaFinal = seccion.archivoUnico
        ? null
        : path.join(carpetaSeccion, `${prefijo}-${categoria.slug}.json`);
      const rutaCategoriaTemp = seccion.archivoUnico
        ? null
        : path.join(carpetaSeccion, `${prefijo}-${categoria.slug}.temp.json`);
      
      if (seccion.archivoUnico && categoriasCompletadas.has(categoria.nombre)) {
        console.log(`   ⏭️ ${categoria.nombre}: ya completada (se salta)`);
        continue;
      }
      console.log(`\n   🗂️ Categoría: ${categoria.nombre}`);
      
      // Modo por categoría (Libros): reanudar desde el progreso del temp de esa categoría
      let desde = 0;
      if (!seccion.archivoUnico && fs.existsSync(rutaCategoriaTemp)) {
        try {
          items = JSON.parse(fs.readFileSync(rutaCategoriaTemp, 'utf-8'));
          desde = items.length;
          console.log(`   ♻️ Progreso anterior de la categoría: ${desde} ítems ya scrapeados`);
        } catch {
          console.log('   ⚠️ Archivo temporal corrupto, empezando de cero');
          items = [];
        }
      }
      
      // Índice para dedup: SOLO los archivos del prefijo de esta sección (PLANV3 §6).
      // Libros: mismo libro en 2 categorías → UN solo id (PLANV2 §10).
      const indiceGlobal = construirIndiceGlobal(items, categoria.slug, prefijo);
      
      // Guardar temp de la sección (modo archivo único)
      const guardarTempSeccion = () => {
        fs.writeFileSync(rutaTemp, JSON.stringify({
          categoriasCompletadas: [...categoriasCompletadas],
          items
        }, null, 2));
      };
      
      const urls = seccion.tipo === 'hemeroteca'
        ? await obtenerUrlsPortafolio(page, categoria.url)
        : await obtenerUrlsLibros(page, categoria.url);
      if (urls.length === 0) {
        console.log('   ⚠️ No se encontraron ítems');
        if (seccion.archivoUnico) {
          categoriasCompletadas.add(categoria.nombre); // no re-golpear la web al retomar
          guardarTempSeccion();
        }
        continue;
      }
      
      // Registrar un ítem individual (dedup + overrides). En modo archivo único,
      // `coleccion` = categoría (la API agrupa por ?coleccion=).
      const registrarItem = (datos) => {
        if (!datos || !datos.titulo) {
          console.log('         ⚠️ Sin título (verificar URL)');
          return;
        }
        // FIX V3.6: la hemeroteca NO lleva `coleccion` (decisión del usuario) — la
        // única categoría YA es la publicación; en cambio SÍ lleva `categoria`
        // (con acentos, "Periódico Exploración y Ciencia") para que la API respete
        // libros[0].categoria y el nombre visible no sea el slug capitalizado.
        const contexto = seccion.tipo === 'hemeroteca'
          ? { ...datos, categoria: seccion.nombre }
          : (seccion.archivoUnico ? { ...datos, coleccion: categoria.nombre } : datos);
        const { _duplicadoDe, ...item } = registrarOConsolidar(indiceGlobal, contexto);
        items.push(aplicarOverrides(item));
        console.log(_duplicadoDe
          ? `         🔗 Reutilizado id ${_duplicadoDe.id} (${_duplicadoDe.categoria})`
          : `         ✅ ${datos.titulo.substring(0, 60)}...`);
      };
      
      // Procesar una URL: desglose de colección catalogada o página individual
      const procesarUrl = async (url) => {
        const urlReal = typeof url === 'string' ? url : url.url;
        // Hemeroteca (PLANV3 V3.6): la individual no tiene h1/h4 fiables — los datos
        // vienen de la grilla (objeto {url, titulo, portada} del loop). Sin detector
        // de "posible colección": la individual trae exactamente 1 PDF de edición.
        if (seccion.tipo === 'hemeroteca') {
          registrarItem(await obtenerDatosPortafolio(page, urlReal, url));
          return;
        }
        const coleccion = COLECCIONES_CONOCIDAS.find(c => c.url === urlReal);
        
        if (coleccion) {
          // Desglose de colección multi-ítem (PLANV2 §4 / PLANV3 §5.2):
          // esa URL representa varios libros/recursos.
          await page.goto(url, { waitUntil: 'networkidle' });
          await esperar(500);
          const itemsColeccion = await obtenerDatosColeccion(page, coleccion);
          
          if (itemsColeccion.length >= 1) {
            let reutilizados = 0;
            for (const item of itemsColeccion) {
              const { _duplicadoDe, ...limpio } = registrarOConsolidar(indiceGlobal, item);
              items.push(aplicarOverrides(limpio));
              if (_duplicadoDe) reutilizados++;
            }
            console.log(`         🗂️ ${coleccion.coleccion}: ${itemsColeccion.length} ítems desglosados` + (reutilizados ? ` (${reutilizados} compartían id)` : ''));
          } else {
            // Degradación segura: el patrón no matcheó → página individual
            console.log(`         ⚠️ Sin desglose para "${coleccion.coleccion}" (patrón ${coleccion.patron}) — ruta original`);
            registrarItem(await obtenerDatosItem(page, url));
          }
        } else {
          const datos = await obtenerDatosItem(page, url);
          registrarItem(datos);
          
          // Detector de posibles colecciones no catalogadas (PLANV2 §8): la página
          // ya quedó navegada por obtenerDatosItem → solo cuenta, sin goto extra.
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
            console.log(`         🚩 POSIBLE COLECCIÓN NO CATALOGADA → ${url} (pdfs:${sospecha.pdfs}, imgs:${sospecha.imgs}, h4+img:${sospecha.h4ConImg})`);
          }
        }
      };
      
      let procesados = desde;
      for (let i = desde; i < urls.length; i++) {
        const url = urls[i];
        procesados++;
        const nombreUrl = (typeof url === 'string' ? url : url.url).split('/').filter(Boolean).pop() || '';
        console.log(seccion.archivoUnico
          ? `      📄 [${i + 1}/${urls.length}] ${nombreUrl}`
          : `      📖 [${i + 1}/${urls.length}]`);
        
        try {
          await procesarUrl(url);
        } catch (error) {
          console.log(`      ❌ Error: ${error.message}`);
        }
        
        // Guardado incremental
        if (seccion.archivoUnico) {
          if (procesados % GUARDAR_CADA === 0) guardarTempSeccion();
        } else if (procesados % GUARDAR_CADA === 0 && i > desde) {
          fs.writeFileSync(rutaCategoriaTemp, JSON.stringify(items, null, 2));
          console.log(`      💾 Progreso guardado (${items.length} ítems)`);
        }
        
        await esperar(800);
      }
      
      // Cierre de categoría
      if (seccion.archivoUnico) {
        categoriasCompletadas.add(categoria.nombre);
        guardarTempSeccion();
        console.log(`      ✅ Categoría completada: ${categoria.nombre} — ${items.length} ítems acumulados`);
      } else {
        console.log(`   📊 Total extraídos en ${categoria.nombre}: ${items.length}`);
        fs.writeFileSync(rutaCategoriaFinal, JSON.stringify(items, null, 2));
        if (fs.existsSync(rutaCategoriaTemp)) fs.unlinkSync(rutaCategoriaTemp);
        console.log(`   💾 Guardado en: ${path.basename(rutaCategoriaFinal)}`);
        items = []; // reiniciar para la próxima categoría (modo por categoría)
      }
    }
    
    // Cierre de sección (modo archivo único)
    if (seccion.archivoUnico) {
      console.log(`   📊 Total en sección ${seccion.nombre}: ${items.length}`);
      fs.writeFileSync(rutaFinal, JSON.stringify(items, null, 2));
      if (fs.existsSync(rutaTemp)) fs.unlinkSync(rutaTemp);
      console.log(`   💾 Guardado en: ${path.basename(rutaFinal)}`);
    }
    
    return { ...seccion, items };
    
  } finally {
    await page.close();
  }
}

/**
 * Resolver el objetivo de scraping a partir del modo CLI (función pura, testeable).
 * - 'todas'     → todas las secciones.
 * - 'seccion'   → UNA sección completa por slug ('libros', 'recursos-educativos').
 * - 'categoria' → UNA categoría puntual, SOLO de secciones por-categoría (libros).
 *                 Si el slug pertenece a una sección de archivo único (RE), se avisa
 *                 que use --seccion (una categoría puntual ahí pisaría el archivo
 *                 final con datos parciales). Si no existe, error con catálogo.
 */
function resolverObjetivo(modo, slug) {
  if (modo === 'todas') {
    return { objetivo: SECCIONES, mensaje: `Todas las secciones (${SECCIONES.length})` };
  }
  if (modo === 'seccion') {
    const seccion = SECCIONES.find(s => s.slug === slug);
    if (!seccion) {
      return { error: `Sección '${slug}' no encontrada. Secciones disponibles: ${SECCIONES.map(s => s.slug).join(', ')}` };
    }
    return { objetivo: [seccion], mensaje: `Sección: ${seccion.nombre} (${seccion.categorias.length} categorías)` };
  }
  // modo 'categoria'
  for (const seccion of SECCIONES) {
    const categoria = seccion.categorias.find(c => c.slug === slug);
    if (categoria) {
      if (seccion.archivoUnico) {
        return { error: `'${slug}' es un subgrupo de la sección '${seccion.slug}', que se scrapea completa en un archivo único. Usá --seccion=${seccion.slug}.` };
      }
      return { objetivo: [{ ...seccion, categorias: [categoria] }], mensaje: `Categoría: ${categoria.nombre} (sección ${seccion.nombre})` };
    }
  }
  const catalogo = SECCIONES
    .filter(s => !s.archivoUnico)
    .flatMap(s => s.categorias.map(c => `${c.slug} (${s.slug})`));
  return { error: `Categoría '${slug}' no encontrada en secciones por-categoría. Opciones — secciones: ${SECCIONES.map(s => s.slug).join(', ')} | categorías: ${catalogo.join(', ')}` };
}

/**
 * Función principal. El objetivo se resuelve por MODO (--todas / --seccion /
 * --categoria) con fallback al default histórico SCRAPEAR_CATEGORIA.
 */
async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📚 Scraper Playwright - Fundación Azara');
  console.log('═══════════════════════════════════════════════════════════\n');

  const { objetivo, mensaje, error } = resolverObjetivo(MODO, OBJETIVO_SLUG);
  if (error) {
    console.error(`❌ ${error}`);
    process.exit(1);
  }
  console.log(`🎯 ${mensaje}\n`);
  
  // Iniciar navegador
  const browser = await chromium.launch({ headless: true });
  
  try {
    for (const seccion of objetivo) {
      await scrapearSeccion(browser, seccion);
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
  RECURSOS_EDUCATIVOS,
  SECCIONES,
  COLECCIONES_CONOCIDAS,
  obtenerUrlsLibros,
  obtenerUrlsPortafolio, // grilla portfolio de hemeroteca (PLANV3 V3.6)
  obtenerDatosItem,
  obtenerDatosLibro, // alias de obtenerDatosItem (compat con el nombre histórico)
  obtenerDatosPortafolio, // individual de edición de hemeroteca (PLANV3 V3.6)
  extraerTitularesDeHtml, // función pura (testeable con fixture)
  obtenerDatosColeccion,
  scrapearSeccion,
  resolverObjetivo,
  extraerParesH4Pdf,
  extraerContenedorPorLibro,
  extraerDivTitulosCarrousel,
  extraerImagenesSueltas,
  extraerPdfsRomanos,
  limpiarUrlPdf,
  limpiarInformacionAutor,
  normalizarHostUrl,
  normalizarTexto,
  parsearAutorAnio,
  tituloDesdeFilename
};