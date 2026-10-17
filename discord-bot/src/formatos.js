/**
 * formatos.js — Presentación pura del bot (embed + componentes)
 *
 * Funciones SIN efectos: reciben datos de la API y devuelven la estructura
 * de mensaje de Discord. Separadas de index.js para poder testear los
 * formatos sin levantar el servidor de interacciones.
 *
 * Convención de etiquetas:
 *   - Emoji de SECCIÓN primero: 📚 Libros | 🎓 Recursos educativos
 *   - Emoji de CATEGORÍA segundo: 📁 (la categoría REAL de navegación)
 *   - La categoría visible = `categorias` (todas las del ítem), para TODAS las
 *     secciones. En RE son los 10 grupos ('Cuadernillos', 'Posters de …', …).
 *   - 🗂️ Colección = serie/desglose (p.ej. "Miradas de la Argentina", que es una
 *     colección DENTRO de la categoría 'Cuadernillos'). Se muestra si el ítem
 *     trae `coleccion`.
 *   - El enlace de PDF SIEMPRE al final del value del campo.
 */

const SECCIONES_NOMBRES = {
  libros: 'Libros',
  'recursos-educativos': 'Recursos educativos',
  // Hemeroteca (PLANV3 V3.6): cada publicación periódica es una SECCIÓN.
  'periodico-exploracion-y-ciencia': 'Periódico Exploración y Ciencia',
  'revista-azara': 'Revista Azara'
};

const SECCIONES_EMOJIS = {
  libros: '📚',
  'recursos-educativos': '🎓',
  'periodico-exploracion-y-ciencia': '🗞️',
  'revista-azara': '📰'
};

/**
 * Secciones de HEMEROTECA (PLANV3 V3.6): sus ítems son "ediciones" (no "libros")
 * y cada una tiene 1 sola categoría → el bot hace "salto directo" a las ediciones.
 */
const SECCIONES_HEMEROTECA = new Set(['periodico-exploracion-y-ciencia', 'revista-azara']);

/**
 * Datos de presentación de un ítem según su sección.
 * categoriaReal = `categorias` del ítem (todas, unidas por " · "; normalmente una
 * sola). En RE la categoría es el grupo del ítem ('Cuadernillos', 'Posters de …').
 */
function infoSeccion(libro) {
  const categorias = libro.categorias || [];
  return {
    emoji: SECCIONES_EMOJIS[libro.seccion] || '📚',
    nombre: SECCIONES_NOMBRES[libro.seccion] || 'Libros',
    categoriaReal: categorias.join(' · ') || 'Desconocida'
  };
}

/**
 * Línea(s) de descarga PDF para un ítem — SIEMPRE al final del value (convención).
 * Ítems bilingües (p.ej. folleto El Shincal de Quimivil) llevan linkPdfEn:
 * se muestran ambos enlaces, ES primero, EN después.
 */
function enlacesPdf(libro) {
  if (!libro.linkPdf) return '❌ Sin PDF disponible';
  const links = [`📄 [Descargar PDF](${libro.linkPdf})`];
  if (libro.linkPdfEn) links.push(`📄 [Descargar PDF (EN)](${libro.linkPdfEn})`);
  return links.join('\n');
}

/**
 * Normalizar texto para búsquedas laxas — MISMA semántica que la API
 * (backend/src/routes/catalogo.js, normalizarBusqueda): quita ACENTOS (áéíóúü)
 * y pasa a minúsculas, pero CONSERVA la ñ (carácter propio del español, no un
 * acento). El bot la replica solo para elegir QUÉ titulares mostrar como
 * contexto del match en /buscar — la API ya filtró el ítem; acá se replica el
 * mismo criterio para no mentirle al usuario con titulares que no coinciden.
 */
function normalizarBusqueda(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, c => (c === '\u0303' ? '\u0303' : ''))
    .normalize('NFC')
    .toLowerCase();
}

/**
 * Titular(es) de una edición de HEMEROTECA que coinciden con el término de
 * búsqueda — el "contexto del match" (PLANV3 V3.6): si el ítem apareció porque
 * un titular contenía el término, se muestra ESE titular, no solo el título de
 * la edición (que por sí solo no explica por qué matcheó).
 * Devuelve { visibles: [hasta 2 titulares], total: #coincidencias }.
 * Si matcheó por TÍTULO/AUTOR (ningún titular contiene el término), total = 0 →
 * el resultado NO muestra línea extra. Libros/RE (sin titulares) → total = 0.
 */
function titularesCoincidentes(libro, termino) {
  if (!Array.isArray(libro.titulares) || !termino) return { visibles: [], total: 0 };
  const t = normalizarBusqueda(termino);
  const coinciden = libro.titulares.filter(tit => normalizarBusqueda(tit).includes(t));
  return { visibles: coinciden.slice(0, 2).map(tit => tit.substring(0, 256)), total: coinciden.length };
}

/**
 * Embed + botones de paginación para resultados de búsqueda (/buscar y ◀▶).
 */
function construirMensajeBusqueda(termino, libros, pagina, total) {
  const totalPaginas = Math.ceil(total / 5);

  const fields = libros.map(libro => {
    const sec = infoSeccion(libro);
    let value = `${sec.emoji} ${sec.nombre} · 📁 ${sec.categoriaReal} · 🆔 \`${libro.id}\``;
    // Colección (serie/desglose: desambigua "Tomo 02"; en RE, "Miradas de la
    // Argentina" dentro de Cuadernillos).
    if (libro.coleccion) value += `\n🗂️ ${libro.coleccion}`;
    // Contexto del match de HEMEROTECA: "• " + titular(es) coincidente(s) (misma
    // convención que /ficha). Solo si el término está en algún titular; si el
    // match vino por el título de la edición, no se agrega línea extra.
    const match = titularesCoincidentes(libro, termino);
    if (match.total > 0) {
      value += '\n' + match.visibles.map(t => `• ${t}`).join('\n');
      if (match.total > match.visibles.length) value += `\n…y ${match.total - match.visibles.length} más`;
    }
    value += '\n' + enlacesPdf(libro);
    return { name: libro.titulo.substring(0, 256), value };
  });

  const components = [];
  if (totalPaginas > 1) {
    const botones = [];
    botones.push({
      type: 2,
      style: 1,
      label: '◀ Anterior',
      custom_id: pagina > 0 ? JSON.stringify({ cmd: 'buscar', q: termino, p: pagina - 1 }) : 'noop',
      disabled: pagina === 0
    });
    botones.push({
      type: 2,
      style: 2,
      label: `${pagina + 1} / ${totalPaginas}`,
      custom_id: 'page-indicator',
      disabled: true
    });
    botones.push({
      type: 2,
      style: 1,
      label: 'Siguiente ▶',
      custom_id: pagina < totalPaginas - 1 ? JSON.stringify({ cmd: 'buscar', q: termino, p: pagina + 1 }) : 'noop',
      disabled: pagina >= totalPaginas - 1
    });
    components.push({ type: 1, components: botones });
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
 * Paso 1 de /catalogo: embed + Select Menu de SECCIONES.
 * secciones: [{ seccion: 'libros'|'recursos-educativos'|…, nombre, cantidad, categorias }]
 */
function construirMensajeSecciones(secciones, totalItems) {
  const options = secciones.map(sec => ({
    label: `${SECCIONES_EMOJIS[sec.seccion] || '📚'} ${sec.nombre}`,
    value: sec.seccion,
    description: `${sec.cantidad} ítems — ${sec.categorias} categorías`
  }));

  return {
    embeds: [{
      title: '📚 Catálogo de la Fundación Azara',
      description: `**${secciones.length} secciones** — ${totalItems} ítems en total.\nElegí una sección para ver sus categorías:`,
      color: 0x00AE86
    }],
    components: [{
      type: 1,
      components: [{
        type: 3,
        custom_id: JSON.stringify({ cmd: 'sec-select' }),
        placeholder: 'Seleccioná una sección...',
        min_values: 1,
        max_values: 1,
        options
      }]
    }]
  };
}

/**
 * Paso 2 de /catalogo: embed con estadísticas + Select Menu de categorías
 * de UNA sección. Para libros las categorías vienen de /api/categorias; para
 * RE son las COLECCIONES (subgrupos) del archivo único.
 * categorias: [{ nombre, cantidad }]
 */
function construirMensajeCategoriasSeccion(sec, categorias, totalItems) {
  const emoji = SECCIONES_EMOJIS[sec] || '📚';
  const nombre = SECCIONES_NOMBRES[sec] || 'Libros';
  const unidad = SECCIONES_HEMEROTECA.has(sec) ? 'ediciones' : (sec === 'recursos-educativos' ? 'ítems' : 'libros');
  const options = categorias.map(cat => ({
    label: cat.nombre,
    value: cat.nombre,
    description: `${cat.cantidad} ${unidad}`
  }));

  return {
    embeds: [{
      title: `${emoji} ${nombre}`,
      description: `**${categorias.length} categorías** — ${totalItems} ítems en total`,
      color: 0x00AE86,
      fields: categorias.map(cat => ({
        name: cat.nombre,
        value: `${cat.cantidad} ${unidad}`,
        inline: true
      }))
    }],
    components: [{
      type: 1,
      components: [{
        type: 3,
        custom_id: JSON.stringify({ cmd: 'cat-select', sec }),
        placeholder: 'Seleccioná una categoría para ver sus ítems...',
        min_values: 1,
        max_values: 1,
        options
      }]
    }]
  };
}

/**
 * Embed + botones de paginación + volver para los ítems de una categoría.
 * sec: sección de origen ('libros' | 'recursos-educativos' | …) — se usa en los custom_ids
 * del botón Volver (cat-back) y de la paginación (cat-page).
 */
function construirMensajeCategoriaLibros(sec, nombreCategoria, libros, pagina, total) {
  const totalPaginas = Math.ceil(total / 5);
  const emoji = SECCIONES_EMOJIS[sec] || '📚';
  const nombreSeccion = SECCIONES_NOMBRES[sec] || 'Libros';

  const fields = libros.map(libro => {
    let value = `🆔 \`${libro.id}\``;
    // Ítems de serie/desglose muestran su colección (desambigua "Tomo NN");
    // aplica igual a "Miradas de la Argentina" dentro de Cuadernillos (RE).
    if (libro.coleccion) value += `\n🗂️ ${libro.coleccion}`;
    value += '\n' + enlacesPdf(libro);
    return { name: libro.titulo.substring(0, 256), value };
  });

  const botones = [];
  botones.push({
    type: 2,
    style: 2,
    label: '🔙 Volver',
    custom_id: JSON.stringify({ cmd: 'cat-back', sec })
  });

  if (totalPaginas > 1) {
    botones.push({
      type: 2,
      style: 1,
      label: '◀',
      custom_id: pagina > 0 ? JSON.stringify({ cmd: 'cat-page', sec, cat: nombreCategoria, p: pagina - 1 }) : 'noop',
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
      custom_id: pagina < totalPaginas - 1 ? JSON.stringify({ cmd: 'cat-page', sec, cat: nombreCategoria, p: pagina + 1 }) : 'noop',
      disabled: pagina >= totalPaginas - 1
    });
  }

  return {
    embeds: [{
      // En HEMEROTECA la única categoría ES la publicación → el título no repite
      // "🗞️ Periódico Exploración y Ciencia: Periódico Exploración y Ciencia"
      // (verificado en el E2E del piloto; se aplica igual a Revista Azara en Fase 2).
      title: SECCIONES_HEMEROTECA.has(sec) ? `${emoji} ${nombreSeccion}` : `${emoji} ${nombreSeccion}: ${nombreCategoria}`,
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
 * Embed de DETALLE de un ítem (/ficha) + botón TOGGLE de titulares.
 *
 * mostrarTitulares: si el ítem tiene titulares (hemeroteca), el field 🗞️ se
 * incluye SOLO cuando es true. El botón que alterna muestra/oculta ese listado:
 * Discord no tiene "colapsar" — el bot RE-RENDERIZA el mensaje entero (PATCH) y
 * el estado viaja en el custom_id (v = ¿visibles AHORA?), sin estado en el bot.
 *
 * El botón solo existe para ítems CON titulares (libros/RE no lo llevan, no
 * tienen lista que alternar). El orden de los fields es el de siempre:
 * Sección/Categoría/Autor/Año (inline) → Colección → Titulares → PDF.
 * El listado se trunca a ~1000 chars (límite de un field de embed: 1024) con
 * contador "(mostrando X de N)" — la edición vieja N1 (18 titulares) lo supera.
 */
function construirMensajeLibro(libro, mostrarTitulares) {
  const sec = infoSeccion(libro);

  const fields = [
    { name: `${sec.emoji} Sección`, value: sec.nombre, inline: true },
    { name: '📁 Categoría', value: sec.categoriaReal, inline: true },
    { name: '✍️ Autor', value: libro.autor || 'Desconocido', inline: true },
    { name: '📅 Año', value: libro.anio ? libro.anio.toString() : 'Desconocido', inline: true }
  ];

  // Colección (serie/desglose: "Tomo 02"; en RE, "Miradas de la Argentina").
  if (libro.coleccion) {
    fields.push({ name: '🗂️ Colección', value: libro.coleccion, inline: false });
  }

  const titulares = Array.isArray(libro.titulares) ? libro.titulares : [];
  const tieneTitulares = titulares.length > 0;

  if (tieneTitulares && mostrarTitulares) {
    const lineas = titulares.map(t => `• ${t}`);
    let texto = lineas.join('\n');
    if (texto.length > 1000) {
      const recorte = texto.lastIndexOf('\n', 1000);
      texto = recorte > 100 ? texto.substring(0, recorte) : texto.substring(0, 1000);
      const visibles = (texto.match(/\n/g) || []).length + 1;
      texto += `\n*(mostrando ${visibles} de ${lineas.length} titulares)*`;
    }
    fields.push({ name: '🗞️ Titulares', value: texto, inline: false });
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
    fields
  };

  if (libro.imagenPortada) {
    embed.image = { url: libro.imagenPortada };
  }

  const mensaje = { embeds: [embed] };

  if (tieneTitulares) {
    mensaje.components = [{
      type: 1,
      components: [{
        type: 2,
        style: 2,
        label: mostrarTitulares ? '🔽 Ocultar titulares' : `📖 Ver titulares (${titulares.length})`,
        custom_id: JSON.stringify({ cmd: 'tits-toggle', id: libro.id, v: Boolean(mostrarTitulares) })
      }]
    }];
  }

  return mensaje;
}

module.exports = {
  SECCIONES_NOMBRES,
  SECCIONES_EMOJIS,
  SECCIONES_HEMEROTECA,
  infoSeccion,
  enlacesPdf,
  normalizarBusqueda,
  titularesCoincidentes,
  construirMensajeBusqueda,
  construirMensajeSecciones,
  construirMensajeCategoriasSeccion,
  construirMensajeCategoriaLibros,
  construirMensajeLibro
};