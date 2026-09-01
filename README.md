# Texas SNAP & H.R. 1 — county vulnerability dashboard

D1 of the Feeding Texas engagement: county and legislative-district mapping of
H.R. 1's impact on SNAP, Medicaid and Marketplace coverage in Texas.

**Live:** https://januaryadvisors.github.io/hr1-dashboard/ — `noindex` while D1 is
a working draft.

## Read first

| Document | What it is |
|---|---|
| `Build Spec.dc.html` | **The binding spec.** v1.0, 31 Aug 2026. Source of truth. |
| `docs/BUILD-SPEC.md` | Generated markdown of the above, so it's diffable and greppable. |
| `1a — DASHBOARD.png` | The wireframe the Map page implements. |
| `docs/SPEC-DEVIATIONS.md` | Everything the build could not follow literally, and why. **Has three items needing a decision.** |

Spec §11 lists options already rejected with reasons — do not rebuild them. §10
lists client framing rules that constrain what may appear on a map at all.

## Stack

Per spec §2, which deliberately departs from the JA house default:

- **React 18 + Vite + TypeScript**, react-router, three routes
- **`useReducer` + one context, mirrored to URL query params** — no Redux, no Zustand
- **Inline SVG maps** hand-rendered from TopoJSON with `d3-geo` `geoAlbers`
  tuned to EPSG:3083. No Leaflet, no MapLibre — §11 rules them out because
  small multiples with synced hover are the default view
- **`d3-scale` + `d3-shape` as JSX SVG.** No chart library
- **CSS modules + custom properties.** No Tailwind
- **Vitest on the scale/binning/format helpers only** — §2 says not to unit-test
  presentational components

```bash
npm install
npm run dev         # http://localhost:5173/hr1-dashboard/
npm test
npm run build       # tsc --noEmit && vite build → dist/
```

Payload is ~160KB gzipped including geometry, against the §3 target of 900KB.

## Data

The front end reads four static files from `public/data/`. Their shapes are the
§3 contract that `export_tool_data.R` must satisfy — see `src/types.ts`.

| File | Status |
|---|---|
| `geometry.json` | Real. Quantized TopoJSON, 254 counties + state outline, 22.7KB gz |
| `counties.json` | **Fixture.** 254 records matching §3.1 |
| `statewide.json` | **Fixture.** Statewide series matching §3.3 |
| `districts.json` | Absent by design — the Districts route renders an empty state (§3.4) |
| `timeline.json` | Hero-column topline figures. Editorial — edit freely |
| `bulletins.json` | **Generated.** Texas Works bulletins + quarterly revisions |

`export_tool_data.R` is unwritten (§12), so per §13 step 1 the build runs against
fixtures:

```bash
npm run build:data       # geometry + fixtures
npm run build:geometry   # needs the source geojson, see below
npm run build:fixtures
npm run fetch:bulletins  # re-scrape Texas Works (also runs weekly in CI)
```

### The Texas Works feed

`scripts/fetch-texas-works.mjs` scrapes Texas HHS policy bulletins and quarterly
revisions into `public/data/bulletins.json`, and
`.github/workflows/refresh-bulletins.yml` runs it weekly and commits on a diff.

It is a **build step, not a runtime fetch**: `fhb.hhs.texas.gov` sends no CORS
headers, and a static page should not depend on a government host being up. The
script refuses to write if it parses zero entries, so a markup change upstream
fails the Action loudly rather than silently blanking the panel.

**The fixtures are synthetic.** Every record carries `fixture: true`, and the
JSON download repeats it in `meta.notes`, so exported files stay
self-describing. The on-page banner was removed on client direction
(SPEC-DEVIATIONS.md §I1) — **the page no longer says so itself**. Statewide
totals reconcile to every published figure in the spec — the hero number is
exactly −547,051, and county monthly enrollment is apportioned so county sums
equal the statewide series in all 55 months. County-level values are synthetic
and describe no real county.

Geometry is built from an 8MB source geojson that is **not** committed:

```bash
GEOJSON_SRC=../texas-county-choropleth-view/public/tx_counties.geojson npm run build:geometry
```

Generated data **is** committed so CI builds standalone.

### Swapping in the real export

One file: `src/data/load.ts`. Point `getJson` at the real payloads. Then read
`docs/SPEC-DEVIATIONS.md` §A first — the export needs MOE columns and integer
tiers, neither of which `build_scores.R` currently produces.

## Where things are

```
src/config/layers.ts     THE ONE FILE TO EDIT for layers, copy, count bases
src/lib/scales.ts        bins + ramps, every value traceable to build_scores.R
src/lib/colorRamp.ts     port of R's colorRampPalette, verified against real R
src/lib/projection.ts    ONE projection, fitted once, shared by every panel (§2)
src/state/appState.ts    the nine-field reducer + URL mirroring (§4)
src/components/CountyMap.tsx   geo / grid / density (§6.5) — "the whole risk"
src/pages/MapPage.tsx    composition only (§6)
```

Colour lives in `src/lib/scales.ts` and nowhere else. Ramps must stay
bit-identical to `build_scores.R` (§13) — `npm test` enforces that against real
R when `Rscript` is available.

## Deploy

Push to `main`; `.github/workflows/deploy.yml` runs tests, typechecks, builds and
publishes. The deploy gates on `npm test`.

One-time setup:
1. Settings → Pages → Source: **GitHub Actions**
2. `vite.config.ts` `base` must match the repo path (`/hr1-dashboard/`). It is
   commented as the one place to change; a custom domain means `base: '/'`.

## Confidentiality

Pages is publicly reachable even from a private repo. D1 figures are preliminary
until Feeding Texas signs off, so `index.html` carries `noindex, nofollow` and
`public/robots.txt` disallows crawlers. Drop both when D1 is accepted.
