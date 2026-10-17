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

// Orden EXPLÍCITO del dropdown de secciones de /catalogo (PLANV3 V3.6):
// libros y RE primero (compat), después la hemeroteca (Periódico, Revista Azara).
const ORDEN_SECCIONES = ['libros', 'recursos-educativos', 'periodico-exploracion-y-ciencia', 'revista-azara'];

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
        case 'ficha':
          response = await comandoFicha(options);
          break;
        case 'catalogo':
          response = await comandoCatalogo();
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
        } else if (payload.cmd === 'tits-toggle') {
          await manejarToggleTitulares(interaction, res, payload);
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
 * /buscar [termino] — Busca en el catálogo por título, autor o titulares
 */
async function comandoBuscar(options) {
  const termino = options?.find(o => o.name === 'termino')?.value;

  if (!termino) {
    return { content: '❌ Necesitás especificar un término de búsqueda.' };
  }

  try {
    const respuesta = await fetch(`${API_URL}/api/catalogo?busqueda=${encodeURIComponent(termino)}&limite=5&pagina=1`);
    const datos = await respuesta.json();

    if (!datos.success || datos.data.length === 0) {
      return { content: `No encontré resultados para "${termino}".` };
    }

    return formatos.construirMensajeBusqueda(termino, datos.data, 0, datos.meta.total);
  } catch (error) {
    console.error('Error en búsqueda:', error);
    return { content: '❌ Error al conectar con la API.' };
  }
}

/**
 * /ficha [id] — Muestra el detalle de un ítem del catálogo
 */
async function comandoFicha(options) {
  const id = options?.find(o => o.name === 'id')?.value;

  if (!id) {
    return { content: '❌ Necesitás especificar un ID.' };
  }

  try {
    const respuesta = await fetch(`${API_URL}/api/catalogo/${id}`);
    const datos = await respuesta.json();

    if (!datos.success) {
      return { content: `No encontré un ítem con ID "${id}".` };
    }

    // Presentación movida a formatos.js (pura, testeable). El 2º argumento es el
    // estado INICIAL del toggle de titulares: ocultos por defecto → /ficha
    // compacto; el botón 📖 los muestra re-renderizando vía 'tits-toggle'.
    return formatos.construirMensajeLibro(datos.data, false);
  } catch (error) {
    console.error('Error al obtener el ítem:', error);
    return { content: '❌ Error al conectar con la API.' };
  }
}

/**
 * /catalogo — Muestra el Select de SECCIONES (paso 1).
 * RE ya no aparece mezclado con Libros: primero se elige la sección y después
 * las categorías de esa sección (ver manejarSeleccionSeccion).
 */
async function comandoCatalogo() {
  try {
    const respuesta = await fetch(`${API_URL}/api/categorias`);
    const datos = await respuesta.json();

    if (!datos.success) {
      return { content: 'Error al obtener las categorías.' };
    }

    // Agrupar por sección (la API entrega categoria.seccion tras la migración
    // a carpetas por sección). El nombre sale de formatos (single source of
    // truth, PLANV3 V3.6) y el orden es EXPLÍCITO (ORDEN_SECCIONES) para que la
    // hemeroteca aparezca después de libros/RE sin depender del orden de fs.
    const porSeccion = new Map();
    for (const cat of datos.data) {
      const sec = cat.seccion || 'libros'; // compat: categorías sin seccion → libros
      const e = porSeccion.get(sec) || {
        seccion: sec,
        nombre: formatos.SECCIONES_NOMBRES[sec] || sec,
        cantidad: 0,
        categorias: 0
      };
      e.cantidad += cat.cantidad;
      e.categorias += 1;
      porSeccion.set(sec, e);
    }
    const secciones = [...porSeccion.values()]
      .sort((a, b) => {
        const ia = ORDEN_SECCIONES.indexOf(a.seccion);
        const ib = ORDEN_SECCIONES.indexOf(b.seccion);
        return (ia === -1 ? ORDEN_SECCIONES.length : ia) - (ib === -1 ? ORDEN_SECCIONES.length : ib);
      });
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
 * Toggle de titulares de /ficha (hemeroteca): alterna mostrar/ocultar el campo
 * 🗞️ Titulares RE-RENDERIZANDO el mensaje completo (Discord no tiene colapso).
 * El estado viene en el custom_id (v = ¿visibles AHORA?); el nuevo es !v.
 * Solo /ficha lleva este botón — /buscar y los listados no lo usan.
 */
async function manejarToggleTitulares(interaction, res, payload) {
  const { id, v } = payload;

  res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

  try {
    const respuesta = await fetch(`${API_URL}/api/catalogo/${id}`);
    const datos = await respuesta.json();

    if (datos.success) {
      await patchMensajeOriginal(interaction, formatos.construirMensajeLibro(datos.data, !v));
    } else {
      await patchError(interaction, '❌ No encontré el ítem para actualizar.');
    }
  } catch (error) {
    console.error('❌ Error en toggle de titulares:', error);
    await patchError(interaction, '❌ Error al conectar con la API.');
  }
}

/**
 * Paginación de /buscar (◀ ▶)
 */
async function manejarPaginacionBusqueda(interaction, res, payload) {
  const pagina = payload.p || 0;

  res.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

  try {
    const respuesta = await fetch(
      `${API_URL}/api/catalogo?busqueda=${encodeURIComponent(payload.q)}&limite=5&pagina=${pagina + 1}`
    );
    const datos = await respuesta.json();

    if (datos.success && datos.data.length > 0) {
      await patchMensajeOriginal(interaction, formatos.construirMensajeBusqueda(payload.q, datos.data, pagina, datos.meta.total));
    } else if (datos.success && datos.data.length === 0) {
      await patchError(interaction, `No encontré más resultados para "${payload.q}".`);
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
 * La API ya devuelve las categorías de TODAS las secciones (Libros 13, RE 10,
 * hemeroteca 1 c/u) en `/api/categorias`; acá solo se filtran por `seccion`.
 * El default cubre ítems legados sin campo `seccion` → 'libros'.
 */
async function obtenerCategoriasDeSeccion(sec) {
  const respuesta = await fetch(`${API_URL}/api/categorias`);
  const datos = await respuesta.json();
  const categorias = (datos.data || [])
    .filter(c => (c.seccion || 'libros') === sec)
    .map(c => ({ nombre: c.nombre, cantidad: c.cantidad }));
  return { categorias, total: categorias.reduce((s, c) => s + c.cantidad, 0) };
}

/**
 * Select Menu de SECCIONES (paso 1 de /catalogo) → muestra las categorías de la sección
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

    // Salto directo (PLANV3 V3.6): secciones con 1 sola categoría (la hemeroteca)
    // muestran DIRECTAMENTE sus ediciones, sin el select de categorías intermedio.
    if (categorias.length === 1) {
      const nombreCategoria = categorias[0].nombre;
      const respuesta = await fetch(
        `${API_URL}/api/catalogo?categoria=${encodeURIComponent(nombreCategoria)}&limite=5&pagina=1`
      );
      const datos = await respuesta.json();
      if (datos.success && datos.data.length > 0) {
        await patchMensajeOriginal(interaction, formatos.construirMensajeCategoriaLibros(sec, nombreCategoria, datos.data, 0, datos.meta.total));
      } else {
        await patchMensajeOriginal(interaction, formatos.construirMensajeCategoriaLibros(sec, nombreCategoria, [], 0, 0));
      }
      return;
    }

    await patchMensajeOriginal(interaction, formatos.construirMensajeCategoriasSeccion(sec, categorias, total));
  } catch (error) {
    console.error('Error al seleccionar sección:', error);
    await patchError(interaction, '❌ Error al conectar con la API.');
  }
}

/**
 * Select Menu de categorías (paso 2 de /catalogo) — muestra los ítems de la categoría.
 * Todos los ítems se filtran con ?categoria=<nombre> (nombres de la API).
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
    const url = `${API_URL}/api/catalogo?categoria=${encodeURIComponent(categoria)}&limite=5&pagina=1`;
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
    const respuesta = await fetch(
      `${API_URL}/api/catalogo?categoria=${encodeURIComponent(categoria)}&limite=5&pagina=${pagina + 1}`
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

    // Salto directo (PLANV3 V3.6): si la sección tiene 1 sola categoría, el 🔙
    // vuelve al PASO 1 (select de secciones), no al select de categorías.
    if (categorias.length === 1) {
      const paso1 = await comandoCategorias();
      await patchMensajeOriginal(interaction, paso1);
      return;
    }

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
