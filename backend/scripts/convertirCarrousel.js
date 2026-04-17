/**
 * Script para convertir el JSON del carrousel al formato de libros.json
 * 
 * Uso: node scripts/convertirCarrousel.js
 */

const fs = require('fs');
const path = require('path');

// Leer archivo del carrousel
const carrouselPath = path.join(__dirname, '../src/data/librocarrousel.json');
const carrouselData = JSON.parse(fs.readFileSync(carrouselPath, 'utf8'));

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

// Procesar datos
console.log('📚 Procesando datos del carrousel...\n');

const librosUnicos = eliminarDuplicados(carrouselData);
console.log(`   Original: ${carrouselData.length} libros`);
console.log(`   Únicos: ${librosUnicos.length} libros`);

// Convertir al formato de libros.json
const libros = librosUnicos.map(item => ({
  id: generarId(),
  titulo: slugATitulo(item.href),
  linkPdf: item.href,  // La URL de la página del libro (no PDF directo)
  imagenPortada: item.imagen,
  autor: null,
  anio: null,
  descripcion: null,
  paginas: null,
  fechaExtraccion: new Date().toISOString()
}));

// Armar estructura completa
const data = {
  categorias: [
    {
      nombre: 'Institucionales',
      slug: 'institucionales',
      url: '/libros/',
      libros: libros
    }
  ],
  ultimaActualizacion: new Date().toISOString()
};

// Guardar en libros.json
const outputPath = path.join(__dirname, '../src/data/libros.json');
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

console.log(`\n✅ Convertido y guardado en: ${outputPath}`);
console.log(`📊 Total de libros: ${libros.length}`);

// Mostrar primeros 3 como ejemplo
console.log('\n📖 Ejemplo de libros convertidos:');
libros.slice(0, 3).forEach(libro => {
  console.log(`   - ${libro.titulo}`);
});
