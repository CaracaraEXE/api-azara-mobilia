/**
 * Registro de comandos slash en Discord
 * 
 * Este script se ejecuta UNA SOLA VEZ para registrar/actualizar
 * los comandos slash en tu aplicación de Discord.
 * 
 * Uso:
 *   DISCORD_TOKEN=xxx DISCORD_CLIENT_ID=yyy node src/register.js
 *   ó
 *   npm run register (con .env configurado)
 */

require('dotenv').config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('❌ Faltan variables de entorno:');
  console.error('   DISCORD_TOKEN    =', DISCORD_TOKEN ? '✓' : '✗');
  console.error('   DISCORD_CLIENT_ID =', DISCORD_CLIENT_ID ? '✓' : '✗');
  console.error('\nCreá un archivo .env en la carpeta discord-bot/ con:');
  console.error('   DISCORD_TOKEN=tu_token');
  console.error('   DISCORD_CLIENT_ID=tu_client_id');
  process.exit(1);
}

// Definición de comandos slash
const comandos = [
  {
    name: 'buscar',
    description: 'Buscar libros de la Fundación Azara por título',
    options: [
      {
        type: 3, // STRING
        name: 'termino',
        description: 'Término de búsqueda (ej: dinosaurio, paleontología, Darwin)',
        required: true
      }
    ]
  },
  {
    name: 'libro',
    description: 'Ver detalles de un libro específico por su ID',
    options: [
      {
        type: 3, // STRING
        name: 'id',
        description: 'ID del libro (ej: lib-abc123)',
        required: true
      }
    ]
  },
  {
    name: 'categorias',
    description: 'Listar todas las categorías de libros disponibles'
  }
];

async function registrarComandos() {
  const url = `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/commands`;

  console.log('📡 Registrando comandos slash en Discord...\n');

  for (const comando of comandos) {
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(comando)
      });

      if (respuesta.ok) {
        const data = await respuesta.json();
        console.log(`   ✅ /${comando.name} — ${comando.description}`);
      } else {
        const error = await respuesta.text();
        console.log(`   ❌ /${comando.name} — Error ${respuesta.status}: ${error}`);
      }
    } catch (error) {
      console.log(`   ❌ /${comando.name} — Error de red: ${error.message}`);
    }
  }

  console.log('\n✅ Registro completado.');
  console.log('💡 Recordá que los comandos pueden tardar unos minutos en aparecer en Discord.');
}

registrarComandos();
