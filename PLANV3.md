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