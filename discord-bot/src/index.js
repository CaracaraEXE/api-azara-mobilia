/**
 * Bot de Discord — Frontend HTTP (Interactions Endpoint)
 * 
 * Servidor Express INDEPENDIENTE del backend.
 * Recibe POSTs de Discord, verifica firma, y consulta la API de datos.
 * 
 * Uso:
 *   npm run dev        (con NGROK: ngrok http 3001)
 *   npm start          (producción)
 * 
 * Endpoint:
 *   POST /interactions ← configurar en Discord Developer Portal
 */

require('dotenv').config();
const express = require('express');
const nacl = require('tweetnacl');

const app = express();
const PORT = process.env.PORT || 3001;
const API_URL = process.env.API_URL || 'http://localhost:3000';

// ──────────────────────────────────────────────
//  Tipos de interacción de Discord
// ──────────────────────────────────────────────
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
};

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
};

// ──────────────────────────────────────────────
//  Middleware: raw body + verificación de firma
// ──────────────────────────────────────────────

/**
 * Captura el body crudo y verifica la firma Ed25519 de Discord.
 * Si la firma es inválida, responde 401 y NO llama a next().
 */
function verifyDiscordRequest(req, res, next) {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey) {
    return res.status(401).json({ error: 'Faltan headers de firma o PUBLIC_KEY no configurada' });
  }

  // Capturar raw body
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    req.rawBody = rawBody;

    // Verificar firma
    const isValid = nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody),
      Buffer.from(signature, 'hex'),
      Buffer.from(publicKey, 'hex')
    );

    if (!isValid) {
      return res.status(401).json({ error: 'Firma inválida' });
    }

    // Parsear JSON del body
    try {
      req.interaction = JSON.parse(rawBody);
      next();
    } catch {
      return res.status(400).json({ error: 'JSON inválido' });
    }
  });
}

// ──────────────────────────────────────────────
//  POST /interactions  — Endpoint principal
// ──────────────────────────────────────────────

app.post('/interactions', verifyDiscordRequest, async (req, res) => {
  const interaction = req.interaction;

  try {
    // PING (type 1) — Discord verifica que el endpoint responde
    if (interaction.type === InteractionType.PING) {
      return res.json({ type: InteractionResponseType.PONG });
    }

    // Comando (type 2)
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const { name, options } = interaction.data;
      
      let response;

      switch (name) {
        case 'buscar':
          response = await comandoBuscar(options);
          break;
        case 'libro':
          response = await comandoLibro(options);
          break;
        case 'categorias':
          response = await comandoCategorias();
          break;
        default:
          response = { content: '❌ Comando no reconocido.' };
      }

      return res.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: response
      });
    }

    return res.status(400).json({ error: 'Tipo de interacción no soportado' });

  } catch (error) {
    console.error('❌ Error en interacción:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
//  Health check
// ──────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ 
    mensaje: '🤖 Discord Bot Azara funcionando',
    interacciones: 'POST /interactions'
  });
});

// ──────────────────────────────────────────────
//  Comandos
// ──────────────────────────────────────────────

/**
 * /buscar [termino] — Busca libros por título
 */
async function comandoBuscar(options) {
  const termino = options?.find(o => o.name === 'termino')?.value;

  if (!termino) {
    return { content: '❌ Necesitás especificar un término de búsqueda.' };
  }

  try {
    const respuesta = await fetch(`${API_URL}/api/libros?busqueda=${encodeURIComponent(termino)}&limite=5`);
    const datos = await respuesta.json();

    if (!datos.success || datos.data.length === 0) {
      return { content: `No encontré libros para "${termino}".` };
    }

    const fields = datos.data.map(libro => ({
      name: libro.titulo.substring(0, 256),
      value: libro.linkPdf
        ? `📁 ${libro.categoria}\n📄 [Descargar PDF](${libro.linkPdf})`
        : `📁 ${libro.categoria}\n❌ Sin PDF disponible`
    }));

    return {
      embeds: [{
        title: `🔍 Resultados para "${termino}"`,
        color: 0x00AE86,
        fields,
        footer: { text: `Mostrando ${datos.data.length} de ${datos.meta?.total || datos.data.length} resultados` }
      }]
    };
  } catch (error) {
    console.error('Error en búsqueda:', error);
    return { content: '❌ Error al conectar con la API.' };
  }
}

/**
 * /libro [id] — Muestra un libro específico
 */
async function comandoLibro(options) {
  const id = options?.find(o => o.name === 'id')?.value;

  if (!id) {
    return { content: '❌ Necesitás especificar un ID de libro.' };
  }

  try {
    const respuesta = await fetch(`${API_URL}/api/libros/${id}`);
    const datos = await respuesta.json();

    if (!datos.success) {
      return { content: `No encontré un libro con ID "${id}".` };
    }

    const libro = datos.data;

    const fields = [
      { name: '📁 Categoría', value: libro.categoria || 'Desconocida', inline: true },
      { name: '✍️ Autor', value: libro.autor || 'Desconocido', inline: true },
      { name: '📅 Año', value: libro.anio ? libro.anio.toString() : 'Desconocido', inline: true }
    ];

    if (libro.linkPdf) {
      fields.push({ name: '📄 PDF', value: `[Descargar](${libro.linkPdf})`, inline: false });
    }

    const embed = {
      title: libro.titulo.substring(0, 256),
      color: 0x00AE86,
      fields,
    };

    if (libro.imagenPortada) {
      embed.image = { url: libro.imagenPortada };
    }

    return { embeds: [embed] };
  } catch (error) {
    console.error('Error al obtener libro:', error);
    return { content: '❌ Error al conectar con la API.' };
  }
}

/**
 * /categorias — Lista las categorías disponibles
 */
async function comandoCategorias() {
  try {
    const respuesta = await fetch(`${API_URL}/api/categorias`);
    const datos = await respuesta.json();

    if (!datos.success) {
      return { content: 'Error al obtener las categorías.' };
    }

    const totalLibros = datos.data.reduce((s, c) => s + c.cantidad, 0);

    const fields = datos.data.map(cat => ({
      name: cat.nombre,
      value: `${cat.cantidad} libros`,
      inline: true
    }));

    return {
      embeds: [{
        title: '📚 Categorías de la Fundación Azara',
        description: `**${datos.meta.total} categorías** — ${totalLibros} libros en total`,
        color: 0x00AE86,
        fields
      }]
    };
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    return { content: '❌ Error al conectar con la API.' };
  }
}

// ──────────────────────────────────────────────
//  Iniciar servidor
// ──────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🤖 Discord Bot corriendo en http://localhost:${PORT}`);
  console.log(`📡 Interactions: POST http://localhost:${PORT}/interactions`);
  console.log(`🔗 API de datos: ${API_URL}`);
});
