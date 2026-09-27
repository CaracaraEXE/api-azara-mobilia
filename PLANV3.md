# Plan: Generalización del scraper — Recursos Educativos (Fundación Azara)

**Fecha:** 2026-09-26
**Estado:** Plan aprobado (opción A) — paso 0 COMPLETADO (2026-09-26), implementación pendiente
**Rol:** Planificación + implementación (fuera de Plan mode)
**Antecedente:** PLANV2.md (desglose de colecciones, cerrado: 326 libros, 0 revisionPendiente)

---

## 1. Contexto y problema

El scraper actual (`backend/scripts/scraper-playwright.js`) es **específico de libros**:
`CATEGORIAS` hardcodeadas (13), título vía `h4`, PDF vía `a[href$=".pdf"]`, y guardado
`libros-{slug}.json`. Funciona perfecto para la biblioteca, pero **no sirve tal cual para
"Recursos Educativos"**, que es una sección **completamente distinta** del sitio, con su propio
menú en la página y sus propias 10 categorías.

Diferencia estructural crítica verificada (2026-09-19/26): las páginas individuales de recursos
educativos **NO tienen `<h4>`** (el `obtenerDatosLibro` actual devolvería "sin título"), el
`h2.entry_title` del artículo está **oculto por CSS** y con la fecha contaminada ("08 Nov"),
y los PDFs viven en `/img/recursos-educativos/` (no `/wp-content/uploads/`). → El scraper debe
**generalizarse**: configuración por *secciones* (no solo por categorías de libros) y extractores
de página individual robustos.

Objetivo de la 2da etapa: incorporar más contenido de la Fundación además de los libros.
Piloto elegido: **Recursos Educativos**. Cualquier otra sección (Nótulas, Revista Azara,
Documentos, etc.) queda **EXPLÍCITAMENTE FUERA de alcance** — se analizará más adelante con el
agente de Plan (patrón `coleccion-links` futuro).

---

## 2. Objetivo

1. **Generalizar la configuración** del scraper: de `CATEGORIAS` (solo libros) a `SECCIONES`
   (libros + recursos + futuras), sin reescritura de la lógica de libros.
2. **Piloto Recursos Educativos**: 1 archivo `recursos-educativos.json` (**opción A**, decidida
   por el usuario 2026-09-26, "al menos para experimentar"), con las 10 categorías de RE como
   **colecciones** (`coleccion`), navegables por `?coleccion=` (mecanismo YA existente).
3. Que la **API y el bot no cambien**: "Recursos educativos" aparece como categoría nueva,
   el detalle muestra la colección (el bot ya renderiza "🗂️ Colección").
4. **Consolidación con libros SOLO tras verificación de identidad** (decisión del usuario):
   nunca asumir duplicado; comparar y decidir remover/dejar por análisis.
5. **Cero regresión** en los 326 libros existentes (0 revisionPendiente).

---

## 3. Data model objetivo

Se mantiene el modelo existente, con `coleccion` (opcional, ya usado en libros):

```json
{
  "id": "lib-abc123",
  "titulo": "25 Experiencias de física, química y biología",
  "linkPdf": "https://fundacionazara.org.ar/img/recursos-educativos/25-experiencias-de-fisica-quimica-y-biologia.pdf",
  "imagenPortada": "https://fundacionazara.org.ar/wp-content/uploads/2017/11/....jpg",
  "autor": null,
  "anio": 2017,
  "fechaExtraccion": "ISO string",
  "coleccion": "Cuadernillos"
}
```

- La `categoria` NO va en el JSON: el backend la asigna desde el slug del archivo
  (`recursos-educativos.json` → `categoria: "Recursos educativos"`).
- `coleccion` = una de las 10 categorías de RE (dato de configuración, no del sitio).
- `anio` = del `published_time` de la página individual (**dato base, sujeto a revisión
  humana** — el usuario dudó de su veracidad; el portal/cura manual es el que define).

---

## 4. Categorías de Recursos Educativos (definidas por el usuario, URLs verificadas)

| # | Categoría (nombre del usuario) | URL canónica | Estado verificación | Contenido (paso 0) |
|---|--------------------------------|--------------|---------------------|-----------|
| 1 | Cuadernillos | `/cuadernillos/` | ✅ | 9 tarjetas: 8 individuales + 1 colección de 7 (miradas-de-la-argentina) → **15 ítems** |
| 2 | Posters de Geología | `/posters-de-geologia/` | ✅ | 3 ítems |
| 3 | Posters de Paleontología | `/poster-de-paleontologia/` ⚠️ **SINGULAR** | ✅ | **20 ítems** (2× "Dinosaurios de la Argentina" 2013/2014) |
| 4 | Posters de Ambiente | `/posters-de-ambiente/` | ✅ | 5 ítems |
| 5 | Posters de Biodiversidad | `/posters-de-biodiversidad/` | ✅ | **26 ítems** (la más grande) |
| 6 | Posters de Antropología, Historia y Patrimonio | `/posters-de-antropologia/` | ✅ | 7 ítems (H1 confirma el nombre del usuario) |
| 7 | Cartillas | `/cartillas` (sin barra funciona) | ✅ | 11 ítems (patrón individual, NO coleccion-links) |
| 8 | Folletos de Biodiversidad | `/folletos-de-biodiversidad/` | ✅ | 7 ítems |
| 9 | Folletos de Museos, Sitios Arqueológicos y Áreas Naturales Protegidas | `/folletos-de-museos-sitios-arqueologicos-y-areas-naturales-protegidas/` | ✅ | 7 ítems |
| 10 | Postales | `/postales` (sin barra funciona) | ✅ | 10 ítems |

**Total paso 0: 105 tarjetas = 111 ítems reales** (cuadernillos desglosa miradas: 9 tarjetas → 15).

**Nota trampa del sitio:** la URL de Posters de Paleontología es **singular**
(`/poster-de-paleontologia/`); la plural da **404** (verificado). El H1 de la grilla sí dice
"Posters de Paleontología" — el nombre de la categoría y su URL no siempre coinciden:
confiar en la CONFIG, no en el H1.

### 4.1 Resultados del paso 0 (barrido read-only, 2026-09-26) — CERO escritura

- **Patrón UNIFORME en las 10 categorías**: grilla de tarjetas (`h6`/`article`) → página individual
  con extractor de recurso. **No existe la estructura "colección de links directos" dentro de RE**
  → el patrón `coleccion-links` queda definitivamente para las secciones futuras (Nótulas, etc.).
- **Único caso único**: `miradas-de-la-argentina` (colección de 7, patrón `pares-h4-pdf` ya
  implementado en libros). La lista aprobada `COLECCIONES_CONOCIDAS` crece en 1 entrada.
- **Pares sospechosos (posible solapamiento intra-RE)** — se verifican por identidad ANTES de
  decidir (regla del usuario §6, nunca consolidar sin análisis):

  | Recurso sospechoso | Dónde aparece | URLs |
  |---|---|---|
  | Mariscos del golfo San Matías y la marea roja | Posters Biodiversidad + Folletos Biodiversidad | `/mariscos-del-golfo-san-matias-y-la-marea-roja/` y `/-2/` |
  | Yaguareté | Folletos + Postales + Folletos (Monumento Natural) | `/yaguarete/`, `/yaguarete-postal/`, `/yaguarete-monumento-natural/` |
  | El Shincal de Quimivil (nombre cercano) | Cuadernillos + Folletos Museos + Posters Antropología | `/el-shincal-de-quimivil-para-chicos/`, `/el-shincal-de-quimivil/`, `/el-shincal-de-quimivil-un-sitio-incaico-en-catamarca/` |

  Hipótesis: son recursos DISTINTOS (mismo tema, formato diferente: cuadernillo/póster/folleto/
  postal). El scraper genera un registro por ítem; si el `linkPdf` normalizado coincide → primer
  síntoma de duplicado real → verificación humana (§6). Si el PDF difiere → se quedan como están.

- **Títulos de tarjeta en mayúsculas** (ej. "DELFINES DEL GOLFO SAN MATÍAS...") o con el sufijo
  del sitio ("Félix de Azara poster") NO son un problema: el título real se toma del JSON-LD de
  la página individual, nunca de la tarjeta.

---

## 5. Diseño del scraper (extensión aditiva, no reescritura)

### 5.1 Configuración generalizada: `CATEGORIAS` → `SECCIONES`

```js
const SECCIONES = [
  // Libros: comportamiento IDÉNTICO al actual (migración mecánica 1:1 de las 13 categorías)
  { nombre: 'Paleontología', slug: 'paleontologia', url: '.../libros-de-paleontologia/', tipo: 'libros' },
  // Recursos educativos: 1 sección → 1 archivo, 10 subcategorías como grillas
  { nombre: 'Recursos educativos', slug: 'recursos-educativos', tipo: 'recursos', archivo: 'recursos-educativos.json',
    subgrupos: [
      { nombre: 'Cuadernillos', url: 'https://fundacionazara.org.ar/cuadernillos/' },
      { nombre: 'Posters de Paleontología', url: 'https://fundacionazara.org.ar/poster-de-paleontologia/' },
      ... // 10, con los nombres/URLs del usuario (§4)
    ] }
];
```

Flujo: por cada `subgrupo` → `obtenerUrlsLibros` (grilla, selector `article a[href]` ya probado,
la regex de 1 segmento filtra las URLs jerárquicas de la navegación "anterior/siguiente") → por
ítem → `obtenerDatosRecurso`.

### 5.2 Extractor de página individual de recurso (`obtenerDatosRecurso`)

Nuevo extractor con selectores robustos — **NO depende de `h4`**:

| Campo | Fuente (en orden de cascada) |
|-------|------------------------------|
| `titulo` | 1) JSON-LD `headline` de `script.yoast-schema-graph` (limpio, UTF-8) → 2) `og:title` → 3) `document.title`. Stripear sufijo ` - Fundación Azara` y decodificar entidades HTML |
| `imagenPortada` | `og:image` → fallback scoping `div[data-elementor-type="wp-post"] .elementor-widget-image img` (evita banner-azara-340.svg) |
| `linkPdf` | `article a[href*=".pdf"]` (el `'` fantasma ya está resuelto del PLANV2 §11; en recursos hay 1 solo link limpio) |
| `anio` | `meta[property="article:published_time"]` → `parseInt(year)` |
| `coleccion` | desde la CONFIG del subgrupo (no del sitio; la taxonomía es singular "Cuadernillo" vs menú plural "Cuadernillos") |

- **PROHIBIDO** usar `h4` (no existe) y `h2.entry_title` (oculto por CSS + fecha contaminada).
- Limpiar títulos con `textContent.replace(/\s+/g,' ').trim()` (BR residual, como Ciencia para todos).

### 5.3 Normalización de host + claves de dedup compuestas

- **Normalizar host**: los PDFs alternan `fundacionazara.org.ar` y `www.fundacionazara.org.ar`
  → quitar `www.` (y trailing slash) en las claves internas (`pdf:`, `img:`) para no romper el
  match transversal.
- **Clave de consolidación**: `PDF normalizado` cuando existe; si no, `título + anio`.
  **NUNCA solo título**: los dos "Dinosaurios de la Argentina" (2013 y 2014, slugs
  `/dinosaurios-de-la-argentina/` y `/-2/`) son **cosas distintas** — decisión explícita del
  usuario 2026-09-26: **no combinarlas**.

### 5.4 Desglose de colecciones DENTRO de recursos (miradas-de-la-argentina → 7)

- `miradas-de-la-argentina` = colección de 7 libros (La historia de la Tierra / Los que aquí
  vivieron / La naturaleza de la patria / Desde adentro / Casas de cosas / De pinceles y
  acuarelas / Aunque no lo veamos) — patrón **`pares-h4-pdf` YA existente** del PLANV2 §4.2-a.
- Se agrega a `COLECCIONES_CONOCIDAS` con `coleccion: "Miradas de la Argentina"` — el extractor
  actual desglosa solo (h4 + img + PDF por título; el 1er h4 intro se descarta solo).
- Los títulos traen `<br>` (ej: "Los que aquí vivieron (paleontología\nargentina)") → aplicar la
  limpieza `\s+` → ' ' del §5.2.
- Resultado neto: la grilla de Cuadernillos (9 tarjetas) produce **15 ítems** (8 + 7).
- Cualquier otro caso único que aparezca en el paso 0 se agrega a la lista aprobada con su patrón.

### 5.5 Generalización de los globs del backend (2 archivos, cambios chicos)

| Archivo | Hoy | Mañana |
|---------|-----|--------|
| `backend/scripts/validar-data.js` (línea 19) | `/^libros-.+\.json$/` | `/^(libros\|recursos)-.+\.json$/` |
| `backend/src/routes/libros.js` (líneas 24-25, 32, 70, 75) | `startsWith('libros-')` / `replace('libros-')` | `/(libros\|recursos)-/` |

`obtenerColecciones()`, filtros, búsqueda y stats ya son genéricos → **sin cambios en el bot**.

---

## 6. Flujo de consolidación con libros (decisión del usuario 2026-09-26)

1. **No asumir nada**: si un recurso *se parece* a algo presente en libros (mismo PDF
   normalizado o `título + anio` igual), NO se consolida automáticamente.
2. **Verificar identidad** (análisis: PDF, portada, título, año, contenido del sitio).
3. Según el resultado: **remover** el duplicado de uno de los lados, **consolidar** en un solo id
   multi-categoría, o **mantener ambos** como entradas separadas.
4. En la práctica: RE publica PDFs propios en `/img/recursos-educativos/` → solapamiento
   probablemente nulo; la verificación se aplica igual por regla, con el portal de revisión
   (`revisionPendiente`) como cortafuegos humano.

---

## 7. Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `backend/scripts/scraper-playwright.js` | Refactor `CATEGORIAS` → `SECCIONES` (migración 1:1 de libros), nuevo `obtenerDatosRecurso`, `subgrupos` en la config, `miradas-de-la-argentina` en `COLECCIONES_CONOCIDAS`, normalización `www.` en claves de dedup. NO reescritura. |
| `backend/scripts/validar-data.js` | Generalizar glob: `/^(libros\|recursos)-.+\.json$/` |
| `backend/src/routes/libros.js` | Generalizar prefijo: `/(libros\|recursos)-/` (4 lugares) |
| `backend/src/data/recursos-educativos.json` | **Nuevo** (generado por el scraper) |
| `PLANV3.md` | Este documento |

Scripts de referencia (`scraper-cheerio-old.js`, `extraerLibros.js`, `convertirCarrousel.js`):
NO tocar.

---

## 8. Pasos de implementación

1. **Paso 0 — barrido read-only** ✅ **COMPLETADO 2026-09-26** (§4.1): las 6 categorías
   pendientes verificadas → 10/10 con patrón uniforme grilla→individual; 105 tarjetas = 111 ítems
   reales; pares sospechosos identificados (Mariscos S. Matías, Yaguareté ×3, Shincal ×3) con
   hipótesis "recursos distintos" a confirmar si el `linkPdf` normalizado coincide. Cero escritura.
2. Refactor `SECCIONES` + `obtenerDatosRecurso` (manteniendo la ruta de libros intacta).
3. Generalizar globs en `validar-data.js` y `routes/libros.js`.
4. Configurar los 10 subgrupos con los nombres/URLs del usuario (§4).
5. Scrapear `recursos-educativos.json`.
6. `validar:data` → 0 problemas, 0 duplicados.
7. Verificación funcional: API (`?categoria=recursos-educativos`, `?coleccion=cuadernillos`,
   búsqueda, `/categorias/lista`) + bot (categoría nueva + embed con "🗂️ Colección") — el bot no
   se toca.
8. PR + review (con backup previo en `Temp/opencode/` como siempre).

---

## 9. Verificación / aceptación

- `recursos-educativos.json` con todos los ítems de las 10 categorías, **títulos limpios**
  (sin fechas tipo "08 Nov", sin `<br>` residual).
- `validar:data` → 0 problemas; los 326 libros existentes sin regresión.
- API devuelve la categoría "Recursos educativos" y filtra por cada `coleccion`.
- Bot muestra la categoría y el detalle con colección, sin cambios de código en `discord-bot/`.
- Consolidaciones con libros: solo tras verificación de identidad (regla §6).

---

## 10. Riesgos y notas

- **`published_time` dudoso** (preocupación del usuario): se usa como dato base pero **no se
  confía a ciegas** — la cura manual/portal de revisión es la fuente de verdad. No marcar
  `revisionPendiente` automáticamente solo por el año; decidir caso por caso en implementación.
- **URL singular vs plural** (`poster-de-paleontologia`): el sitio no es consistente; la config
  lleva las URLs verificadas, el paso 0 confirma las 6 restantes antes de fijarlas.
- **`h2.entry_title` oculto por CSS + fecha**: jamás usar como fuente de título.
- **`www.` vs sin `www.`** en PDFs: normalizar antes de las claves de dedup.
- **Dinosaurios de la Argentina (2013/2014)**: mismo título en la grilla, objetos distintos;
  no combinar. La clave de consolidación nunca puede ser solo el título.
- **Fuera de alcance (futuro, con agente Plan)**: Nótulas Faunísticas, Revista Azara,
  Documentos e informes, etc. — patrón `coleccion-links` a diseñar cuando llegue su turno.
- **Idempotencia y cura manual**: se mantiene `registrarOConsolidar` (existente gana) y la
  práctica de backups antes de cada re-scrape (`C:\Users\vicky\AppData\Local\Temp\opencode\`).

  # Plan V3.6 — Hemeroteca: Revista Azara + Periódico Exploración y Ciencia (SECCIONES)

**Corrección de diseño 2026-09-27:** los periódicos y revistas son **SECCIONES de primer nivel** (como
Libros y RE), NO categorías de una sección intermedia. La convención `carpeta = sección` ya existe
en la API (`libros.js` L22-34) — se reutiliza tal cual.

## Contexto
- **Periódico Exploración y Ciencia**: 3 ediciones (N1 **2013**, N2 2013, N3 2014). **PILOTO.**
- **Revista Azara**: 14 ediciones (N1 2013 → N14 2025). **Fase 2** (después del piloto).
- Titulares de cada edición **buscables por `/buscar`**; el match lleva al PDF de la edición completa.
- 1 archivo por publicación: `data/periodico-exploracion-y-ciencia/periodico-exploracion-y-ciencia.json`
  (seccion `periodico-exploracion-y-ciencia`) + `data/revista-azara/revista-azara.json` (seccion `revista-azara`).

## Decisiones tomadas (usuario)
1. Cada publicación aparece en el **dropdown de secciones** de `/categorias` (paso 1): 📚 Libros ·
   🎓 Recursos educativos · 🗞️ **Periódico Exploración y Ciencia** · 📰 **Revista Azara**.
2. **Salto directo a ediciones**: al elegir una sección con **1 sola categoría** (la hemeroteca)
   se muestran DIRECTAMENTE las ediciones (listado con ◀/▶ + 🔙 al paso 1), sin select de categorías
   intermedio. Detección dinámica: `categorias.length === 1` en `manejarSeleccionSeccion`.
3. `/buscar`: tarjeta NORMAL (título + PDF) — el titular solo hace encontrable el ítem; **NO** se muestra
   el titular matcheado. Los titulares completos se listan en `/libro` (campo `🗞️ Titulares`).
4. **Sin `coleccion`** en los ítems de hemeroteca (la categoría única YA es el propio material; evita
   la línea `🗂️` redundante en el embed). `coleccion` sigue siendo exclusivo de RE.
5. Middle ground en el scraper: 3 funciones nuevas + 2 dispatch. **Cero copy-paste** de funciones
   enteras. Cero regresión libros (326) y RE (109). Backups en `Temp\opencode` antes de re-scrapear.

## Estructura verificada (Qode Bridge + Elementor, grillas estáticas, sin AJAX)
- **Grilla** (ambas): ítems `article.mix` en `.projects_holder`; título `.portfolio_title a`
  (**por CLASE, no tag**: `h6` en Periódico, `h5` en Revista); portada `.image_holder img`
  (con `<span class='image'>` intermedio). `a.portfolio_link_class` = ancla vacía (nunca usar).
  HTML mezcla comillas simples/dobles → selectores por clase.
- **PDF de edición** (verificado N3 y N14): botón `a.qodef-qi-button[href$=".pdf"]` con texto
  "Descargar archivo", dentro de `.elementor-widget-qi_addons_for_elementor_button`. **Exactamente
  1 PDF por individual.** Guard: excluir si href/texto matchea `/norma|autores/i`; si queda >1 →
  `linkPdf: null` + `revisionPendiente: true`.
- **El PDF "Normas para autores"** está SOLO en la grilla de Revista Azara (h3 + botón propio, fuera
  del `.projects_holder`) → `obtenerUrlsPortafolio` (que recorre solo `article.mix`) no lo ve. No interfiere.
- **Titulares**: `.elementor-widget-text-editor .elementor-widget-container` con `<p><strong>Contenido</strong></p>`
  de header. Periódico: titulares separados por `<br>` (cada uno `• ...`). Revista Azara: **1 `<p>` por
  titular** (`•` dentro de `<span lang="ES-MX">`, algunos con `<em>`). Parser unificado: separar por
  `<br>` Y por `<p>`, descartar el segmento "Contenido", limpiar `•`/`&nbsp;`/tags (usar `textContent`,
  no `.find('span')`). **Guardar SIN bullet** (dato puro); el bot pinta el `• ` al renderizar.
- **URLs**: Periódico N3 = `http://www.fundacionazara.org.ar/img/periodico-exporacion-ciencia/...pdf`
  (http + www + typo "exporacion"). Revista = `https://...img/revista-azara/...-ok.pdf`. →
  `limpiarUrlPdf` fuerza https y quita www.
- **Revista N14**: sin `<h1>`, título en `.elementor-widget-text-editor h2`, portada en
  `.elementor-widget-image img` (alt vacío). El widget `elementor-element-3345f342` se CLONA entre
  ediciones → jamás seleccionar por `elementor-element-id`.
- **Título de tarjeta real**: `Periódico Exploración y Ciencia - Número 3 (2014)` (con "Periódico "
  delante y " - " con espacios; hay espacio leading tras el `<a>` → `.trim()`). La capitalización de
  Revista Azara es INCONSISTENTE entre ediciones: N1–N11 `Revista Azara - Número N (año)` vs
  N12–N14 `REVISTA AZARA – NÚMERO N (año)` (MAYÚSCULAS + EN DASH U+2013). Se guarda tal cual de la
  grilla (fidelidad); la búsqueda ya es case-insensitive vía `normalizarBusqueda`. Si molesta la
  mayúscula, normalizar título sería decisión aparte (fuera de alcance).
- Título y portada vienen de la **grilla** (fuente de verdad); la individual solo aporta PDF +
  titulares (+ `anio` del título).

## Modelo de ítem
```json
{
  "id": "rev-tk0m3x2pa9",
  "titulo": "Periódico Exploración y Ciencia - Número 3 (2014)",
  "linkPdf": "https://fundacionazara.org.ar/img/periodico-exporacion-ciencia/exploracion-y-ciencia-numero-3-2014.pdf",
  "imagenPortada": "<url jpg de la grilla>",
  "autor": null,
  "anio": 2014,
  "categoria": "Periódico Exploración y Ciencia",
  "titulares": ["George Gaylord Simpson en Argentina", "Un siglo después de las cacerías de ballena sei..."],
  "fechaExtraccion": "2026-09-27T00:00:00.000Z"
}
```
- `anio` por regex `(\(\d{4}\))` del título (funciona en "Número 3 (2014)" y "NÚMERO 14 (2025)").
- **SIN `coleccion`** (ver decisión 4). `categoria` con acentos en el archivo: la API ya respeta
  `libros[0].categoria` (`libros.js` L51-52); los archivos actuales no la tienen → cero cambio.
- `titulares`: array de strings SIN bullet. Sin PDF → `linkPdf: null` + `revisionPendiente: true`.
- `fechaExtraccion` en ISO completo (consistencia con los 435 ítems existentes).

## Cambios por capa

### 1. Scraper (`backend/scripts/scraper-playwright.js`)
- 2 entradas nuevas en `SECCIONES` con `tipo: 'hemeroteca'` + `archivoUnico: true` + 1 sola
  categoría (URL de grilla). Config (verificado contra L820 y L1035-1037):
  - Periódico: `slug: 'periodico-exploracion-y-ciencia'`, `prefijoArchivo: 'periodico-exploracion-y-ciencia'`
  - Revista Azara: `slug: 'revista-azara'`, `prefijoArchivo: 'revista-azara'`
- Funciones NUEVAS (exportadas):
  - `obtenerUrlsPortafolio(page, url)` → `[{url, titulo, portada}]` (recorre `article.mix`; NO
    reutiliza `obtenerUrlsLibros`, su regex `/[a-z0-9-]+\/$/` no matchea `/portfolio_page/...`).
  - `obtenerDatosPortafolio(page, url, {titulo, portada})` → ítem con PDF (`a.qodef-qi-button`, guard
    normas), titulares, `anio` (regex del título).
  - `extraerTitularesDeHtml(html)` — **función pura exportada** (testeable).
- **2 dispatch puntuales** en `scrapearSeccion`:
  - Recolección de URLs (L886): `seccion.tipo === 'hemeroteca' ? obtenerUrlsPortafolio(...) : obtenerUrlsLibros(...)`.
  - Default de `procesarUrl` (L937): `seccion.tipo === 'hemeroteca' ? obtenerDatosPortafolio(page, url, contextoDeGrilla) : obtenerDatosItem(page, url)`.
  - El loop principal (L957-980) debe pasar el objeto de grilla `{url, titulo, portada}` en modo hemeroteca.
- Fix **persistencia archivo único** (`scrapearSeccion`, L820-830): el archivo final es `{slug}.json` —
  cuando slug === prefijoArchivo (hemeroteca) NO duplicar el prefijo (evita `revista-azara-revista-azara.json`).
  Recursos queda igual (`recursos-educativos.json`).
- Fix **`construirIndiceGlobal`** (L713): regex `^prefijo(-.+)?\.json$` — con `^prefijo-...$` el índice
  no vería `revista-azara.json` al re-scrapear y rompería el dedup "existente gana" (L790).
- **`registrarItem`** (L903-905): en modo archivoUnico NO inyectar `coleccion` si `tipo: 'hemeroteca'`.
- Dedup: reusa `construirIndiceGlobal`/`registrarOConsolidar` por prefijo de sección (no cruza secciones).
- `obtenerUrlsLibros`/`obtenerDatosItem`/RE **INTACTOS**.
- **CLI**: `--seccion=periodico-exploracion-y-ciencia` y `--seccion=revista-azara` (NUNCA
  `--categoria=...`: `resolverObjetivo` L1035-1037 da ERROR para secciones de archivo único).

### 2. API
- Generalizar los **3 `listarArchivosData` duplicados** (`backend/src/routes/libros.js` L22,
  `backend/src/routes/categorias.js` L16, `backend/scripts/validar-data.js` L26): **descubrimiento
  automático** de subcarpetas de `data/` (carpeta = seccion) matcheando `^<carpeta>(-.+)?\.json$`.
  - ⚠️ Preservar EXACTA la derivación de slug actual (L48: solo `libros-` hace strip; `recursos-educativos.json`
    conserva el nombre completo → "Recursos Educativos" no debe romperse). No tocar `categoriaDeArchivo`.
- Búsqueda (~L191 de `routes/libros.js`): agregar
  `|| (Array.isArray(l.titulares) && l.titulares.some(t => normalizarBusqueda(t).includes(termino)))`.
- `validar-data.js`: validar `titulares` (array de strings no vacíos) y `categoria` (string no vacío).

### 3. Bot Discord
- `discord-bot/src/formatos.js`:
  - `SECCIONES_NOMBRES`: + `periodico-exploracion-y-ciencia: 'Periódico Exploración y Ciencia'`,
    + `revista-azara: 'Revista Azara'`.
  - `SECCIONES_EMOJIS`: + `periodico-exploracion-y-ciencia: '🗞️'`, + `revista-azara: '📰'`.
  - `construirMensajeCategoriasSeccion` (L147): unidad 'ediciones' para la hemeroteca (hoy
    `sec === 'recursos' ? 'ítems' : 'libros'`).
- `discord-bot/src/index.js`:
  - `comandoCategorias` (L262-295): reemplazar el ternario hardcodeado (L278) y el sort (L286-287)
    por un mapa/orden explícito de secciones [libros, recursos, periodico-exploracion-y-ciencia, revista-azara].
  - `obtenerCategoriasDeSeccion` (L362-386): el default debe filtrar `(c.seccion || 'libros') === sec`
    (hoy está hardcodeado `'libros'` en L383) → las secciones nuevas aparecen solas.
  - **Salto directo** en `manejarSeleccionSeccion` (L391-411): si `categorias.length === 1` →
    GET `/api/libros?categoria=<nombre>&limite=5&pagina=1` → `construirMensajeCategoriaLibros` directo.
  - `manejarVolverCategorias` (L488-499): si la sección tiene 1 sola categoría → volver al **paso 1**
    (select de secciones), no al select de categorías.
  - `manejarSeleccionCategoria`/`manejarPaginacionCategoria`: filtro ya es genérico
    (`sec === 'recursos' ? 'coleccion' : 'categoria'`, L433/L467) → sin cambios para la hemeroteca.
  - `comandoLibro` (~L221-226): campo `🗞️ Titulares` ("• " + titular, truncado 1024 chars + contador)
    cuando `libro.titulares` no vacío.
- Custom_ids/flujos existentes intactos (`cat-page`/`cat-back` llevan `sec`).

### 4. Tests / docs
- Fixture real de HTML para `extraerTitularesDeHtml` con los 2 modos (Periódico `<br>` y Revista Azara
  `<p>`) — patrón `Temp\opencode` tipo test-formatos.
- `test-integracion-bot`: totales 435 → **438** (al existir la data del piloto); **los checks de
  secciones (L117-118) y el sort explícito del dropdown se actualizan a 4 secciones** (hoy asumen
  `[0]=libros`, `[1]=recursos`).
- `validar-data`: a 0 problemas.
- AGENTS.md: secciones nuevas + `titulares` en data model + nota "la hemeroteca SÍ lleva `categoria`".

## Orden de ejecución
1. Scraper (SECCIONES hemeroteca + 3 funciones + 2 dispatch + fixes L820/L713/L903).
2. Backups en `Temp\opencode` → correr **piloto** `node scripts/scraper-playwright.js --seccion=periodico-exploracion-y-ciencia`.
3. API (3 × listarArchivosData + búsqueda titulares + validación).
4. Bot (formatos.js + index.js + salto directo).
5. Tests/docs.
6. E2E con servicios levantados.
7. **Fase 2** — Revista Azara (`--seccion=revista-azara`): VERIFICAR estructura en las 14 ediciones
   ANTES de scraper (las viejas 2013-2022 pueden tener template distinto; el guard normas +
   `revisionPendiente` las protegen).

## Riesgos
- Ediciones viejas de Revista Azara con markup distinto (mitigado: guard `/norma|autores/i`,
  verificación previa antes de la corrida full de Fase 2).
- Typo en URLs (`exporacion`) → `limpiarUrlPdf` normaliza (https + sin www).
- Romper slug de RE al generalizar `listarArchivosData` → conservar EXACTA la lógica de derivación
  (solo `libros-` hace strip).
- Capitalización inconsistente N12–N14 de Revista Azara (MAYÚSCULAS + EN DASH): título tal cual de la
  grilla; si molesta visualmente, decisión futura de normalización (fuera de alcance V3.6).
- El `test-integracion-bot` actual asume 2 secciones (L117-118): actualizar a 4 junto con la data.