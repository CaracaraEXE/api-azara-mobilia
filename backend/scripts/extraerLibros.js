/**
 * Script para extraer datos de libros desde páginas individuales
 * 
 * Recibe un array de URLs y extrae: título, autor, año, PDF, imagen
 * 
 * Uso: node scripts/extraerLibros.js
 */

// URLs de prueba (Paleontología)
const URLs_PALEONTOLOGIA = [
  "https://fundacionazara.org.ar/arqueologia-y-paleontologia-de-la-provincia-de-catamarca/",
  "https://fundacionazara.org.ar/bestiario-fosil-mamiferos-del-pleistoceno-de-la-argentina/",
  "https://fundacionazara.org.ar/dinosaurios-de-entre-rios/",
  "https://fundacionazara.org.ar/dinosaurios-y-pterosaurios-de-america-del-sur/",
  "https://fundacionazara.org.ar/el-origen-de-los-mamiferos/",
  "https://fundacionazara.org.ar/el-uruguay-de-los-dinosaurios/",
  "https://fundacionazara.org.ar/historia-de-las-tecnicas-paleontologicas-y-su-desarrollo-en-la-argentina/",
  "https://fundacionazara.org.ar/historia-natural-de-los-gliptodontes/",
  "https://fundacionazara.org.ar/los-fosiles-de-mar-del-plata/",
  "https://fundacionazara.org.ar/los-invertebrados-fosiles/",
  "https://fundacionazara.org.ar/los-que-sobrevivieron-a-los-dinosaurios/",
  "https://fundacionazara.org.ar/protomamiferos-y-mamiferos-mesozoicos-de-america-del-sur/",
  "https://fundacionazara.org.ar/sistematica-y-filogenia-de-las-aves-fororracoideas/",
  "https://fundacionazara.org.ar/tetrapodos-plantas-y-paleoambientes-del-triasico-continental-de-la-argentina-y-brasil/",
  "https://fundacionazara.org.ar/trabajos-de-las-primeras-jornadas-paleontologicas-chapadmalenses-chapadmalal-en-la-vision-de-florentino-ameghino/",
  "https://fundacionazara.org.ar/trabajos-de-las-segundas-jornadas-paleontologicas-chapadmalenses-2/",
  "https://fundacionazara.org.ar/tras-las-huellas-del-megaterio-plantas-y-animales-que-la-ultima-extincion-olvido/",
  "https://fundacionazara.org.ar/una-historia-de-la-peninsula-de-valdes/"
];

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Headers completos para simular navegador
const HEADERS = {
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
};

// Esperar entre requests
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Generar ID único
function generarId() {
  return 'lib-' + Math.random().toString(36).substring(2, 10);
}

/**
 * Extraer datos de UNA página individual
 */
async function extraerDatos(url) {
  try {
    const { data, status } = await axios.get(url, { headers: HEADERS });
    
    console.log(`   📄 Status: ${status}`);
    
    const $ = cheerio.load(data);
    
    // Extraer PDF
    const pdfLink = $('a[href$=".pdf"]').attr('href') || null;
    
    // Extraer título
    const titulo = $('h4').first().text().trim() || null;
    
    // Extraer autor y año
    let autor = null;
    let anio = null;
    
    $('h4').each((i, el) => {
      const siguiente = $(el).next('p');
      if (siguiente.length) {
        const infoRaw = siguiente.text().trim();
        const match = infoRaw.match(/^(.+),\s*(\d{4})/);
        if (match) {
          autor = match[1].trim();
          anio = parseInt(match[2]);
        }
      }
    });
    
    // Extraer imagen de portada
    let imagenPortada = null;
    $('img').each((i, el) => {
      const src = $(el).attr('src') || '';
      if (!src.includes('logo') && !src.includes('banner') && !src.endsWith('.svg')) {
        imagenPortada = src;
        return false;
      }
    });
    
    return {
      id: generarId(),
      titulo,
      autor,
      anio,
      pdfLink,
      imagenPortada,
      descripcion: null,
      paginas: null,
      fechaExtraccion: new Date().toISOString()
    };
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status || error.message}`);
    return null;
  }
}

/**
 * Función principal
 */
async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📚 Extrayendo datos de páginas individuales');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`📋 URLs a procesar: ${URLs_PALEONTOLOGIA.length}\n`);
  
  const libros = [];
  
  for (let i = 0; i < URLs_PALEONTOLOGIA.length; i++) {
    const url = URLs_PALEONTOLOGIA[i];
    console.log(`[${i + 1}/${URLs_PALEONTOLOGIA.length}] ${url}`);
    
    const datos = await extraerDatos(url);
    
    if (datos) {
      libros.push(datos);
      console.log(`   ✅ ${datos.titulo?.substring(0, 50) || 'Sin título'}...`);
      if (datos.autor) console.log(`      Autor: ${datos.autor}, Año: ${datos.anio}`);
      if (datos.pdfLink) console.log(`      PDF: ✅`);
      else console.log(`      PDF: ❌`);
    } else {
      console.log(`   ⚠️ Sin datos`);
    }
    
    await delay(1000);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`✅ Extraídos: ${libros.length}/${URLs_PALEONTOLOGIA.length}`);
  console.log('═══════════════════════════════════════════════════════════');
  
  // Guardar resultado
  if (libros.length > 0) {
    const outputPath = path.join(__dirname, '../src/data/libros-paleontologia.json');
    fs.writeFileSync(outputPath, JSON.stringify(libros, null, 2));
    console.log(`\n📁 Guardado en: ${outputPath}`);
    
    // Mostrar resultado
    console.log('\n📖 Resultado:');
    console.log(JSON.stringify(libros, null, 2));
  }
}

run().catch(console.error);
