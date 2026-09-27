/**
 * formatos.js — Presentación pura del bot (embed + componentes)
 *
 * Funciones SIN efectos: reciben datos de la API y devuelven la estructura
 * de mensaje de Discord. Separadas de index.js para poder testear los
 * formatos sin levantar el servidor de interacciones.
 *
 * Convención de etiquetas (acordada con el usuario 2026-09-27):
 *   - Emoji de SECCIÓN primero: 📚 Libros | 🎓 Recursos educativos
 *   - Emoji de CATEGORÍA segundo: 📁 (la categoría REAL de navegación)
 *   - En RE la categoría real = coleccion (subgrupo: 'Cuadernillos', ...);
 *     'Recursos Educativos' es la SECCIÓN, no una categoría.
 *   - El enlace de PDF SIEMPRE al final del value del campo.
 */

const SECCIONES_NOMBRES = {
  libros: 'Libros',
  recursos: 'Recursos educativos'
};

const SECCIONES_EMOJIS = {
  libros: '📚',
  recursos: '🎓'
};

/**
 * Datos de presentación de un ítem según su sección.
 * esRecursos: la categoría visible es la colección (subgrupo); si un ítem
 * de RE no tuviera coleccion (no debería pasar con opción A), cae a categoria.
 */
function infoSeccion(libro) {
  const esRecursos = libro.seccion === 'recursos';
  return {
    esRecursos,
    emoji: SECCIONES_EMOJIS[libro.seccion] || '📚',
    nombre: SECCIONES_NOMBRES[libro.seccion] || 'Libros',
    categoriaReal: esRecursos ? (libro.coleccion || libro.categoria || 'Desconocida') : (libro.categoria || 'Desconocida')
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
 * Embed + botones de paginación para resultados de búsqueda (/buscar y ◀▶).
 */
function construirMensajeBusqueda(termino, libros, pagina, total) {
  const totalPaginas = Math.ceil(total / 5);

  const fields = libros.map(libro => {
    const sec = infoSeccion(libro);
    let value = `${sec.emoji} ${sec.nombre} · 📁 ${sec.categoriaReal} · 🆔 \`${libro.id}\``;
    // Colección de LIBROS (series/desgloses: desambigua "Tomo 02"); en RE la
    // colección YA es la categoría mostrada arriba, no se repite.
    if (!sec.esRecursos && libro.coleccion) value += `\n🗂️ ${libro.coleccion}`;
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
 * Paso 1 de /categorias: embed + Select Menu de SECCIONES.
 * secciones: [{ seccion: 'libros'|'recursos', nombre, cantidad, categorias }]
 */
function construirMensajeSecciones(secciones, totalItems) {
  const options = secciones.map(sec => ({
    label: `${SECCIONES_EMOJIS[sec.seccion] || '📚'} ${sec.nombre}`,
    value: sec.seccion,
    description: `${sec.cantidad} ítems — ${sec.categorias} categorías`
  }));

  return {
    embeds: [{
      title: '📚 Categorías de la Fundación Azara',
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
 * Paso 2 de /categorias: embed con estadísticas + Select Menu de categorías
 * de UNA sección. Para libros las categorías vienen de /api/categorias; para
 * RE son las COLECCIONES (subgrupos) del archivo único.
 * categorias: [{ nombre, cantidad }]
 */
function construirMensajeCategoriasSeccion(sec, categorias, totalItems) {
  const emoji = SECCIONES_EMOJIS[sec] || '📚';
  const nombre = SECCIONES_NOMBRES[sec] || 'Libros';
  const unidad = sec === 'recursos' ? 'ítems' : 'libros';
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
 * sec: sección de origen ('libros' | 'recursos') — se usa en los custom_ids
 * del botón Volver (cat-back) y de la paginación (cat-page).
 */
function construirMensajeCategoriaLibros(sec, nombreCategoria, libros, pagina, total) {
  const totalPaginas = Math.ceil(total / 5);
  const emoji = SECCIONES_EMOJIS[sec] || '📚';
  const nombreSeccion = SECCIONES_NOMBRES[sec] || 'Libros';

  const fields = libros.map(libro => {
    const info = infoSeccion(libro);
    let value = `🆔 \`${libro.id}\``;
    // En el listado de una categoría de LIBROS, los ítems de serie muestran su
    // colección (desambigua "Tomo NN"); en RE la colección es la categoría visitada.
    if (!info.esRecursos && libro.coleccion) value += `\n🗂️ ${libro.coleccion}`;
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
      title: `${emoji} ${nombreSeccion}: ${nombreCategoria}`,
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

module.exports = {
  infoSeccion,
  enlacesPdf,
  construirMensajeBusqueda,
  construirMensajeSecciones,
  construirMensajeCategoriasSeccion,
  construirMensajeCategoriaLibros
};