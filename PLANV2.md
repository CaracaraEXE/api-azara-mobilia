# Plan: Desglose de Colecciones en el Scraper de Libros (Fundación Azara)

**Fecha:** 2026-09-04 (actualizado 2026-09-07)
**Estado:** Aprobado — implementación pendiente
**Rol:** Planificación + implementación (fuera de Plan mode)

---

## 1. Contexto y problema

El scraper actual (`backend/scripts/scraper-playwright.js`) asume **"1 URL = 1 libro = 1 PDF"**.
Usa `$eval` (primer elemento) para `h4` y para `a[href$=".pdf"]`. Cuando una página pertenece a
una **colección** (varios libros), solo captura el primer libro / la portada suelta, lo que genera
datos incompletos o entradas mal representadas en los JSON (`backend/src/data/libros-*.json`).

La API (`backend/src/routes/libros.js`) y el bot devuelven estos libros. Las colecciones mal
capturadas hoy figuran como una entrada con `linkPdf` vacío o una sola portada sin el resto de libros.

### Casos reales detectados (6 familias de estructura)

| # | Colección | Categoría | Patrón estructural | PDFs | Automatizar |
|---|-----------|-----------|--------------------|------|-------------|
| 1 | Voces ancestrales | Infantiles | Pares H4→PDF en bloques Elementor | 12 | ✅ Sí |
| 2 | Viajeros y exploradores de la Patagonia | Historia-ciencia | Div único de títulos + carrousel de portadas separado | No | ✅ Sí (con validación) |
| 3 | Viajeros olvidados | Historia-ciencia | 1 contenedor = 1 libro (img + h4 + p) | No | ✅ Sí |
| 4 | Ciencia para todos | Divulgación | 1 contenedor = 1 libro (con `<br>` sucio en título) | No | ✅ Sí |
| 5 | Guía de las reservas naturales de Argentina | Áreas naturales | Solo título saga + carrousel Qode 5 portadas SIN texto (validado) | No | ✅ Semiauto (esqueletos + revisión) |
| 6 | Fauna argentina amenazada (Los que se van / Otros que se van) | Flora-fauna | 4 imágenes sueltas con 2 H4 de subcolección, SIN títulos de libro (validado) | No | ✅ Semiauto (esqueletos + revisión) |

### Decisión de filosofía (definida con el usuario, actualizada 2026-09-07)
**Automatizar todo lo automatizable** (patrones 1-6, con la lista aprobada de URLs).
Casos 5 y 6: **semiautomáticos** — el scraper genera el esqueleto por imagen (id, portada,
colección, autor de serie, `revisionPendiente`) y el humano completa SOLO los títulos reales vía PR.
Motivo: los títulos individuales NO existen en el DOM (0 h4/alt/caption, filenames solo numéricos,
verificado 2026-09-07) → inferirlos sería inventar datos (mem #9). El scraping no se "tueree" por
casos aislados: `imagenes-sueltas` es un patrón nuevo trivial que no toca la lógica de libro único.
NO se habilita un comando genérico de modificación de datos en runtime (riesgo sigue igual).

---

## 2. Objetivo

1. Que el scraper **detecte páginas de colección** y **desglose N libros individuales** por página,
   en lugar de capturar solo el primero.
2. Que cada libro desglosado sea un **registro propio** en el JSON/API, con sus metadatos
   (título, autor, año, portada, PDF cuando exista).
3. Que los **casos límite** (5 y 6) queden como **esqueletos semiautomáticos** (1 objeto por imagen
   única, con su ID y portada) y que el humano SOLO complete los títulos vía PR, sin duplicaciones.
4. Un **comando de validación solo-lectura** que prevenga duplicaciones/inconsistencias, SIN
   necesidad de un comando que mueve datos en runtime (el riesgo que al usuario le preocupa).

---

## 3. Data model objetivo

Se mantiene el modelo actual (`{ id, titulo, linkPdf, imagenPortada, autor, anio, fechaExtraccion }`)
y se **añaden campos opcionales de colección** a cada libro desglosado:

```json
{
  "id": "lib-xxxx",
  "titulo": "Título del libro individual",
  "linkPdf": "http://...pdf | null",
  "imagenPortada": "https://...jpg",
  "autor": "string | null",
  "anio": 2005,
  "fechaExtraccion": "ISO string",
  "coleccion": "Viajeros y exploradores de la Patagonia"
}
```

- `coleccion` (opcional): nombre de la saga a la que pertenece.
- El backend (`routes/libros.js`) los devuelve tal cual; no requiere cambios para no romper la API,
  pero se puede enriquecer el filtro por colección en una etapa posterior (opcional).

---

## 4. Diseño del scraper (extensión, no reescritura)

### 4.1 Detección de colección por lista aprobada (seguro)

Se agrega una constante `COLECCIONES_CONOCIDAS` con las URLs de colección a desglosar,
junto a su patrón esperado y nombre de colección:

```js
const COLECCIONES_CONOCIDAS = [
  { url: 'https://fundacionazara.org.ar/coleccion-voces-ancestrales-de-los-valles-calchaquies/', patron: 'pares-h4-pdf', coleccion: 'Voces ancestrales de los Valles Calchaquíes' },
  { url: 'https://fundacionazara.org.ar/coleccion-viajeros-y-exploradores-de-la-patagonia/', patron: 'div-titulos-carrousel', coleccion: 'Viajeros y exploradores de la Patagonia' },
  { url: 'https://fundacionazara.org.ar/coleccion-viajeros-olvidados/', patron: 'contenedor-por-libro', coleccion: 'Viajeros olvidados' },
  { url: 'https://fundacionazara.org.ar/coleccion-ciencia-para-todos/', patron: 'contenedor-por-libro', coleccion: 'Ciencia para todos' },
  { url: 'https://fundacionazara.org.ar/guia-de-las-reservas-naturales-de-la-argentina/', patron: 'imagenes-sueltas', coleccion: 'Guía de las reservas naturales de la Argentina' },
  { url: 'https://fundacionazara.org.ar/fauna-argentina-amenazada/', patron: 'imagenes-sueltas', coleccion: 'Fauna argentina amenazada' },
  { url: 'https://fundacionazara.org.ar/los-invertebrados-fosiles/', patron: 'pdfs-romanos', coleccion: 'Los invertebrados fósiles' },
  { url: 'https://fundacionazara.org.ar/trazos-nativos-diseno-iconografico-de-las-sierras-de-cordoba-serie-infantil-para-colorear/', patron: 'imagenes-sueltas', coleccion: 'Trazos nativos. Diseño iconográfico de las sierras de Córdoba' }
];
```

**Nota:** las URLs exactas deben confirmarse en implementación (recuperar del estado real de los
JSON y/o del listado de la categoría). En una primera pasada se puede inspeccionar cada página
para confirmar patrón y URL.

Flujo en `scrapearCategoria` (bifurcación ADITIVA + degradación segura):
- Para cada URL de la categoría:
  - Si está en `COLECCIONES_CONOCIDAS` → `obtenerDatosColeccion(page, coleccion)` → array de libros.
    - Si devuelve ≥1 libro → `push(...libros)`.
    - Si devuelve 0 (el patrón no matcheó) → **degradación segura**: `obtenerDatosLibro(page, url)`
      (comportamiento original) + log de advertencia. Nunca se inventan datos.
  - Si NO está en la lista → `obtenerDatosLibro(page, url)` — ruta original INTACTA.
- La lógica original de libro único no se toca: esto es una extensión aditiva + fallback en cascada.

### 4.2 Extractores por patrón

Se agrega `obtenerDatosColeccion(page, coleccion)` que hace `switch (coleccion.patron)` y delega:

#### a) Patrón `pares-h4-pdf` (Voces ancestrales)
- **Agrupar por bloque contenedor**: cada libro vive en un contenedor Elementor que tiene TODO
  junto — `h4` (título) + `img` (portada) + `a[href$=".pdf"]` (PDF). NO son bloques alternados.
- Criterio robusto de colección: **>1 `a[href$=".pdf"]`** en la página.
- Cada contenedor con h4+img+PDF = 1 libro. El primer H4 puede ser el título genérico de la saga
  (sin PDF adyacente) → detectar y descartar.
- Extraer `id`, `titulo`, `linkPdf`, `imagenPortada`, `fechaExtraccion`, `coleccion`.

#### b) Patrón `contenedor-por-libro` (Viajeros olvidados / Ciencia para todos)
- Cada libro está en `div.elementor-widget-wrap.elementor-element-populated` que contiene:
  `1 img` + `h4>strong` (título) + `p` (autor, año — formato "Autor, Año.").
- Seleccionar todos esos contenedores con presencia de `h4` (y opcional `img`).
- **Limpieza de título (crítico para Ciencia para todos):** el `h4>strong` puede contener un
  `<br>` (ej: "Calentamiento global. Un cambio climático anunciado<br>"). Limpiar con
  `textContent.replace(/\s+/g,' ').trim()` y eliminar `<br>` residual.
- `autor`/`anio` desde el `p` siguiente al `h4`. **OJO con el prefijo de editorial**: algunos
  `<p>` traen `"Editorial Albatros | Juan Bautista Ambrosetti, 2008."` — **limpiar el prefijo
  `Editorial X | `** (split por `|`, quedarse con la segunda parte) ANTES de aplicar el regex
  `^(.+?),\s*(\d{4})` (mismo patrón actual).
- `linkPdf`: `a[href$=".pdf"]` dentro del contenedor (si existe; en estas colecciones suele ser null).
- **Deduplicar contenedores (verificado 2026-09-07):** en Ciencia para todos, el contenedor del
  primer libro aparece DUPLICADO (2 contenedores con el mismo h4+img; 4 contenedores h4+img pero
  solo 3 imágenes únicas). → dedup por `h4`/texto de título o por `imagenPortada` ANTES de generar
  los libros. "1 contenedor = 1 libro" cuenta contenedores ÚNICOS.

#### c) Patrón `div-titulos-carrousel` (Viajeros Patagonia) — VALIDADO 2026-09-07 con Playwright
- Los títulos/autor/año están **todos en UN `div.elementor-widget-container`** como lista de `<p>`:
  `<p><strong>TITULO</strong><br>AUTOR, AÑO.</p>`.
- **Verificado:** 23 títulos en `p>strong`, 23 autores/años. El primer `p` de la lista NO tiene
  `strong` → es la intro de la colección ("Ediciones Continente | Veintitrés títulos publicados
  entre los años 2005 y 2008.") y se descarta solo.
- **Título:** `strong.textContent`. **Autor/año:** `p.textContent − strong.textContent` =
  "Autor, AÑO." → regex `^(.+?),\s*(\d{4})` directo (NO regex sobre el párrafo completo).
- Las portadas viven en un **carrousel owl-carousel** — NO indexar por orden:
  - **El orden del carrousel NO coincide con el del div de títulos** (verificado: primera img del
    carrousel = "Cautivo-en-la-Patagonia", primer título del div = "Aborígenes de la Patagonia")
    → **emparejar por índice está PROHIBIDO en este patrón**.
  - El owl-carousel en loop **duplica slides** (clones): 48 imgs para 23 libros → **deduplicar
    por `src`/filename** antes de usar.
  - `alt` está vacío en TODAS las imgs → no sirve como fuente de título.
- **Emparejamiento por filename (validado):** el filename embebe el título
  (`.../coleccion-viajeros-y-exploradores-de-la-Patagonia-Cautivo-en-la-Patagonia.jpg` →
  "Cautivo en la Patagonia"). Normalizar ambos lados (lowercase, sin acentos, sin puntuación) y
  matchear filename-limpio ↔ título-limpio.
  - Match → portada segura. Sin match → caer a estrategia híbrida §4.2-d (`revisionPendiente`).
- Sin linkPdf (no hay PDFs).

#### d) Estrategia híbrida (fallback ante cruce frágil)
Si el emparejamiento por filename (patrón c) no da match para alguna portada, o el conteo
contenedor vs PDFs no cuadra (patrón a), **NO inventar cruces** — crear **un objeto por portada**
(`id`, `imagenPortada`, `coleccion`) y marcar `revisionPendiente: true` (resto de campos `null`).
El humano completa título/autor/año manualmente después vía PR. Cada libro queda como registro único.

**Título provisorio desde el NOMBRE DE ARCHIVO de la portada** (NO del `alt`, que suele estar vacío):
- Ej: `coleccion-viajeros-y-exploradores-de-la-Patagonia-Navegantes-ingleses-en-los-canales-fueguinos.jpg` → "Navegantes ingleses en los canales fueguinos".
- Limpiar el prefijo de la colección y el sufijo de resolución de WordPress (ej. `-300x258`).
- Aún así, marcar `revisionPendiente` — el filename es provisorio, no una fuente confiable al 100%.

#### e) Patrón `imagenes-sueltas` (Guía de reservas / Fauna amenazada) — VALIDADO 2026-09-07
- Páginas SIN títulos de libro en el DOM: solo H4 de saga/subcolección, `alt` vacío, sin captions,
  filenames solo numéricos (`guia-...-01-550-232x200.jpg`, `los-que-se-van-001.jpg`).
- El scraper NO puede saber qué edición es cada una (esa info no existe en la página) → **esqueletos
  + revisión humana**, nunca inferir títulos:
  1. Extraer TODAS las imágenes de contenido (excluir logo/banner/svg).
  2. **Dedup por `src`**: Guía usa carrousel Qode que duplica (13 imgs → 5 únicas, verificado);
     Fauna tiene 4 únicas. 1 imagen única = 1 libro.
  3. Por cada imagen única: `id`, `imagenPortada`, `coleccion`, `autor` (del único `<p>` de la serie
     tras limpiar `Editorial X | ` — serie Chebez en ambos casos), `anio: null` (rango "2005-2006"
     no cabe en el modelo), `fechaExtraccion`, `revisionPendiente: true`.
  4. **Título provisorio desde el filename** para identificación humana en el portal de revisión:
     Guía → `Tomo 01`...`Tomo 05` (orden por número del filename); Fauna → `Los que se van 001`/002/003
     y `Otros que se van` (subcolección desde el H4 del contenedor de la imagen). Siempre `revisionPendiente`.
  5. Fauna: `coleccion` con subcolección desde el H4 del contenedor:
     `"Fauna argentina amenazada: Los que se van"` (3 libros) y `"Fauna argentina amenazada: Otros que se van"` (1). `"Guía de las reservas naturales de la Argentina"` (5 libros, sin subcolección).
- El humano completa los títulos reales vía PR (9 libros: 5 + 4); `validar-data.js` los lista (§6).
- Sin linkPdf (no hay PDFs).

#### e2) Trazos nativos (8 libros + 1 imagen huérfana) — VALIDADO 2026-09-08
- Mismo patrón `imagenes-sueltas` (UN H4 de saga, alt vacío, 0 PDFs, carrousel Qode con clones):
  galería `qode-aig-image` con 18 imgs en DOM = 9 srcs únicos (clones owl comparten `src` → dedup por
  src alcanza, NO hace falta hash de contenido).
- **8 libros confirmados** (subtítulos reales SOLO en la cabeza del humano, no en el DOM): N1
  "Rostros para colorear" (Trazos-nativos.jpg, la única 2020 sin numeral + og:image) y N2-N8
  (`Trazos-nativos-02..08.jpg` con numeral). Orden del carrousel NO numérico (empieza 06) → los
  subtítulos se completan vía PR, nunca por orden de aparición.
- **1 imagen huérfana**: `trazos-nativos-disenos-iconograficos-de-las-sierras-de-cordoba.jpg`
  (2019/04, sin numeral, same artwork probable de N1 por bytes ≠) → entra como esqueleto con
  `revisionPendiente: true` y marca "¿portada previa del N1? verificar en PR" (mem #9: no inferir).
- Neto esperado con Trazos: 8 libros (7 nuevos).

#### f) Patrón `pdfs-romanos` (Los invertebrados fósiles) — VALIDADO 2026-09-08
- Página con 1 solo H4 ("Los invertebrados fósiles") SIN h4-con-imagen, y **N `a[href$=".pdf"]`
  cuyo filename termina en numeral romano**: `invertebrados-fosiles-I.pdf`, `invertebrados-fosiles-II.pdf`
  (verificado + 2 imágenes `-01.jpg`/`-02.jpg` sin valor para el título).
- N PDFs romanos = N tomos. Título individual: `"${h4} Tomo ${numeral}"` derivado del filename
  del PDF (`I`, `II`, ...) → **NO requiere revisión humana para el título** (a diferencia de e).
- `linkPdf` = href de cada PDF; `imagenPortada` = asociado por índice de aparición con las imágenes
  únicas de la página (01→I si el orden coincide; verificar orden en implementación).
- No tocar = no hay más PDFs que los N tomos.

### 4.3 Fallback genérico

Si la página tiene >1 `a[href$=".pdf"]`, >1 contenedor img+h4, o **>1 imagen de contenido única**
(no-logo/banner/svg) **pero no está en la lista**, el scraper **loguea la URL como "posible colección
no catalogada"** y deja la entrada como un libro único (actual), para que un humano la revise. NO
desglosa automáticamente URLs no aprobadas (evita falsos positivos / datos basura).

---

## 5. Casos 5 y 6: esqueletos semiautomáticos + completar títulos (sin comando peligroso)

### 5.1 IDs y dedup
- El ID se genera con `generarId()` existente (scraper-playwright.js:56): `lib-` + 8 chars aleatorios.
- Es aleatorio, no derivado → **riesgo de colisión despreciable**.
- Los esqueletos los genera el scraper (patrón `imagenes-sueltas`, §4.2-e): 1 objeto por imagen
  única, con portada + colección + `revisionPendiente`. NO se crean objetos a mano desde cero.

### 5.2 Completar títulos (control por review, no por comando runtime)
- Los JSON son **archivos versionables en git**. Completar un título = editar el campo `titulo` del
  esqueleto (+ quitar `revisionPendiente`) + commit + PR con review.
- **NO se crea un comando genérico de create/update/delete de libros** (el riesgo que te preocupa).
- Los títulos a completar (datos reales de la serie):
  - **Guía de las reservas naturales de Argentina** → 5 tomos por región; `anio` en rango
    ("2005-2006") no cabe en el modelo → queda `anio: null` + `revisionPendiente`; destacar en revisión.
  - **Los que se van** (Anfibios y Reptiles / Aves / Mamíferos — 3 libros) y **Otros que se van**
    (1 libro). Serie de Chebez, 2008.

### 5.3 Gate de revisión manual (regla del usuario, mem #9)
Ante datos inciertos o incompletos (ej. años en rango, ediciones que solo existen como imagen sin
título extraíble), **NO inventar**: dejar los campos conocidos y **marcar el registro** (ej.
campo `"revisionPendiente": true`) o documentarlo en el PR para validación humana.

---

## 6. Comando de validación solo-lectura (seguro, no muta)

Se agrega un script `backend/scripts/validar-data.js` y un npm script `validar:data`.
**NO escribe nada** — solo inspecciona los JSON y reporta:

- **IDs duplicados** entre categorías y dentro de cada una.
- **URLs duplicadas** (misma `imagenPortada` y/o `linkPdf` repetida) → alerta de posible duplicado.
- **Formato inválido** por objeto (campos requeridos, tipos correctos, `anio` numérico).
- **`coleccion` consistentes** (si hay `coleccion`, no debe estar vacía).
- **Portal de revisión humana:** listar los libros con `titulo` vacío o `revisionPendiente: true`
  (los híbridos de patrones frágiles) → es la lista exacta de lo que queda por completar a mano.
- Resumen: nº de libros por categoría, nº con PDF, nº con `revisionPendiente`, nº sin título.

Salida: exit code 0 si OK, 1 si hay problemas, con lista detallada.

**Tradeoff documentado:** el comando valida pero no corrige automáticamente (corregir es trabajo
del humano vía git + PR, lo que mantiene el control y evita mutaciones accidentalmente destructivas).

---

## 7. Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `backend/scripts/scraper-playwright.js` | Extender: `COLECCIONES_CONOCIDAS`, `obtenerDatosColeccion`, funciones por patrón, detección en `scrapearCategoria`. NO reescritura total. |
| `backend/scripts/validar-data.js` | **Nuevo** comando de validación solo-lectura. |
| `backend/package.json` | Añadir script `validar:data`. |
| `backend/src/data/libros-infantiles.json` | Re-scrapear/desglosar Voces ancestrales (12 libros). |
| `backend/src/data/libros-historia-de-la-ciencia.json` | Desglosar Viajeros Patagonia + Viajeros olvidados. |
| `backend/src/data/libros-divulgacion-cientifica.json` | Desglosar Ciencia para todos. |
| `backend/src/data/libros-areas-naturales.json` | Re-scrapear con `imagenes-sueltas` (5 esqueletos) + completar títulos vía PR. |
| `backend/src/data/libros-flora-y-fauna.json` | Re-scrapear con `imagenes-sueltas` (4 esqueletos) + completar títulos vía PR. |
| `backend/src/routes/libros.js` | Revisar si se quiere exponer filtro por `coleccion` (opcional, definido en implementación). |
| `discord-bot/src/index.js` | Mostrar "Perteneciente a (coleccion)" en el detalle del `/libro` cuando el libro tenga el campo `coleccion`. |

### Scripts de referencia (NO modificar)
`backend/scripts/scraper-cheerio-old.js`, `extraerLibros.js`, `convertirCarrousel.js` son
solo para estudio; no intervienen en el scraping. **No tocarlos.**

---

## 8. Pasos de implementación

1. **Barrido read-only unificado (paso 0):** (a) confirmar con Playwright las URLs reales y el patrón
   de cada colección candidata ANTES de fijar `COLECCIONES_CONOCIDAS`; (b) recorrer las categorías de
   a una (por recursos de la máquina) y por cada página reportar 4 clasificaciones: `normal`,
   `pdf-fantasma` (href con `'` corregible), `posible-coleccion` (>1 h4 CON imagen asociada — h4 de
   sección tipo "Recursos para descargar" NO cuentan — o >1 imagen única, URL no
   listada → candidata a `COLECCIONES_CONOCIDAS`) y `ambos`. Así se dimensionan los **PDFs fantasma**
   (con su URL corregida) y los **libros fantasma** (colecciones colapsadas en 1 entrada) SIN mirar
   los JSON (no guardan URL). La clasificación es heurística: muestra de h4s/filenames para
   confirmación humana (mem #9), nada se agrega solo. Cero escritura. Piloto: flora-y-fauna.
2. Implementar `obtenerDatosColeccion` + extractores por patrón (a, b, c) en el scraper.
3. Integrar la detección en `scrapearCategoria` (lista aprobada → desglose; no aprobada → logueo).
4. Implementar `validar-data.js` (solo-lectura) + script npm.
5. Re-scrapear las 6 colecciones en sus categorías (voces, viajeros patagonia, viajeros olvidados,
   ciencia para todos, guía de reservas, fauna amenazada).
6. Completar títulos de los 9 esqueletos (5 guía + 4 fauna) vía PR + quitar `revisionPendiente`.
7. Correr `validar:data` → verificar 0 duplicados y consistencia.
8. Verificación funcional de la API (GET /api/libros?busqueda=...) y del comportamiento del bot.
9. PR + review.

---

## 9. Verificación / aceptación

- Cada colección automatizada queda desglosada en N libros individuales con sus metadatos.
- `validar:data` no reporta IDs ni URLs duplicadas.
- Los casos 5 y 6 quedan como libros individuales (esqueletos) con sus IDs y portadas, sin duplicar
  la portada suelta previa, y con `revisionPendiente` hasta completar títulos.
- La API devuelve los libros desglosados (buscar por subtítulo/título individual).
- Los casos límite quedan marcados para revisión humana, no inventados.
- Los libros desglosados de patrones frágiles quedan como registros únicos (con al menos portada + id), aunque algunos campos queden pendientes de revisión manual.

---

## 10. Riesgos y notas

- ~~Fragilidad del patrón B (carrousel separado)~~ — **RESUELTO 2026-09-07:** la inspección confirmó
  que el orden del carrousel NO coincide con el del div de títulos (el temor era válido), pero el
  emparejamiento por **filename** (título embebido en el nombre del archivo + dedup de clones owl)
  resuelve el cruce sin depender del orden. El emparejamiento por índice queda explícitamente
  descartado en §4.2-c. Los cruces sin match caen a la estrategia híbrida (§4.2-d), nunca a manual.
- **Años en rango** (2005-2006 de Guía de reservas): no hay tipo "rango" en el modelo; decidir en
  implementación si normalizar a un año representativo o documentar con `revisionPendiente`.
- **Duplicado de imágenes/contenedores**: Otros que se van aparece dos veces en el HTML; también el
  contenedor del 1er libro de Ciencia para todos está duplicado (verificado 2026-09-07). Al
  desglosar/añadir, deduplicar por `h4`/título o `imagenPortada` → un solo registro por libro.
- **Preferencia del usuario (mem #9):** ante dudas de datos, detenerse y consultar, no inventar.
- **Futuro VPS (diferido, NO ahora):** si el scraper se automatiza en una VPS, las correcciones
  humanas se pisan (hoy reemplaza todo el JSON, scraper-playwright.js:223). Solución futura = capa
  de overrides que gana en lectura + **id determinístico** (hoy `generarId()` es aleatorio; migración
  one-shot de los 267 ids). Documentado aquí para cuando llegue; NO se cambia la generación de id
  en esta iteración (decisión 2026-09-07).
- No inventar cruces imagen↔título inciertos; desglosar por portada y completar a mano
  (decisión 2026-09-04) — ver estrategia híbrida §4.2-d.

11. Nueva problemática: "Links fantasma" (PDFs no capturados)
11.1 Casos detectados (3)
#	Libro	Categoría	Enlace real	Por qué falla
7	Cetáceos del Golfo San Jorge	Flora-fauna	.../cetaceos-del-golfo-san-jorge.pdf'	href termina en ', no .pdf
8	Medicina en quelonios	Flora-fauna	.../medicina-de-quelonios.pdf'	Ídem
9	Aves: vida y conducta	Flora-fauna	issuu.com/... (flipbook)	No termina en .pdf, host externo sin descarga
11.2 Root cause (casos 7 y 8)
El sitio renderiza href="...pdf'" (apóstrofo HTML ' pegado al final). El selector a[href$=".pdf"] exige que el href termine en .pdf → no matchea → linkPdf: null.
Fix de scraper (bajo riesgo): normalizar el href antes del match:
- Buscar `a[href*=".pdf"]` (que contenga .pdf, no solo que termine).
- Limpiar el href de ' / comillas / espacios finales antes de guardarlo.
- **Precisión (C.11):** con Playwright/browser, el `&#039;` ya llega decodificado a apóstrofo literal
  (`'`) en `el.href` — NO buscar la entidad HTML, limpiar el `'` literal del final.
- Resultado: ...cetaceos-del-golfo-san-jorge.pdf' → ...cetaceos-del-golfo-san-jorge.pdf.
11.3 Caso 9 (Issuu) — decisión
NO se agrega un campo nuevo estructural (linkLectura) porque solo aplica a casos aislados de 200+ libros (sobre-ingeniería). Se trata como caso manual puntual (documentar/organizar por fuera, sin tocar el modelo).
11.4 Barrido de dimensionamiento (nuevo paso, read-only) — ampliado a LIBROS fantasma 2026-09-07
Antes de implementar, un script read-only que recorra las categorías de a una (por recursos de la
máquina) e inspeccione CADA página, reportando 4 clasificaciones: `normal`, `pdf-fantasma` (href
con ' → URL corregida), `posible-coleccion` (>1 h4 o >1 imagen única → colección colapsada en 1
entrada, candidata a COLECCIONES_CONOCIDAS) y `ambos`. No usa los JSON (no guardan URL). Salida:
lista de PDFs corregibles + inventario de libros fantasma descubiertos, con muestra de h4s/filenames
para confirmación humana. Cero escritura.
**Resultado piloto flora-y-fauna (2026-09-07):** 63 URLs → 60 normales, 2 pdf-fantasma
(cetaceos-del-golfo-san-jorge.pdf' y medicina-de-quelonios.pdf'), 1 posible-coleccion
(fauna-argentina-amenazada, EN LISTA ✅). Aves: vida y conducta y Moluscos marinos sin href .pdf
→ candidatos Issuu/sin descarga (revisar en el fix). Pendiente: agregar señal `a[href*="issuu.com"]`
al barrido para las próximas categorías.
**Resultado barrido 5 categorías (2026-09-08):** divulgación (1), evolución-genética (5),
patrimonio-cultural (5), infantiles (8), astronomía (9) → 28 páginas, 25 normales, 0 pdf-fantasma,
3 posible-coleccion (2 EN LISTA ✅: Ciencia para todos con 3 libros — ojo: sin hrefs .pdf en esa
página, los 3 libros quedarían sin linkPdf — y Voces ancestrales con 12; 1 FALSO POSITIVO:
Análisis multivariado "recursos para descargar" es H4 de sección, NO otro libro → regla endurecida
>1 h4 CON imagen asociada). Pendiente: 6 categorías (institucionales 10, ambiente 12, paleontología
17, áreas naturales 21, antropología 29, historia de la ciencia 35, auspicados aparte).
**Resultado barrido 6 categorías (2026-09-08):** 130 páginas (10+12+19+22+31+36), 126 normales,
0 pdf-fantasma, 4 posible-coleccion (3 EN LISTA ✅: Viajeros Patagonia 23, Viajeros olvidados 3,
Guía de reservas 5; 1 NUEVO CANDIDATO ⚠️: "Los invertebrados fósiles" en paleontología — 2 PDFs
estrictos + 2 imágenes únicas, h4ConImg 0 → VERIFICAR humano: ¿1 libro con 2 PDFs o 2 volúmenes? NO
agregar a la lista sin confirmar). Más URLs que JSON en 4 categorías (paleontología 19 vs 17,
antropología 31 vs 29, áreas 22 vs 21, historia-ciencia 36 vs 35) → el re-scrapeo captura los
faltantes. Libros en 2 categorías detectados (Una reserva natural para cada ciudad, Arqueología y
paleontología de Catamarca, Entre lo visible y lo invisible, Félix de Azara, La paleontología de los
vertebrados). **CATÁLOGO PDFs FANTASMA CERRADO: solo 2 en todo el sitio. INVENTARIO LIBROS FANTASMA
CERRADO: 6 colecciones colapsadas = 50 libros reales en 6 entradas (44 ocultos): ciencia 3, voces
12, viajeros olvidados 3, patagonia 23, guía 5, fauna 4.**
**Resultado barrido Auspiciados (2026-09-08):** 52 páginas → 51 normales, 0 pdf-fantasma, 0 errores,
1 POSIBLE COLECCIÓN ⚠️: "Trazos nativos. Diseño iconográfico de las sierras de Córdoba (serie
infantil para colorear)" — 6 imágenes únicas (`Trazos-nativos.jpg` + `-02..-08`), 0 h4-con-img,
0 PDFs → candidato a patrón `imagenes-sueltas`, VERIFICAR humano (¿6 coloreables por sierra?).
**CONFIRMADO por humano + inspección: Los invertebrados fósiles = colección de 2 tomos** (I y II,
filename de PDF con numeral romano) → 7ª colección, patrón `pdfs-romanos` (§4.2-f). **Trazos
nativos (barrido Auspiciados) VALIDADO como 8ª colección**: 8 libros + 1 imagen huérfana de 2019
(§4.2-e2), subtítulos solo en PR. **NETO TOTAL ESPERADO: 319 libros (267 + 52: +2 ciencia, +11 voces,
+2 olvidados, +22 patagonia, +4 guía, +3 fauna, +1 invertebrados, +7 trazos). OJO: si la imagen
huérfana fuera un 9º libro real → 320.**