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
    description: 'Buscar en el catálogo de la Fundación Azara (título, autor o titulares)',
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
    name: 'ficha',
    description: 'Ver el detalle de un ítem del catálogo por su ID',
    options: [
      {
        type: 3, // STRING
        name: 'id',
        description: 'ID del ítem (ej: lib-abc123)',
        required: true
      }
    ]
  },
  {
    name: 'catalogo',
    description: 'Explorar el catálogo por sección y categoría'
  }
];

async function registrarComandos() {
  const url = `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/commands`;

  console.log('📡 Registrando comandos slash en Discord (overwrite global)...\n');

  // PUT = OVERWRITE de todos los comandos GLOBALES (reemplaza el set completo).
  // Así el rename /libro → /ficha elimina el comando viejo automáticamente (si se
  // usara POST uno por uno, /libro quedaría zombi en Discord).
  try {
    const respuesta = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(comandos)
    });

    if (respuesta.ok) {
      const data = await respuesta.json();
      for (const c of data) {
        console.log(`   ✅ /${c.name} — ${c.description}`);
      }
    } else {
      const error = await respuesta.text();
      console.log(`   ❌ Error ${respuesta.status}: ${error}`);
    }
  } catch (error) {
    console.log(`   ❌ Error de red: ${error.message}`);
  }

  console.log('\n✅ Registro completado.');
  console.log('💡 El overwrite elimina los comandos viejos (p.ej. /libro). Puede tardar unos minutos en aparecer en Discord.');
}

registrarComandos();
