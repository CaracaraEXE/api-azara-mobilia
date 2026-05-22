/**
 * Rutas de Discord - Interacciones via HTTP (API oficial)
 * 
 * Recibe POSTs de Discord con interacciones de usuarios.
 * Verifica firmas Ed25519, maneja PING y comandos slash.
 * 
 * POST /api/discord/interactions  ← endpoint configurado en Discord Developer Portal
 */

const express = require('express');
const router = express.Router();
const nacl = require('tweetnacl');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const API_URL = process.env.API_URL || 'http://localhost:3000';

// ──────────────────────────────────────────────
//  Tipos de respuesta de Discord
// ──────────────────────────────────────────────
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
};

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
};

// ──────────────────────────────────────────────
//  POST /interactions  — Endpoint principal
// ──────────────────────────────────────────────
router.post('/interactions', async (req, res) => {
  try {
    // ── Verificar firma Ed25519 ──────────────
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    const rawBody = req.rawBody;

    if (!signature || !timestamp || !rawBody) {
      return res.status(401).json({ error: 'Faltan headers de firma' });
    }

    const publicKey = process.env.DISCORD_PUBLIC_KEY;
    if (!publicKey) {
      console.error('❌ DISCORD_PUBLIC_KEY no configurada');
      return res.status(500).json({ error: 'Server config error' });
    }

    const isValid = nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody),
      Buffer.from(signature, 'hex'),
      Buffer.from(publicKey, 'hex')
    );

    if (!isValid) {
      return res.status(401).json({ error: 'Firma inválida' });
    }

    // ── Parsear interacción ──────────────────
    const interaction = JSON.parse(rawBody);

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

    // Tipo de interacción no soportado
    return res.status(400).json({ error: 'Tipo de interacción no soportado' });

  } catch (error) {
    console.error('❌ Error en interacción Discord:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
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

    const fields = datos.data.map(cat => ({
      name: cat.nombre,
      value: `${cat.cantidad} libros`,
      inline: true
    }));

    // Agrupar de a 3 por fila (Discord permite hasta 25 fields)
    return {
      embeds: [{
        title: '📚 Categorías de la Fundación Azara',
        description: `**${datos.meta.total} categorías disponibles** — ${datos.data.reduce((s, c) => s + c.cantidad, 0)} libros en total`,
        color: 0x00AE86,
        fields
      }]
    };
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    return { content: '❌ Error al conectar con la API.' };
  }
}

module.exports = router;
