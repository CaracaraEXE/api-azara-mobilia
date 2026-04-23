/**
 * Scraper con Playwright - Fundación Azara
 * 
 * Usa navegador real para evitar CloudFlare
 * 
 * Uso: node scripts/scraper-playwright.js
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
  { nombre: 'Exploraciones, historia de la ciencia y biografías', slug: 'historia-de-la-ciencia', url: 'https://fundacionazara.org.ar/libros/libros-de-historia-de-la-ciencia/' },
  { nombre: 'Ambiente', slug: 'ambiente', url: 'https://fundacionazara.org.ar/libros-de-ambiente/' },
  { nombre: 'Antropología', slug: 'antropologia', url: 'https://fundacionazara.org.ar/libros/libros-de-antropologia/' },
  { nombre: 'Flora y Fauna', slug: 'flora-y-fauna', url: 'https://fundacionazara.org.ar/libros/libros-de-flora-y-fauna/' },
  { nombre: 'Áreas naturales', slug: 'areas-naturales', url: 'https://fundacionazara.org.ar/libros/libros-de-areas-naturales/' },
  { nombre: 'Historia y patrimonio cultural', slug: 'patrimonio-cultural', url: 'https://fundacionazara.org.ar/libros/libros-de-patrimonio-cultural/' },
  { nombre: 'Infantiles', slug: 'infantiles', url: 'https://fundacionazara.org.ar/libros/libros-infantiles/' },
  { nombre: 'Auspiciados', slug: 'auspiciados', url: 'https://fundacionazara.org.ar/libros/libros-auspiciados/' },
];

// === CONFIGURACIÓN ===
// Cambiar 'TODAS' por el slug de la categoría que querés scrapear
const SCRAPEAR_CATEGORIA = 'institucionales';
// ====================

const DATA_DIR = path.join(__dirname, '../src/data');

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
 */
async function obtenerDatosLibro(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await esperar(500);
  
  // Extraer título
  const titulo = await page.$eval('h4', el => el.textContent.trim()).catch(() => null);
  
  // Extraer autor y año
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
  
  // Extraer PDF
  const pdfLink = await page.$eval('a[href$=".pdf"]', el => el.href).catch(() => null);
  
  // Extraer imagen (que no sea logo/banner)
  const imagenPortada = await page.$$eval('img', imgs => {
    for (const img of imgs) {
      const src = img.src || '';
      if (!src.includes('logo') && !src.includes('banner') && !src.endsWith('.svg')) {
        return src;
      }
    }
    return null;
  });
  
  return { titulo, autor, anio, pdfLink, imagenPortada };
}

/**
 * Scrapear una categoría
 */
async function scrapearCategoria(browser, categoria) {
  console.log(`\n📚 Scraping: ${categoria.nombre}`);
  
  const page = await browser.newPage();
  
  try {
    // Obtener URLs
    const urlsLibros = await obtenerUrlsLibros(page, categoria.url);
    
    if (urlsLibros.length === 0) {
      console.log('   ⚠️ No se encontraron libros');
      return { ...categoria, libros: [] };
    }
    
    // Extraer datos de cada libro
    const libros = [];
    
    for (let i = 0; i < urlsLibros.length; i++) {
      const url = urlsLibros[i];
      console.log(`   📖 [${i + 1}/${urlsLibros.length}]`);
      
      try {
        const datos = await obtenerDatosLibro(page, url);
        
        if (datos.titulo) {
          libros.push({
            id: generarId(),
            titulo: datos.titulo,
            linkPdf: datos.pdfLink,
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
      
      await esperar(800);
    }
    
    console.log(`   📊 Total extraídos: ${libros.length}`);
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
  const categoriasParaScrapear = SCRAPEAR_CATEGORIA === 'TODAS' 
    ? CATEGORIAS 
    : CATEGORIAS.filter(c => c.slug === SCRAPEAR_CATEGORIA);
  
  if (categoriasParaScrapear.length === 0) {
    console.error(`❌ Categoría '${SCRAPEAR_CATEGORIA}' no encontrada.`);
    process.exit(1);
  }
  
  if (SCRAPEAR_CATEGORIA !== 'TODAS') {
    console.log(`🎯 Scraping: ${SCRAPEAR_CATEGORIA}\n`);
  }
  
  // Iniciar navegador
  const browser = await chromium.launch({ headless: true });
  
  try {
    for (const categoria of categoriasParaScrapear) {
      const resultado = await scrapearCategoria(browser, categoria);
      
      // Guardar en archivo
      const outputPath = path.join(DATA_DIR, `libros-${categoria.slug}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(resultado.libros, null, 2));
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