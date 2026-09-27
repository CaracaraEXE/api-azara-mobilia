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
const formatos = require('./formatos');

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
        } else if (payload.cmd === 'sec-select') {
          await manejarSeleccionSeccion(interaction, res);
        } else if (payload.cmd === 'cat-select') {
          await manejarSeleccionCategoria(interaction, res, payload);
        } else if (payload.cmd === 'cat-page') {
          await manejarPaginacionCategoria(interaction, res, payload);
        } else if (payload.cmd === 'cat-back') {
          await manejarVolverCategorias(interaction, res, payload);
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

    return formatos.construirMensajeBusqueda(termino, datos.data, 0, datos.meta.total);
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

    // Sección (emoji) + categoría REAL: en RE la categoría visible es la
    // colección/subgrupo; 'Recursos Educativos' es la SECCIÓN, no la categoría.
    const sec = formatos.infoSeccion(libro);

    const fields = [
      { name: `${sec.emoji} Sección`, value: sec.nombre, inline: true },
      { name: '📁 Categoría', value: sec.categoriaReal, inline: true },
      { name: '✍️ Autor', value: libro.autor || 'Desconocido', inline: true },
      { name: '📅 Año', value: libro.anio ? libro.anio.toString() : 'Desconocido', inline: true }
    ];

    // Colección de LIBROS (PLANV2 §2): series/desgloses ("Tomo 02"); en RE ya está en Categoría.
    if (!sec.esRecursos && libro.coleccion) {
      fields.push({ name: '🗂️ Colección', value: libro.coleccion, inline: false });
    }

    if (libro.linkPdf) {
      // Bilingües (linkPdfEn, p.ej. El Shincal): ambos enlaces, ES · EN
      const enlaces = [`[Español](${libro.linkPdf})`];
      if (libro.linkPdfEn) enlaces.push(`[English](${libro.linkPdfEn})`);
      fields.push({ name: '📄 PDF', value: enlaces.join(' · '), inline: false });
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
 * /categorias — Muestra el Select de SECCIONES (paso 1).
 * RE ya no aparece mezclado con Libros: primero se elige la sección y después
 * las categorías de esa sección (ver manejarSeleccionSeccion).
 */
async function comandoCategorias() {
  try {
    const respuesta = await fetch(`${API_URL}/api/categorias`);
    const datos = await respuesta.json();

    if (!datos.success) {
      return { content: 'Error al obtener las categorías.' };
    }

    // Agrupar por sección (la API entrega categoria.seccion tras la migración
    // a carpetas por sección). Orden estable: libros primero, RE después.
    const porSeccion = new Map();
    for (const cat of datos.data) {
      const sec = cat.seccion || 'libros'; // compat: categorías sin seccion → libros
      const e = porSeccion.get(sec) || {
        seccion: sec,
        nombre: sec === 'recursos' ? 'Recursos educativos' : 'Libros',
        cantidad: 0,
        categorias: 0
      };
      e.cantidad += cat.cantidad;
      e.categorias += 1;
      porSeccion.set(sec, e);
    }
    const secciones = [...porSeccion.values()]
      .sort((a, b) => (a.seccion === 'libros' ? 0 : 1) - (b.seccion === 'libros' ? 0 : 1));
    const totalItems = secciones.reduce((s, x) => s + x.cantidad, 0);

    return formatos.construirMensajeSecciones(secciones, totalItems);
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
      await patchMensajeOriginal(interaction, formatos.construirMensajeBusqueda(payload.q, datos.data, pagina, datos.meta.total));
    } else {
      await patchError(interaction, '❌ Error al obtener resultados.');
    }
  } catch (error) {
    console.error('Error en paginación búsqueda:', error);
    await patchError(interaction, '❌ Error al conectar con la API.');
  }
}

/**
 * Categorías navegables de una sección + total de ítems.
 * - libros: las categorías de /api/categorias con seccion === 'libros'.
 * - recursos: las COLECCIONES (subgrupos) del archivo único RE, detectadas por
 *   pertenecer a las categorías de la sección 'recursos' (hoy 'Recursos Educativos').
 */
async function obtenerCategoriasDeSeccion(sec) {
  if (sec === 'recursos') {
    const [resCat, resCol] = await Promise.all([
      fetch(`${API_URL}/api/categorias`),
      fetch(`${API_URL}/api/libros/colecciones/lista`)
    ]);
    const datosCat = await resCat.json();
    const datosCol = await resCol.json();
    const nombresSeccion = (datosCat.data || [])
      .filter(c => c.seccion === 'recursos')
      .map(c => c.nombre);
    const categorias = (datosCol.data || [])
      .filter(c => (c.categorias || []).some(n => nombresSeccion.includes(n)))
      .map(c => ({ nombre: c.nombre, cantidad: c.cantidad }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { categorias, total: categorias.reduce((s, c) => s + c.cantidad, 0) };
  }

  const respuesta = await fetch(`${API_URL}/api/categorias`);
  const datos = await respuesta.json();
  const categorias = (datos.data || [])
    .filter(c => (c.seccion || 'libros') === 'libros')
    .map(c => ({ nombre: c.nombre, cantidad: c.cantidad }));
  return { categorias, total: categorias.reduce((s, c) => s + c.cantidad, 0) };
}

/**
 * Select Menu de SECCIONES (paso 1 de /categorias) → muestra las categorías de la sección
 */
async function manejarSeleccionSeccion(interaction, res) {
  const sec = interaction.data.values?.[0];

  console.log(`🔍 Select seccion: value="${sec}"`);

  if (!sec) {
    console.error('❌ Select Menu sin valor de sección');
    res.json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Error: no se pudo obtener la sección seleccionada.', flags: 64 } });
    return;
  }

  res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

  try {
    const { categorias, total } = await obtenerCategoriasDeSeccion(sec);
    await patchMensajeOriginal(interaction, formatos.construirMensajeCategoriasSeccion(sec, categorias, total));
  } catch (error) {
    console.error('Error al seleccionar sección:', error);
    await patchError(interaction, '❌ Error al conectar con la API.');
  }
}

/**
 * Select Menu de categorías (paso 2 de /categorias) — muestra los ítems de la categoría.
 * sec: 'libros' → ?categoria=; 'recursos' → ?coleccion= (la navegación fina de RE).
 */
async function manejarSeleccionCategoria(interaction, res, payload) {
  const values = interaction.data.values;
  const categoria = values?.[0];
  const sec = payload?.sec || 'libros'; // compat: custom_ids viejos sin sec → libros

  console.log(`🔍 Select categoria: values=${JSON.stringify(values)}, categoria="${categoria}", sec="${sec}"`);

  if (!categoria) {
    console.error('❌ Select Menu sin valor de categoría');
    res.json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '❌ Error: no se pudo obtener la categoría seleccionada.', flags: 64 } });
    return;
  }

  res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

  try {
    const filtro = sec === 'recursos' ? 'coleccion' : 'categoria';
    const url = `${API_URL}/api/libros?${filtro}=${encodeURIComponent(categoria)}&limite=5&pagina=1`;
    console.log(`🌐 Fetching: ${url}`);

    const respuesta = await fetch(url);
    const datos = await respuesta.json();

    console.log(`📦 API respondió: success=${datos.success}, total=${datos.meta?.total}, items=${datos.data?.length}`);

    if (datos.success && datos.data.length > 0) {
      const mensaje = formatos.construirMensajeCategoriaLibros(sec, categoria, datos.data, 0, datos.meta.total);
      console.log(`✉️ PATCH con ${mensaje.components?.length || 0} ActionRows`);
      await patchMensajeOriginal(interaction, mensaje);
    } else {
      console.log('⚠️ Sin ítems en esta categoría');
      await patchMensajeOriginal(interaction, formatos.construirMensajeCategoriaLibros(sec, categoria, [], 0, 0));
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
  const sec = payload?.sec || 'libros'; // compat: custom_ids viejos sin sec → libros

  res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

  try {
    const filtro = sec === 'recursos' ? 'coleccion' : 'categoria';
    const respuesta = await fetch(
      `${API_URL}/api/libros?${filtro}=${encodeURIComponent(categoria)}&limite=5&pagina=${pagina + 1}`
    );
    const datos = await respuesta.json();

    if (datos.success) {
      await patchMensajeOriginal(interaction, formatos.construirMensajeCategoriaLibros(sec, categoria, datos.data, pagina, datos.meta.total));
    } else {
      await patchError(interaction, '❌ Error al obtener resultados.');
    }
  } catch (error) {
    console.error('Error en paginación categoría:', error);
    await patchError(interaction, '❌ Error al conectar con la API.');
  }
}

/**
 * Vuelve al listado de categorías de la SECCIÓN desde la que se vino
 * (cat-back lleva la sección en el custom_id).
 */
async function manejarVolverCategorias(interaction, res, payload) {
  const sec = payload?.sec || 'libros'; // compat: custom_ids viejos sin sec → libros
  res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

  try {
    const { categorias, total } = await obtenerCategoriasDeSeccion(sec);
    await patchMensajeOriginal(interaction, formatos.construirMensajeCategoriasSeccion(sec, categorias, total));
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
