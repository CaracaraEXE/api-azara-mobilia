/**
 * Scraper para fundacionazara.org.ar
 * 
 * Extrae libros de las categorías y genera data/libros.json
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

// Esperar entre requests (evitar ser bloqueado)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Generar ID único
function generarId() {
  return 'lib-' + Math.random().toString(36).substring(2, 10);
}

async function scrapearCategoria(categoria) {
  console.log(`🔍 Scraperando: ${categoria.nombre}...`);
  
  try {
    const { data } = await axios.get(categoria.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(data);
    const libros = [];
    
    // TODO: Ajustar selectores según la estructura real del sitio
    // Selector ejemplo (hay que verificar en el sitio)
    $('.libro-item, .libro, article, .entry').each((i, el) => {
      const $el = $(el);
      
      // TODO: Ajustar estos selectores
      const titulo = $el.find('h2, h3, .titulo, .title').text().trim();
      const linkPdf = $el.find('a[href$=".pdf"], .download-pdf').attr('href') || null;
      const imagenPortada = $el.find('img').attr('src') || null;
      
      if (titulo) {
        libros.push({
          id: generarId(),
          titulo,
          linkPdf,
          imagenPortada,
          autor: null,
          anio: null,
          descripcion: null,
          paginas: null,
          fechaExtraccion: new Date().toISOString()
        });
      }
    });
    
    console.log(`   ✅ Encontrados ${libros.length} libros`);
    return { ...categoria, libros };
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { ...categoria, libros: [], error: error.message };
  }
}

async function run() {
  console.log('📚 Scraper de Fundación Azara\n');
  
  const resultados = [];
  
  for (const categoria of CATEGORIAS) {
    const resultado = await scrapearCategoria(categoria);
    resultados.push(resultado);
    await delay(1000); // 1 segundo entre requests
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
  
  // Guardar
  const outputPath = path.join(__dirname, '../src/data/libros.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  
  console.log('\n✅ Scraping completado!');
  console.log(`📁 Guardado en: ${outputPath}`);
  
  // Resumen
  const totalLibros = data.categorias.reduce((acc, cat) => acc + cat.libros.length, 0);
  console.log(`📊 Total de libros: ${totalLibros}`);
}

run();
