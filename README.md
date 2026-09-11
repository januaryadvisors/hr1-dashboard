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
`docs/SPEC-DEVIATIONS.md` §A first — the export needs MOE columns, integer
tiers, and a county-by-month `snap_children` series, none of which
`build_scores.R` currently produces.

## Where things are

```
src/config/layers.ts     THE ONE FILE TO EDIT for the four views, layers, copy
src/lib/layerValues.ts   (layer, window) -> the numbers every map readout draws
src/lib/insights.ts      scope resolution + metrics for the Insights page
src/config/metrics.ts    the scatter's metric registry (accessor + direction)
src/lib/scales.ts        bins + ramps, every value traceable to build_scores.R
src/lib/colorRamp.ts     port of R's colorRampPalette, verified against real R
src/lib/projection.ts    ONE projection, fitted once, shared by every panel (§2)
src/state/appState.ts    the ten-field reducer + URL mirroring (§4)
src/components/Section.tsx     numbered section header (comps §R1)
src/components/CountyMap.tsx   geo / grid / density (§6.5) — "the whole risk"
src/pages/MapPage.tsx    composition only (§6)
```

Colour lives in `src/lib/scales.ts` and nowhere else. Ramps must stay
bit-identical to `build_scores.R` (§13) — `npm test` enforces that against real
R when `Rscript` is available.

### The four views

The map strip is four views, not six layer cards (`VIEWS` in
`src/config/layers.ts`; rationale in `docs/SPEC-DEVIATIONS.md` §M):

| View | Metric(s) | Value |
|---|---|---|
| Benefits lost *(default)* | `loss` | enrollment loss over the brush window |
| Work requirements | `d1`, `d3`, `work_both` | domain percentiles, plus a bivariate map |
| Vulnerability index | `composite` | percentile sum 0–4, **the only view drawing capacity** |
| Children | `child_loss` | child enrollment loss over the window |

Three things to know before editing them:

- The view is **derived** from `state.layer` (`viewForLayer`), never stored, so
  old `?layer=` links keep working and the two cannot drift apart.
- The two loss layers have **no score column**. Their value is computed per
  window in `src/lib/layerValues.ts`, and their colour bands are anchored to the
  statewide loss over that same window — so `binsFor(layer)` alone is not enough
  to colour them. Use the `bins` that come back with the values.
- `work_both` is **bivariate**: two values per county, a 3x3 red-blue scheme,
  and no single ramp. `LayerValues.secondary` is what tells `<CountyMap>` to
  colour that way. **Both axes point toward difficulty on purpose** — if you
  swap a corner colour, keep the two single-high corners luminance-matched, or
  "work is unreachable here" starts looking as urgent as "unreachable *and* a
  big exposed caseload". A test pins that.

### The scatter's metric registry

`src/config/metrics.ts` drives the axis dropdowns on "Where need meets
capacity". Two rules when adding one:

- **Set `direction` honestly.** It gates the tinted gap quadrant, which only
  means something when x rises with need and y rises with capacity. A signed
  change metric is `better-high` (a loss is negative), not `worse-high`.
- **Prefer a share to a headcount for a default.** County caseloads span three
  orders of magnitude, so a count on a linear axis stacks 250 counties against
  the left edge. Counts stay available; they are not opening views.

Metrics the brief asked for but the dataset does not have — school-lunch
programs, teacher income — are deliberately absent rather than approximated.
See §T4.

### Palette and the green band

Two colours carry the chrome: `--ft-tan` (#F7F5F1) is the page ground,
`--ft-green` (#414A2A) is the hero band. **Every foreground on the green is
contrast-checked in `tokens.css`** — all clear 4.5:1. The comp's gold samples at
4.11:1 and was lightened to `#D9BD6B` (5.11:1); don't darken it back without
re-checking.

`.heroBand` must stay a **plain block**. As a flex container it cancels
`.heroInner`'s stretch (auto inline margins shrink a flex item to fit-content),
which indents the hero number and shortens the brush card. See §S3.

`.root` needs **`overflow-x: clip`**, not `hidden`: the sections' grounds bleed
past the viewport's left edge, and `clip` contains that without creating a
scroll container, so the sticky rail keeps working. See §T1.

Data ramps are unchanged and must stay that way here: `scales.ts` is pinned
bit-identical to `build_scores.R` and verified against real R in CI, so
recolouring marks in the browser would desynchronise the dashboard from the
review maps. That change starts on the R side. See §R7.

### Page shell

One grid, two columns: a main column, and a **sticky rail** holding the three
statewide facts and the Texas Works policy feed. Two things to leave alone:

- `.page` uses `align-items: start`. A stretched grid item cannot be sticky, so
  switching that back to `stretch` silently kills the sticky rail.
- The rail hides its overflow and the feed inside it takes the leftover height.
  That is what keeps it to **one** scroll region — cap both and you get nested
  scrollbars.

The map's own controls ("Highest on this view", "Show advanced") live in an
aside *inside* the map panel, not in the rail.

The hero number is `clamp(2.5rem, 18vw, …)`. The `vw` term is not cosmetic: at a
fixed 6.75rem, `−547,051` overflows a phone viewport and the overflow widens the
whole document, which makes every other section render narrow with a gap beside
it.

### County stat pages (Insights)

The Insights page is **scopeable**: `state.scope` holds a geoid, mirrors to
`?county=`, and every chart reads from a `Scope` (`src/lib/insights.ts`). So
`/insights/decline?county=48201` is a county report, and the link is just the
address bar after picking a county — there is no separate export step to drift
out of sync.

Two rules when adding a chart there:

- **If the data is statewide only, say so on the chart.** Pass `statewideOnly`
  to `ChartCard` and it renders a "Statewide figure" badge whenever a county is
  scoped. Age bands and people-vs-households are statewide (§3.3) and §3 forbids
  synthesising county versions. These reports get handed to legislators who will
  repeat the numbers; a statewide figure repeated as a county figure is the
  failure mode, and the reader cannot catch it themselves.
- **Quote the statewide figure and the county median, not one of them.**
  `lossRank` returns both because they disagree, and picking the flattering one
  is how a stat page misleads.

`FunnelPlot.markOutliers` is **off** on purpose: the published control limits are
not calibrated to the observed dispersion (43% of counties fall outside a 2sd
band). See §Q2 of the deviations doc before turning it on.

### The policy feed filter

`classify()` in `src/data/timeline.ts` tags bulletins `snap` / `hr1` at load
time — a **text match**, not an authority on scope. Cross-programme bulletins
that change SNAP without naming it are not matched, and the UI says so whenever
a filter is on. Don't remove that footnote without replacing the classifier with
a real programme mapping.

### What the tooltip shows

`ViewDef.tooltip` decides per view — the domain spread and the assistance
registries appear on the Vulnerability index only, the Work view ends on
exposure bars, the two loss views on the caseload line, and the index on no
chart at all. Rationale in §N and §P of the deviations doc.

`LayerDef.copy` is optional. Most views render no panel paragraph; D3 and the
bivariate layer keep theirs because the copy is doing work the map cannot (a
component list, and the red/blue reading instructions).

`snap_children` is not in the build spec's §3 contract; the real export owes it.
See §A4.

## Deploy

Push to `main`; `.github/workflows/deploy.yml` runs tests, typechecks, builds and
publishes. The deploy gates on `npm test`.

One-time setup:
1. Settings → Pages → Source: **GitHub Actions** — do this *before* the first
   push, or the deploy job fails with "Get Pages site failed".
2. Settings → Actions → General → Workflow permissions → **Read and write**,
   which the bulletins refresh job needs in order to commit.
3. `vite.config.ts` `base` must match the repo path (`/hr1-dashboard/`). It is
   commented as the one place to change; a custom domain means `base: '/'`.

### Deep links

Pages serves static files only, so `/hr1-dashboard/map` has no file to serve and
would 404. The `githubPagesSpaFallback` plugin in `vite.config.ts` copies
`index.html` to `dist/404.html` after each build; Pages serves that for any
unmatched path *without changing the URL*, so the app boots and renders the right
route. The deploy workflow fails if the file is missing.

**Do not test this with `vite preview`** — it has its own SPA fallback, so every
deep route works there whether or not the deploy would serve it. Use:

```bash
npm run build && npm run serve:pages   # replicates Pages exactly
```

Deep links returning a 404 *status* while rendering correctly is expected and
harmless here (the site is `noindex`). A true 200 would need the
redirect-through-query-string trick, which makes the URL visibly flicker.

## Confidentiality

Pages is publicly reachable even from a private repo. D1 figures are preliminary
until Feeding Texas signs off, so `index.html` carries `noindex, nofollow` and
`public/robots.txt` disallows crawlers. Drop both when D1 is accepted.
