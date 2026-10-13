# Cacao Media site, v1: design and build contract

Date: 2026-10-10. Status: approved in chat ("ok build it").

## Goal

A real, deployable publication for Cacao Media ("Historias de El Salvador, grano a grano") with a
simulated Cacao Gate. Real payments, CMS, search, accounts, newsletter provider and deploy are out of
scope for v1.

References: dirt.fyi (leads: framed sheet, pill nav, dated feed of big image + headline + dek, promo
cards interleaved), itsnicethat.com (tags, dense archive list), blackbirdspyplane.com (voice,
newsletter prompt).

## Brand rules (Brandbook v1.0, binding)

- Fonts: Bricolage Grotesque 400 / 600 / 800 for everything. JetBrains Mono only for data: prices,
  dates, reading time, coordinates, kickers.
- Colours: Pulpa `#F5EDE3` (main ground, ~55%), Tostado `#2A1912` (text, dark grounds, ~25%),
  Mazorca `#D9902F` (main accent, CTA, ~12%), Criollo `#8C2F2B`, Grano fresco `#5E3050`,
  Chocolate `#5A3221` (~5% combined). Use the CSS variables in `src/styles/global.css`, never raw hex.
- Approved text pairs: Tostado on Pulpa, Pulpa on Tostado, Tostado on Mazorca, Pulpa on Criollo,
  Pulpa on Grano fresco, Pulpa on Chocolate. Never Pulpa on Mazorca. Never Mazorca text on Pulpa at
  body size.
- No shadows, no gradients, no glows, no outlines on the wordmark. Flat colour, rounded shapes.
- Logo: use `src/components/Logo.astro` and `Simbolo.astro` unchanged. Never recolour the symbol.
- Section colour (`--acento` / `--sobre-acento`, set by `data-seccion` on any ancestor):
  cronica = Criollo, guia = Mazorca, cultura = Grano fresco, cafe = Chocolate.
- Copy: Spanish, Salvadoran voseo (pagás, leés, desbloqueá, recibí). Short and direct. Headlines in
  sentence case. Kickers look like `CRÓNICA · EL ZONTE`; data looks like `8 min · 120 sats`.

## Stack

Astro 7, static output, TypeScript strict, plain CSS (scoped `<style>` in components plus
`src/styles/global.css`). No UI framework, no Tailwind, no new dependencies.
`trailingSlash: 'always'`: every internal link ends in `/`.

## Shared foundation (already written, do not edit)

- `src/styles/global.css`: tokens and utilities `.etiqueta`, `.pastilla`, `.boton`,
  `.boton--oscuro`, `.contenedor`, `.solo-lectores`.
- `src/layouts/Base.astro`: props `titulo?`, `descripcion?`, `seccion?`, `imagen?`. Renders the
  framed sheet, header, `<main id="contenido">` with the default slot, footer.
- `src/lib/secciones.ts`: `SECCIONES`, `seccionPorId(id)`, `slugTag(tag)`, types `SeccionId`, `Seccion`.
- `src/lib/formato.ts`: `fechaCorta(date)` gives `6 OCT 2026`, `fechaIso(date)`, `precio(n)` gives `120 sats`.
- `src/lib/historias.ts`: `todasLasHistorias()` (newest first), `historiasDeSeccion(id)`,
  `urlHistoria(h)` gives `/historias/<id>/`, type `Historia`.
- `src/content.config.ts`: collection `historias`.
- `src/lib/rehype-gate.mjs`: everything after `<!-- gate -->` in a story body is rendered inside
  `<div data-gate-cerrado>`.

## Content model

`src/content/historias/<slug>.md`, frontmatter:

| Field | Type | Notes |
|---|---|---|
| `titulo` | string | |
| `bajada` | string | one sentence dek |
| `seccion` | `cronica` \| `guia` \| `cultura` \| `cafe` | |
| `fecha` | date `YYYY-MM-DD` | |
| `autor` | string | placeholder `'[Nombre Apellido]'` |
| `lugar` | string | |
| `coords` | string, optional | `13.49°N · 89.44°W` |
| `minutos` | integer | |
| `precio` | number | default `120`, in satoshis |
| `portada` | string | `/portadas/<file>.svg` in `public/` |
| `alt` | string | |
| `tags` | string[] | |
| `gratis` | boolean | default `false`; free stories have no gate marker |

Paid stories contain exactly one `<!-- gate -->` line after the first two or three paragraphs.
All seed stories are placeholders and say so in an opening blockquote.

## Routes

| Route | File | Content |
|---|---|---|
| `/` | `src/pages/index.astro` | Feed of all stories with promo cards interleaved |
| `/cronicas/`, `/guias/`, `/cultura/`, `/cafe/` | `src/pages/[seccion]/index.astro` | Section header + filtered feed, tinted |
| `/historias/<slug>/` | `src/pages/historias/[slug].astro` | Article + Cacao Gate |
| `/tags/<slug>/` | `src/pages/tags/[tag].astro` | Stories with that tag |
| `/archivo/` | `src/pages/archivo.astro` | Dense list of everything, grouped by year |
| `/acerca/` | `src/pages/acerca.astro` | What Cacao Media is, how the Gate works |
| 404 | `src/pages/404.astro` | |
| `/rss.xml` | `src/pages/rss.xml.ts` | `@astrojs/rss` |

## Cacao Gate (mock) contract

- `src/lib/gate.ts` (browser module, no dependencies):
  - `CLAVE = 'cacao-gate:'`, `DIAS = 7`.
  - Storage: `localStorage[CLAVE + slug] = JSON.stringify({ expira: <epoch ms> })`.
  - `estadoGate(slug, ahora = Date.now()): 'bloqueado' | 'desbloqueado' | 'expirado'`.
    No record = `bloqueado`; record with `expira > ahora` = `desbloqueado`; otherwise `expirado`.
  - `desbloquear(slug, ahora = Date.now()): void` writes a record expiring in 7 days.
  - Every storage access is wrapped in try/catch; on failure behave as `bloqueado`.
- Article root: `<article data-historia="<slug>" data-gate-estado="...">`. Initial server value is
  `bloqueado`, or `gratis` for free stories. Script updates it on load.
- CSS: `[data-gate-cerrado]` is hidden unless the article has
  `data-gate-estado="desbloqueado"`, `"leyendo"` or `"gratis"`.
- Wall: element `[data-gate-muro]` with the split bean, the line
  `Desbloqueá esta <guía|crónica|historia> completa`, `por 120 sats · sin cuenta, sin suscripción`,
  button `[data-gate-boton]` reading `Desbloquear <guía|crónica|historia>`, note
  `Acceso por 7 días en este dispositivo.` and a visible `MODO DEMO · no se cobra nada` label.
  Hidden when unlocked or free.
- When `expirado`, the wall shows `Tu acceso venció.` and the button reads `Desbloquear de nuevo`.
- Status pill `[data-gate-pastilla]` near the article meta: `120 sats` (bloqueado), `Desbloqueado`,
  `Leyendo` (set once the locked part scrolls into view, state `leyendo`), `Expirado`, `Gratis`.
- Known limit, by design: locked text is in the page source. The mock hides, it does not protect.

## Testing

`astro check` clean, `astro build` clean, Playwright smoke test of the Gate states and expiry, phone
width (375px) has no horizontal scroll.
