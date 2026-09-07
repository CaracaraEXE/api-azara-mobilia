# Plan: Desglose de Colecciones en el Scraper de Libros (Fundación Azara)

**Fecha:** 2026-09-04
**Estado:** Propuesto (Plan mode, pendiente de aprobación para implementar)
**Rol:** Solo planificación — no se modifica código en esta etapa.

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
| 5 | Guía de las reservas naturales de Argentina | Áreas naturales | Solo título saga + carrousel 5 portadas SIN texto | No | ❌ Manual |
| 6 | Fauna argentina amenazada (Los que se van / Otros que se van) | Flora-fauna | 3 imágenes columna + texto parcial + contenedor duplicado | No | ❌ Manual |

### Decisión de filosofía (definida con el usuario)
**Automatizar todo lo automatizable** (patrones 1-4, con la lista aprobada de URLs).
**Ir a manual SOLO en los casos específicos/límite** (5 y 6, y cualquiera que aparezca), porque
no vale la pena torcer la lógica interna del scraper por un par de casos aislados, y habilitar un
comando genérico de modificación de datos es un riesgo (cae en manos de gente que no administra la base).

---

## 2. Objetivo

1. Que el scraper **detecte páginas de colección** y **desglose N libros individuales** por página,
   en lugar de capturar solo el primero.
2. Que cada libro desglosado sea un **registro propio** en el JSON/API, con sus metadatos
   (título, autor, año, portada, PDF cuando exista).
3. Que los **casos límite** (5 y 6) se puedan **añadir manualmente** como objetos JSON, con su ID
   propio, sin duplicaciones ni fallos.
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
  "coleccion": "Viajeros y exploradores de la Patagonia",
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
  { url: 'https://fundacionazara.org.ar/voces-ancestrales-de-los-valles-calchaquies/', patron: 'pares-h4-pdf', coleccion: 'Voces ancestrales de los Valles Calchaquíes' },
  { url: 'https://fundacionazara.org.ar/coleccion-viajeros-y-exploradores-de-la-patagonia/', patron: 'div-titulos-carrousel', coleccion: 'Colección: Viajeros y exploradores de la Patagonia' },
  { url: 'https://fundacionazara.org.ar/coleccion-viajeros-olvidados/', patron: 'contenedor-por-libro', coleccion: 'Colección: Viajeros olvidados' },
  { url: 'https://fundacionazara.org.ar/coleccion-ciencia-para-todos/', patron: 'contenedor-por-libro', coleccion: 'Colección: Ciencia para todos' },
];
```

**Nota:** las URLs exactas deben confirmarse en implementación (recuperar del estado real de los
JSON y/o del listado de la categoría). En una primera pasada se puede inspeccionar cada página
para confirmar patrón y URL.

Flujo en `scrapearCategoria`:
- Al obtener las URLs de la categoría, para cada URL que coincida con `COLECCIONES_CONOCIDAS`
  se invoca `obtenerDatosColeccion(page, coleccion)` en vez de `obtenerDatosLibro`.
- La función devuelve un **array de libros**; se hace `push(...libros)` al array de la categoría.

### 4.2 Extractores por patrón

Se agrega `obtenerDatosColeccion(page, coleccion)` que hace `switch (coleccion.patron)` y delega:

#### a) Patrón `pares-h4-pdf` (Voces ancestrales)
- Recorrer bloques alternados. Criterio robusto: si hay **>1 `a[href$=".pdf"]`** → colección con PDFs.
- Cada libro = un H4 (título) + su PDF adyacente.
- Primer H4 puede ser el título genérico de la saga (sin PDF) → detectar y descartar.
- Extraer `id`, `titulo`, `linkPdf`, `imagenPortada` (la portada del bloque), `fechaExtraccion`,
  `coleccion`.

#### b) Patrón `contenedor-por-libro` (Viajeros olvidados / Ciencia para todos)
- Cada libro está en `div.elementor-widget-wrap.elementor-element-populated` que contiene:
  `1 img` + `h4>strong` (título) + `p` (autor, año — formato "Autor, Año.").
- Seleccionar todos esos contenedores con presencia de `h4` (y opcional `img`).
- **Limpieza de título (crítico para Ciencia para todos):** el `h4>strong` puede contener un
  `<br>` (ej: "Calentamiento global. Un cambio climático anunciado<br>"). Limpiar con
  `textContent.replace(/\s+/g,' ').trim()` y eliminar `<br>` residual.
- `autor`/`anio` desde el `p` siguiente al `h4`, regex `^(.+?),\s*(\d{4})` (mismo patrón actual).
- `linkPdf`: `a[href$=".pdf"]` dentro del contenedor (si existe; en estas colecciones suele ser null).

#### c) Patrón `div-titulos-carrousel` (Viajeros Patagonia)
- Los títulos/autor/año están **todos en UN `div.elementor-widget-container`** como lista de `<p>`:
  `<p><strong>TITULO</strong><br>AUTOR, AÑO.</p>`.
- Las portadas están **separadas en un carrousel**, con el título embebido en la imagen.
- Estrategia:
  1. Extraer todos los `p>strong` del div de títulos → títulos; y los `p` → autor/año.
  2. Extraer las imágenes del carrousel.
  3. Emparejar por **índice** (img[i] ↔ título[i]).
  4. **Validación:** si el `alt`/texto embebido de la imagen coincide con el título esperado, ok;
     si no, loguear advertencia y marcar el libro para revisión (no inventar datos).
- Sin linkPdf (no hay PDFs).

Añadir estrategia híbrida como alternativa:
Estrategia híbrida (fallback ante cruce frágil): si el emparejamiento por índice no es fiable, crear un objeto por portada (id, imagenPortada, coleccion, titulo provisorio desde la imagen si es extraíble, resto null / revisionPendiente). El humano completa título/autor/año manualmente después. Cada libro queda como registro único.

### 4.3 Fallback genérico

Si la página tiene >1 `a[href$=".pdf"]` o >1 contenedor img+h4 **pero no está en la lista**, el
scraper **loguea la URL como "posible colección no catalogada"** y deja la entrada como un libro
único (actual), para que un humano la revise. NO desglosa automáticamente URLs no aprobadas
(evita falsos positivos / datos basura).

---

## 5. Adición manual de casos límite (5 y 6) — sin comando peligroso

### 5.1 IDs y dedup
- El ID se genera con `generarId()` existente (scraper-playwright.js:56): `lib-` + 8 chars aleatorios.
- Es aleatorio, no derivado → **riesgo de colisión despreciable** al añadir manualmente.
- Los libros manuales se insertan en el JSON de su categoría como objetos completos: `id` generado,
  `fechaExtraccion`, y campos según corresponda.

### 5.2 Vía manual (control por review, no por comando runtime)
- Los JSON son **archivos versionables en git**. Añadir un libro manual = editar el array del JSON
  + commit + PR con review. La gente sin acceso al repo no puede mutar data, y quien tiene acceso
  pasa por revisión.
- **NO se crea un comando genérico de create/update/delete de libros** (el riesgo que te preocupa).
- Los casos a añadir manualmente, con sus datos reales:
  - **Guía de las reservas naturales de Argentina** → 5 libros (año "2005-2006" → normalizar anio o
    manejar rango; destacar este matiz en revisión).
  - **Los que se van** (Anfibios y Reptiles / Aves / Mamíferos — 3 libros) y **Otros que se van**
    (1 libro). Pertenecen a la saga editorial de Chebez, 2008.

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
- **`coleccion` consistentes** (si hay `coleccion`).
- Resumen: nº de libros por categoría, nº con PDF, nº con `revisionPendiente`.

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
| `backend/src/data/libros-areas-naturales.json` | Añadir manualmente Guía de reservas naturales (5 libros). |
| `backend/src/data/libros-flora-y-fauna.json` | Añadir manualmente Los que se van (3) + Otros que se van (1). |
| `backend/src/routes/libros.js` | Revisar si se quiere exponer filtro por `coleccion` (opcional, definido en implementación). |

### Scripts de referencia (NO modificar)
`backend/scripts/scraper-cheerio-old.js`, `extraerLibros.js`, `convertirCarrousel.js` son
solo para estudio; no intervienen en el scraping. **No tocarlos.**

---

## 8. Pasos de implementación

1. **Confirmar URLs reales** de cada colección (inspección con Playwright, solo lectura) y validar
   el patrón de cada una antes de fijar `COLECCIONES_CONOCIDAS`.
2. Implementar `obtenerDatosColeccion` + extractores por patrón (a, b, c) en el scraper.
3. Integrar la detección en `scrapearCategoria` (lista aprobada → desglose; no aprobada → logueo).
4. Implementar `validar-data.js` (solo-lectura) + script npm.
5. Re-scrapear las 4 colecciones automatizables (voces, viajeros patagonia, viajeros olvidados,
   ciencia para todos) en sus categorías.
6. Añadir manualmente los casos 5 y 6 en sus JSON (Guía de reservas; Los que se van / Otros que se van).
7. Correr `validar:data` → verificar 0 duplicados y consistencia.
8. Verificación funcional de la API (GET /api/libros?busqueda=...) y del comportamiento del bot.
9. PR + review.

---

## 9. Verificación / aceptación

- Cada colección automatizada queda desglosada en N libros individuales con sus metadatos.
- `validar:data` no reporta IDs ni URLs duplicadas.
- Los casos 5 y 6 quedan como libros individuales con sus IDs, sin duplicar la portada suelta previa.
- La API devuelve los libros desglosados (buscar por subtítulo/título individual).
- Los casos límite quedan marcados para revisión humana, no inventados.
- Los libros desglosados de patrones frágiles quedan como registros únicos (con al menos portada + id), aunque algunos campos queden pendientes de revisión manual.

---

## 10. Riesgos y notas

- **Fragilidad del patrón B (carrousel separado):** el emparejamiento por índice puede fallar si el
  orden del carrousel difiere del div de títulos. Mitigación: validación por coincidencia de texto +
  logueo/marcado para humana revisión. Si en inspección se confirma que no coincide, degradar este
  caso a **manual**.
- **Años en rango** (2005-2006 de Guía de reservas): no hay tipo "rango" en el modelo; decidir en
  implementación si normalizar a un año representativo o documentar con `revisionPendiente`.
- **Duplicado de imágenes** (Otros que se van aparece dos veces en el HTML): al añadir manual,
  asegurar un solo registro.
- **Preferencia del usuario (mem #9):** ante dudas de datos, detenerse y consultar, no inventar.
No inventar cruces imagen↔título inciertos; desglosar por portada y completar a mano (decisión 2026-09-04).

11. Nueva problemática: "Links fantasma" (PDFs no capturados)
11.1 Casos detectados (3)
#	Libro	Categoría	Enlace real	Por qué falla
7	Cetáceos del Golfo San Jorge	Flora-fauna	.../cetaceos-del-golfo-san-jorge.pdf'	href termina en ', no .pdf
8	Medicina en quelonios	Flora-fauna	.../medicina-de-quelonios.pdf'	Ídem
9	Aves: vida y conducta	Flora-fauna	issuu.com/... (flipbook)	No termina en .pdf, host externo sin descarga
11.2 Root cause (casos 7 y 8)
El sitio renderiza href="...pdf'" (apóstrofo HTML ' pegado al final). El selector a[href$=".pdf"] exige que el href termine en .pdf → no matchea → linkPdf: null.
Fix de scraper (bajo riesgo): normalizar el href antes del match:
- Buscar a[href*=".pdf"] (que contenga .pdf, no solo que termine).
- Limpiar el href de ' / comillas / espacios finales antes de guardarlo.
- Resultado: ...cetaceos-del-golfo-san-jorge.pdf' → ...cetaceos-del-golfo-san-jorge.pdf.
11.3 Caso 9 (Issuu) — decisión
NO se agrega un campo nuevo estructural (linkLectura) porque solo aplica a casos aislados de 200+ libros (sobre-ingeniería). Se trata como caso manual puntual (documentar/organizar por fuera, sin tocar el modelo).
11.4 Barrido de dimensionamiento (nuevo paso, read-only)
Antes de implementar, un script read-only que recorra los libros sin linkPdf (77 en total, ~25 candidatos tras excluir los 52 legítimos de Auspiciados) e inspeccione sus páginas para identificar cuáles tienen un PDF real no capturado (con/sin '). Salida: lista de libros fantasma con su URL de PDF corregida. Cero escritura.