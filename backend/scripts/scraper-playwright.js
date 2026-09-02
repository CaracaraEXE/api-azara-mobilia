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
    const match = infoRaw.match(/^(.+),\s*(\d{4})/);
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
        titulo = texto;
      }
    }
  }
  
  // --- PDF ---
  const linkPdf = await page.$eval('a[href$=".pdf"]', el => el.href).catch(() => null);
  
  // --- Imagen de portada (excluir logo/banner/svg) ---
  const imagenPortada = await page.$$eval('img', imgs => {
    for (const img of imgs) {
      const src = img.src || '';
      if (!src.includes('logo') && !src.includes('banner') && !src.endsWith('.svg')) {
        return src;
      }
    }
    return null;
  });
  
  return { titulo, autor, anio, linkPdf, imagenPortada };
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
    
    // Extraer datos de cada libro
    for (let i = desde; i < urlsLibros.length; i++) {
      const url = urlsLibros[i];
      console.log(`   📖 [${i + 1}/${urlsLibros.length}]`);
      
      try {
        const datos = await obtenerDatosLibro(page, url);
        
        if (datos.titulo) {
          libros.push({
            id: generarId(),
            titulo: datos.titulo,
            linkPdf: datos.linkPdf,
            imagenPortada: datos.imagenPortada,
            autor: datos.autor,
            anio: datos.anio,
            fechaExtraccion: new Date().toISOString()
          });
          console.log(`      ✅ ${datos.titulo.substring(0, 50)}...`);
        } else {
          console.log(`      ⚠️ Sin título (verificar URL)`);
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

run().catch(console.error);