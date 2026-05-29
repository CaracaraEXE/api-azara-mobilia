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
  MESSAGE_COMPONENT: 3,
};

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
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

    // Botón / componente (type 3)
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      const { custom_id } = interaction.data;

      try {
        const payload = JSON.parse(custom_id);

        if (payload.cmd === 'buscar') {
          await manejarPaginacionBusqueda(interaction, res, payload);
        } else if (payload.cmd === 'cat-select') {
          await manejarSeleccionCategoria(interaction, res);
        } else if (payload.cmd === 'cat-page') {
          await manejarPaginacionCategoria(interaction, res, payload);
        } else if (payload.cmd === 'cat-back') {
          await manejarVolverCategorias(interaction, res);
        }
      } catch (error) {
        console.error('❌ Error en componente:', error);
      }

      return;
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
 * Construye un embed + botones de paginación para resultados de búsqueda
 */
function construirMensajeBusqueda(termino, libros, pagina, total) {
  const totalPaginas = Math.ceil(total / 5);

  const fields = libros.map(libro => ({
    name: libro.titulo.substring(0, 256),
    value: libro.linkPdf
      ? `📁 ${libro.categoria} · 🆔 \`${libro.id}\`\n📄 [Descargar PDF](${libro.linkPdf})`
      : `📁 ${libro.categoria} · 🆔 \`${libro.id}\`\n❌ Sin PDF disponible`
  }));

  // Botones de navegación (solo si hay más de una página)
  const components = [];

  if (totalPaginas > 1) {
    const botones = [];

    // ◀ Anterior
    botones.push({
      type: 2,
      style: 1,
      label: '◀ Anterior',
      custom_id: pagina > 0
        ? JSON.stringify({ cmd: 'buscar', q: termino, p: pagina - 1 })
        : 'noop',
      disabled: pagina === 0
    });

    // Indicador de página (deshabilitado, solo muestra posición)
    botones.push({
      type: 2,
      style: 2,
      label: `${pagina + 1} / ${totalPaginas}`,
      custom_id: 'page-indicator',
      disabled: true
    });

    // Siguiente ▶
    botones.push({
      type: 2,
      style: 1,
      label: 'Siguiente ▶',
      custom_id: pagina < totalPaginas - 1
        ? JSON.stringify({ cmd: 'buscar', q: termino, p: pagina + 1 })
        : 'noop',
      disabled: pagina >= totalPaginas - 1
    });

    components.push({
      type: 1, // ActionRow
      components: botones
    });
  }

  return {
    embeds: [{
      title: `🔍 Resultados para "${termino}"`,
      color: 0x00AE86,
      fields,
      footer: { text: `Página ${pagina + 1} de ${totalPaginas} — ${total} resultados` }
    }],
    components: components.length > 0 ? components : undefined
  };
}

/**
 * /buscar [termino] — Busca libros por título
 */
async function comandoBuscar(options) {
  const termino = options?.find(o => o.name === 'termino')?.value;

  if (!termino) {
    return { content: '❌ Necesitás especificar un término de búsqueda.' };
  }

  try {
    const respuesta = await fetch(`${API_URL}/api/libros?busqueda=${encodeURIComponent(termino)}&limite=5&pagina=1`);
    const datos = await respuesta.json();

    if (!datos.success || datos.data.length === 0) {
      return { content: `No encontré libros para "${termino}".` };
    }

    return construirMensajeBusqueda(termino, datos.data, 0, datos.meta.total);
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
 * Construye el embed + Select Menu para el listado de categorías
 */
function construirMensajeCategorias(categorias, totalLibros) {
  const options = categorias.map(cat => ({
    label: cat.nombre,
    value: cat.nombre,
    description: `${cat.cantidad} libros`
  }));

  return {
    embeds: [{
      title: '📚 Categorías de la Fundación Azara',
      description: `**${categorias.length} categorías** — ${totalLibros} libros en total`,
      color: 0x00AE86,
      fields: categorias.map(cat => ({
        name: cat.nombre,
        value: `${cat.cantidad} libros`,
        inline: true
      }))
    }],
    components: [{
      type: 1,
      components: [{
        type: 3,
        custom_id: JSON.stringify({ cmd: 'cat-select' }),
        placeholder: 'Seleccioná una categoría para ver sus libros...',
        min_values: 1,
        max_values: 1,
        options
      }]
    }]
  };
}

/**
 * Construye embed + botones de paginación + volver para libros de una categoría
 */
function construirMensajeCategoriaLibros(categoria, libros, pagina, total) {
  const totalPaginas = Math.ceil(total / 5);

  const fields = libros.map(libro => ({
    name: libro.titulo.substring(0, 256),
    value: libro.linkPdf
      ? `🆔 \`${libro.id}\`\n📄 [Descargar PDF](${libro.linkPdf})`
      : `🆔 \`${libro.id}\`\n❌ Sin PDF disponible`
  }));

  // Una sola ActionRow con todos los botones
  const botones = [];

  // Botón volver (SIEMPRE primero para mantener orden consistente)
  botones.push({
    type: 2,
    style: 2,
    label: '🔙 Volver',
    custom_id: JSON.stringify({ cmd: 'cat-back' })
  });

  // Botones de paginación (solo si hay más de una página)
  if (totalPaginas > 1) {
    botones.push({
      type: 2,
      style: 1,
      label: '◀',
      custom_id: pagina > 0
        ? JSON.stringify({ cmd: 'cat-page', cat: categoria, p: pagina - 1 })
        : 'noop',
      disabled: pagina === 0
    });

    botones.push({
      type: 2,
      style: 2,
      label: `${pagina + 1}/${totalPaginas}`,
      custom_id: 'cat-page-indicator',
      disabled: true
    });

    botones.push({
      type: 2,
      style: 1,
      label: '▶',
      custom_id: pagina < totalPaginas - 1
        ? JSON.stringify({ cmd: 'cat-page', cat: categoria, p: pagina + 1 })
        : 'noop',
      disabled: pagina >= totalPaginas - 1
    });
  }

  return {
    embeds: [{
      title: `📚 Libros de ${categoria}`,
      color: 0x00AE86,
      fields,
      footer: { text: totalPaginas > 1 ? `Página ${pagina + 1} de ${totalPaginas} — ${total} resultados` : `${total} resultados` }
    }],
    components: [{
      type: 1,
      components: botones
    }]
  };
}

/**
 * /categorias — Lista las categorías disponibles (con Select Menu)
 */
async function comandoCategorias() {
  try {
    const respuesta = await fetch(`${API_URL}/api/categorias`);
    const datos = await respuesta.json();

    if (!datos.success) {
      return { content: 'Error al obtener las categorías.' };
    }

    const totalLibros = datos.data.reduce((s, c) => s + c.cantidad, 0);
    return construirMensajeCategorias(datos.data, totalLibros);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    return { content: '❌ Error al conectar con la API.' };
  }
}

// ──────────────────────────────────────────────
//  Manejadores de componentes (botones / select)
// ──────────────────────────────────────────────

/**
 * Helper: hace PATCH al mensaje original de una interacción
 * Loggea la respuesta de Discord para debuggear
 */
async function patchMensajeOriginal(interaction, mensaje) {
  const url = `https://discord.com/api/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;

  const discordRes = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mensaje)
  });

  if (!discordRes.ok) {
    const errorTexto = await discordRes.text();
    console.error(`❌ Discord PATCH ${discordRes.status}: ${errorTexto.substring(0, 200)}`);
  }
}

/**
 * Helper: hace PATCH con mensaje de error simple
 */
async function patchError(interaction, texto) {
  await patchMensajeOriginal(interaction, {
    content: texto,
    embeds: [],
    components: []
  });
}

/**
 * Paginación de /buscar (◀ ▶)
 */
async function manejarPaginacionBusqueda(interaction, res, payload) {
  const pagina = payload.p || 0;

  res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

  try {
    const respuesta = await fetch(
      `${API_URL}/api/libros?busqueda=${encodeURIComponent(payload.q)}&limite=5&pagina=${pagina + 1}`
    );
    const datos = await respuesta.json();

    if (datos.success) {
      await patchMensajeOriginal(interaction, construirMensajeBusqueda(payload.q, datos.data, pagina, datos.meta.total));
    } else {
      await patchError(interaction, '❌ Error al obtener resultados.');
    }
  } catch (error) {
    console.error('Error en paginación búsqueda:', error);
    await patchError(interaction, '❌ Error al conectar con la API.');
  }
}

/**
 * Select Menu de categorías — muestra los libros de la categoría seleccionada
 */
async function manejarSeleccionCategoria(interaction, res) {
  const values = interaction.data.values;
  const categoria = values?.[0];

  console.log(`🔍 Select categoria: values=${JSON.stringify(values)}, categoria="${categoria}"`);

  if (!categoria) {
    console.error('❌ Select Menu sin valor de categoría');
    res.json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Error: no se pudo obtener la categoría seleccionada.', flags: 64 } });
    return;
  }

  res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

  try {
    const url = `${API_URL}/api/libros?categoria=${encodeURIComponent(categoria)}&limite=5&pagina=1`;
    console.log(`🌐 Fetching: ${url}`);

    const respuesta = await fetch(url);
    const datos = await respuesta.json();

    console.log(`📦 API respondió: success=${datos.success}, total=${datos.meta?.total}, libros=${datos.data?.length}`);

    if (datos.success && datos.data.length > 0) {
      const mensaje = construirMensajeCategoriaLibros(categoria, datos.data, 0, datos.meta.total);
      console.log(`✉️ PATCH con ${mensaje.components?.length || 0} ActionRows`);
      await patchMensajeOriginal(interaction, mensaje);
    } else {
      console.log('⚠️ Sin libros en esta categoría');
      await patchMensajeOriginal(interaction, construirMensajeCategoriaLibros(categoria, [], 0, 0));
    }
  } catch (error) {
    console.error('Error al seleccionar categoría:', error);
    await patchError(interaction, '❌ Error al conectar con la API.');
  }
}

/**
 * Paginación de libros de una categoría (◀ ▶)
 */
async function manejarPaginacionCategoria(interaction, res, payload) {
  const pagina = payload.p || 0;
  const categoria = payload.cat;

  res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

  try {
    const respuesta = await fetch(
      `${API_URL}/api/libros?categoria=${encodeURIComponent(categoria)}&limite=5&pagina=${pagina + 1}`
    );
    const datos = await respuesta.json();

    if (datos.success) {
      await patchMensajeOriginal(interaction, construirMensajeCategoriaLibros(categoria, datos.data, pagina, datos.meta.total));
    } else {
      await patchError(interaction, '❌ Error al obtener resultados.');
    }
  } catch (error) {
    console.error('Error en paginación categoría:', error);
    await patchError(interaction, '❌ Error al conectar con la API.');
  }
}

/**
 * Vuelve al listado general de categorías con el Select Menu
 */
async function manejarVolverCategorias(interaction, res) {
  res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

  try {
    const respuesta = await fetch(`${API_URL}/api/categorias`);
    const datos = await respuesta.json();

    if (datos.success) {
      const totalLibros = datos.data.reduce((s, c) => s + c.cantidad, 0);
      await patchMensajeOriginal(interaction, construirMensajeCategorias(datos.data, totalLibros));
    } else {
      await patchError(interaction, '❌ Error al obtener categorías.');
    }
  } catch (error) {
    console.error('Error al volver a categorías:', error);
    await patchError(interaction, '❌ Error al conectar con la API.');
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
