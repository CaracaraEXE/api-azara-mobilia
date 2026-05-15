<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Context — API Azara

API REST + Discord Bot para catalogar libros de la Fundación Azara (fundacionazara.org.ar).

## Current State (May 2026)

- ✅ **13/13 categorías scrapeadas** — 267 libros total, 190 con PDF descargable (71.2%)
- ✅ API Express.js funcionando con endpoints GET
- ✅ Scraper optimizado en branch `optimization`

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Express.js (puerto 3000) |
| Storage | JSON por categoría (`data/libros-*.json`) |
| Scraper | **Playwright** (navegador real, evita CloudFlare) |
| Frontend | Discord Bot (pendiente) |

## Scraper — Comandos Útiles

```bash
# Una categoría (usa config por defecto)
npm run scrape-pw

# Una categoría específica
npm run scrape-pw -- --categoria=flora-y-fauna

# Todas las categorías
npm run scrape-todas
```

El scraper:
- Guarda progreso cada **5 libros** (archivo `.temp.json` para resumen si se corta)
- Si no encuentra `<h4>`, busca el título en párrafos como fallback (probado)
- Acepta `--categoria=slug` y `--todas` como argumento CLI

## Gotchas

- **CloudFlare bloquea Axios/Cheerio** (403) — solo Playwright funciona
- **2 categorías tenían URLs incorrectas** originalmente — corregidas manualmente (Exploraciones e Historia/Patrimonio)
- **Auspiciados (52 libros) y Paleontología tienen 0 PDFs** — solo metadata
- El scraper espera 800ms entre libros y 2000ms entre categorías
- `GUARDAR_CADA = 5` en scripts/scraper-playwright.js

## Data Model

```json
{
  "id": "lib-abc123",
  "titulo": "string",
  "linkPdf": "string | null",
  "imagenPortada": "string",
  "autor": "string | null",
  "anio": "number | null",
  "fechaExtraccion": "ISO string"
}
```

## Branches

- `master` / `develop` — versión estable con scraper original
- `optimization` — scraper optimizado con CLI, guardado incremental y fallback (pendiente de merge)
