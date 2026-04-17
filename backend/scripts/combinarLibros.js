/**
 * Script para convertir el JSON de cada categoría al formato de libros.json
 * 
 * Instrucciones:
 * 1. Scrapea una categoría del navegador → guarda como JSON
 * 2. Renombrá el JSON a: libros-[categoria].json (ej: libros-paleontologia.json)
 * 3. Cambiar CATEGORIA abaixo para que coincida con el nombre del archivo
 * 4. Ejecutar: node scripts/combinarLibros.js
 */

const fs = require('fs');
const path = require('path');

// === CONFIGURACIÓN - Cambiar según la categoría ===
const CATEGORIA = {
  nombre: 'Institucionales',
  slug: 'institucionales',
  url: '/libros/',
  archivoJson: 'libros-institucionales.json'  // Sin la carpeta, solo el nombre del archivo
};
// =================================================

// Rutas
const DATA_DIR = path.join(__dirname, '../src/data');
const inputPath = path.join(DATA_DIR, CATEGORIA.archivoJson);
const outputPath = path.join(DATA_DIR, 'libros.json');

// Función para generar ID único
function generarId() {
  return 'lib-' + Math.random().toString(36).substring(2, 10);
}

// Función para convertir slug URL a título legible
function slugATitulo(slug) {
  return slug
    .replace(/^https?:\/\/fundacionazara\.org\.ar\/?/, '')
    .replace(/\/$/, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

// Función para eliminar duplicados
function eliminarDuplicados(array) {
  const seen = new Set();
  return array.filter(item => {
    if (seen.has(item.href)) {
      return false;
    }
    seen.add(item.href);
    return true;
  });
}

// Verificar que el archivo existe
if (!fs.existsSync(inputPath)) {
  console.error(`❌ Error: No se encontró el archivo ${inputPath}`);
  console.log('   Asegurate de que el archivo exista en src/data/');
  process.exit(1);
}

// Leer datos
console.log(`📚 Procesando: ${CATEGORIA.nombre}`);
console.log(`   Archivo: ${CATEGORIA.archivoJson}`);

const datosRaw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const librosUnicos = eliminarDuplicados(datosRaw);

console.log(`   Original: ${datosRaw.length} libros`);
console.log(`   Únicos: ${librosUnicos.length} libros`);

// Convertir al formato de libros.json
const libros = librosUnicos.map(item => ({
  id: generarId(),
  titulo: slugATitulo(item.href),
  linkPdf: item.href,
  imagenPortada: item.imagen,
  autor: null,
  anio: null,
  descripcion: null,
  paginas: null,
  fechaExtraccion: new Date().toISOString()
}));

// Cargar libros.json existente o crear nuevo
let librosExistente;
if (fs.existsSync(outputPath)) {
  librosExistente = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
} else {
  librosExistente = { categorias: [], ultimaActualizacion: null };
}

// Buscar si la categoría ya existe
const indexCategoria = librosExistente.categorias.findIndex(c => c.slug === CATEGORIA.slug);

if (indexCategoria >= 0) {
  // Reemplazar categoría existente
  librosExistente.categorias[indexCategoria] = {
    nombre: CATEGORIA.nombre,
    slug: CATEGORIA.slug,
    url: CATEGORIA.url,
    libros: libros
  };
  console.log(`   🔄 Categoría actualizada`);
} else {
  // Agregar nueva categoría
  librosExistente.categorias.push({
    nombre: CATEGORIA.nombre,
    slug: CATEGORIA.slug,
    url: CATEGORIA.url,
    libros: libros
  });
  console.log(`   ➕ Categoría agregada`);
}

// Actualizar fecha
librosExistente.ultimaActualizacion = new Date().toISOString();

// Guardar
fs.writeFileSync(outputPath, JSON.stringify(librosExistente, null, 2));

console.log(`\n✅ Guardado en: ${outputPath}`);
console.log(`📊 Total de categorías: ${librosExistente.categorias.length}`);

// Resumen
console.log('\n📋 Categorías en libros.json:');
librosExistente.categorias.forEach(cat => {
  console.log(`   - ${cat.nombre}: ${cat.libros.length} libros`);
});
