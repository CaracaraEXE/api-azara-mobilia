/**
 * Scraper para fundacionazara.org.ar
 * 
 * Extrae libros de TODAS las categorías haciendo scraping en 2 niveles:
 * 1. Página de categoría → obtiene URLs de libros individuales
 * 2. Página individual → extrae título, autor, año, PDF, imagen
 * 
 * Uso: npm run scrape
 */

const axios = require('axios');
const cheerio = require('cheerio');
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
// Ej: 'paleontologia', 'antropologia', 'institucionales'
// Poner 'TODAS' para hacer todas las categorías
const SCRAPEAR_CATEGORIA = 'institucionales';
// ====================

// Esperar entre requests (evitar ser bloqueado)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Generar ID único
function generarId() {
  return 'lib-' + Math.random().toString(36).substring(2, 10);
}

/**
 * Paso 1: Obtener URLs de libros desde la página de categoría
 * Selector: article .qodef-e-media-image a
 */
async function obtenerUrlsLibros(urlCategoria) {
  console.log('   🔍 Obteniendo lista de libros...');
  
  try {
    const { data } = await axios.get(urlCategoria, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      }
    });
    
    const $ = cheerio.load(data);
    const urls = [];
    
    // Buscar todos los links dentro de article .qodef-e-media-image
    $('article .qodef-e-media-image a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('fundacionazara.org.ar')) {
        urls.push(href);
      }
    });
    
    // Eliminar duplicados
    const urlsUnicas = [...new Set(urls)];
    console.log(`   ✅ Encontradas ${urlsUnicas.length} URLs de libros`);
    
    return urlsUnicas;
    
  } catch (error) {
    console.error(`   ❌ Error al obtener URLs: ${error.message}`);
    return [];
  }
}

/**
 * Paso 2: Extraer datos de una página individual de libro
 */
async function obtenerDatosLibro(urlLibro) {
  try {
    const { data } = await axios.get(urlLibro, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      }
    });
    
    const $ = cheerio.load(data);
    
    // Extraer PDF
    const pdfLink = $('a[href$=".pdf"]').attr('href') || null;
    
    // Extraer título
    const titulo = $('h4').first().text().trim() || null;
    
    // Extraer autor y año del <p> que viene después del h4
    let autor = null;
    let anio = null;
    
    $('h4').each((i, el) => {
      const siguiente = $(el).next('p');
      if (siguiente.length) {
        const infoRaw = siguiente.text().trim();
        // Formato esperado: "José H. Laza, 2019."
        const match = infoRaw.match(/^(.+),\s*(\d{4})/);
        if (match) {
          autor = match[1].trim();
          anio = parseInt(match[2]);
        }
      }
    });
    
    // Extraer imagen de portada (la que no sea logo, banner o svg)
    let imagenPortada = null;
    $('img').each((i, el) => {
      const src = $(el).attr('src') || '';
      if (!src.includes('logo') && !src.includes('banner') && !src.endsWith('.svg')) {
        imagenPortada = src;
        return false; // break del each
      }
    });
    
    // Si no encontramos título desde h4, intentar desde el title de la página
    if (!titulo) {
      const pageTitle = $('title').text().trim();
      // Limpiar el título de la página (ej: "Título del libro - Fundación Azara")
      const partes = pageTitle.split(' - ');
      if (partes.length > 0) {
        return partes[0].trim();
      }
    }
    
    return {
      titulo,
      autor,
      anio,
      pdfLink,
      imagenPortada
    };
    
  } catch (error) {
    console.error(`   ❌ Error al obtener datos del libro: ${error.message}`);
    return null;
  }
}

/**
 * Scrapear una categoría completa
 */
async function scrapearCategoria(categoria) {
  console.log(`\n📚 Scraping: ${categoria.nombre}`);
  
  // Paso 1: Obtener URLs de libros
  const urlsLibros = await obtenerUrlsLibros(categoria.url);
  
  if (urlsLibros.length === 0) {
    console.log(`   ⚠️ No se encontraron libros`);
    return { ...categoria, libros: [] };
  }
  
  // Paso 2: Visitar cada URL y extraer datos
  const libros = [];
  
  for (let i = 0; i < urlsLibros.length; i++) {
    const url = urlsLibros[i];
    console.log(`   📖 [${i + 1}/${urlsLibros.length}] ${url}`);
    
    const datos = await obtenerDatosLibro(url);
    
    if (datos && datos.titulo) {
      libros.push({
        id: generarId(),
        titulo: datos.titulo,
        linkPdf: datos.pdfLink,
        imagenPortada: datos.imagenPortada,
        autor: datos.autor,
        anio: datos.anio,
        descripcion: null,
        paginas: null,
        fechaExtraccion: new Date().toISOString()
      });
      console.log(`      ✅ ${datos.titulo.substring(0, 50)}...`);
    } else {
      console.log(`      ⚠️ No se pudieron extraer datos`);
    }
    
    // Esperar entre requests
    await delay(800);
  }
  
  console.log(`   📊 Total extraídos: ${libros.length}`);
  
  return { ...categoria, libros };
}

/**
 * Función principal
 */
async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📚 Scraper de Fundación Azara (2 niveles)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('Este scraper visita cada categoría y extrae datos de');
  console.log('cada libro individual (título, autor, año, PDF, imagen)');
  console.log('');
  
  // Filtrar categorías
  const categoriasParaScrapear = SCRAPEAR_CATEGORIA === 'TODAS' 
    ? CATEGORIAS 
    : CATEGORIAS.filter(c => c.slug === SCRAPEAR_CATEGORIA);
  
  if (categoriasParaScrapear.length === 0) {
    console.error(`❌ Categoría '${SCRAPEAR_CATEGORIA}' no encontrada.`);
    console.log('Categorías disponibles:');
    CATEGORIAS.forEach(c => console.log(`   - ${c.slug}`));
    process.exit(1);
  }
  
  if (SCRAPEAR_CATEGORIA !== 'TODAS') {
    console.log(`🎯 Scraping de categoría: ${SCRAPEAR_CATEGORIA}`);
    console.log('');
  }
  
  const resultados = [];
  
  // Recorrer cada categoría
  for (const categoria of categoriasParaScrapear) {
    const resultado = await scrapearCategoria(categoria);
    resultados.push(resultado);
    
    // Esperar entre categorías
    await delay(1500);
  }
  
  // Armar JSON final
  const data = {
    categorias: resultados.map(r => ({
      nombre: r.nombre,
      slug: r.slug,
      url: r.url,
      libros: r.libros
    })),
    ultimaActualizacion: new Date().toISOString()
  };
  
  // Guardar en archivo
  const outputPath = path.join(__dirname, '../src/data/libros.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Scraping completado!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📁 Archivo: ${outputPath}`);
  
  // Resumen por categoría
  console.log('\n📊 Resumen:');
  resultados.forEach(r => {
    const estado = r.libros.length > 0 ? '✅' : '⚠️';
    console.log(`   ${estado} ${r.nombre}: ${r.libros.length} libros`);
  });
  
  // Total
  const totalLibros = data.categorias.reduce((acc, cat) => acc + cat.libros.length, 0);
  console.log(`\n📚 Total de libros: ${totalLibros}`);
}

// Ejecutar
run().catch(console.error);
