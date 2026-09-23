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

- **React 18 + Vite, plain JavaScript**, react-router, three routes. Converted
  from TypeScript on 2026-09-11 so the whole team can edit it; the types survive
  as JSDoc `@typedef` blocks, so editors still autocomplete props and the
  per-field documentation that lived on the interfaces is still there. There is
  no compile step and no `tsc` — `jsconfig.json` is editor configuration only
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

The front end reads static files from `public/data/`. Their shapes are the §3
contract — see `src/types.js`.

| File | Status |
|---|---|
| `geometry.json` | Real. Quantized TopoJSON, 254 counties + state outline, 22.7KB gz |
| `counties.json` | **Real.** Built from the analysis repo — see below |
| `statewide.json` | **Real.** Sum of the 254 counties, plus age bands, funnel, provenance |
| `snap-observed.json` | **Real.** The rail chart; same rows as the hero, so they agree to the person |
| `medicaid-observed.json` | Real. Scraped from HHSC (`npm run fetch:medicaid`) |
| `district-counts.json` | **Real, partly estimated.** TX House / Senate enrollment counts for the Insights scope picker — see below |
| `districts.json` | Absent by design — reserved for *scored* districts; the Districts route renders an empty state (§3.4) |
| `timeline.json` | Hero-column topline figures. Editorial — edit freely |
| `bulletins.json` | **Generated.** Texas Works bulletins + quarterly revisions |

### Building the county data

`scripts/build-county-data.mjs` reads the R pipeline's outputs in
`feeding-texas-hr1/data-clean/` (a sibling checkout by default) and writes
`counties.json`, `statewide.json` and `snap-observed.json`:

```bash
npm run build:counties                          # reads ../feeding-texas-hr1/data-clean
FT_DATA=/path/to/data-clean npm run build:counties
npm run build:data                              # geometry + counties
```

| Input parquet | Gives |
|---|---|
| `snap_county_monthly` | SNAP enrolled, cases, age bands by county × month, Jan 2022 → latest (HHSC Excel to Aug 2025, then the PMAS Tableau export) |
| `vulnerability_county` | d1–d4 scores/tiers/counts, composite, cumulative impact, newly-subject and non-citizen counts, 2026 projected population |
| `snap_county` | Metro / Micro / Rural |
| `navigator_county`, `chw_county_presence` | The two capacity registries that exist |
| `crosswalk_districts`, `acs_tract` | County/tract → TX House and Senate weights; tract population, for the weight check |

Plus one input fetched here rather than in the R pipeline:
`data/acs-snap-households-tract.json` (`npm run fetch:acs-snap`) — ACS 2020–24
households receiving SNAP by tract (table B22001), from the Census bulk summary
file because the Census API now needs a key. Committed; the vintage is fixed. It
belongs in `collect_acs.R` eventually.

Nothing is synthetic. The script refuses to write if a county or month is
missing or the age bands stop adding up, warns if the scored file and the monthly
file are different vintages, and prints the hero's hand-written figures next to
the values it computes so they can be checked by eye after every refresh.

What the real data does **not** have, and how the page handles it:

- **Domain MOEs** — `build_scores.R` does not produce them (§A1). `*_moe` is
  null and renders as "—".
- **Food-bank and application-counselor registries** — not sourced. Those infra
  counts are `null`, not 0; the map offers only navigator and CHW marks and names
  the other two as "not yet sourced". The gap overlay is therefore "top-quintile
  vulnerability, no CMS navigator" until the food-bank registry lands.

Statewide figures everywhere are the **sum of the 254 counties**; HHSC's
call-center and state-office rows (~3,300 people) are excluded, matching the
analysis. `fetch-snap-stats.mjs` sums them in, which is one reason it is no
longer part of `fetch:data` — running it overwrites the rail's file with a
series that stops at Aug 2025.

To refresh after HHSC publishes a new month: rerun the R collectors and
`build_scores.R` in the analysis repo, then `npm run build:counties` here and
commit `public/data/`.

### District counts (Insights only)

`district-counts.json` carries, for each of the 150 TX House (PlanH2316) and 31
TX Senate (PlanS2168) districts: monthly SNAP enrolled and children, the
newly-subject count, population, and the counties it draws from. It is built in
the same script, and each chamber reconciles to the statewide total exactly in
every month.

- **Counts only.** Scores are not allocated — §9 forbids weighting percentiles
  into districts. The Insights domain chapter says so for a district.
- **Whole counties are exact; split counties are estimates.** SNAP is published
  by county. A county split across districts is apportioned by where the ACS
  finds households receiving SNAP, tract by tract, through the crosswalk's
  block-population weights; HHSC's count stays the total. Tested against the
  county data, where the truth is known, the share of enrollees put in the wrong
  county is 15.0% by population, 5.6% by low-income population and 4.2% by SNAP
  households — the build prints this every run. 25 of 150 House and 2 of 31
  Senate districts are exact.
- **Estimated figures carry a ±.** Each split share has a 90% survey margin
  (`share_moe`), and the scope bar shows it on the district's counts — e.g. HD 134
  is 5,140 ± 1,066 enrollees. The margin moves a district's size, not a
  single-county district's percent change.
- **A district inside one split county inherits that county's trend.** All 24
  Harris House districts show Harris's −17.1%; only their size differs. The scope
  bar says so, and ranks treat equal figures as ties.

The URL is `/insights/<chapter>?district=txhouse-133` (or `txsenate-15`), and the
district is ranked, funnel-plotted and top-ten'd against its own chamber, not the
254 counties.

### The Texas Works feed

`scripts/fetch-texas-works.mjs` scrapes Texas HHS policy bulletins and quarterly
revisions into `public/data/bulletins.json`, and
`.github/workflows/refresh-bulletins.yml` runs it weekly and commits on a diff.

It is a **build step, not a runtime fetch**: `fhb.hhs.texas.gov` sends no CORS
headers, and a static page should not depend on a government host being up. The
script refuses to write if it parses zero entries, so a markup change upstream
fails the Action loudly rather than silently blanking the panel.

Geometry is built from an 8MB source geojson that is **not** committed:

```bash
GEOJSON_SRC=../texas-county-choropleth-view/public/tx_counties.geojson npm run build:geometry
```

Generated data **is** committed so CI builds standalone.

### Swapping in the real export

When `export_tool_data.R` exists it can replace `build-county-data.mjs`: point
`getJson` in `src/data/load.js` at its payloads. Read `docs/SPEC-DEVIATIONS.md`
§A first — the export still owes MOE columns and integer tiers.

## Where things are

```
src/config/layers.js     THE ONE FILE TO EDIT for the four views, layers, copy
src/lib/layerValues.js   (layer, window) -> the numbers every map readout draws
src/lib/insights.js      scope resolution + metrics for the Insights page
src/config/metrics.js    the scatter's metric registry (accessor + direction)
src/lib/scales.js        bins + ramps, every value traceable to build_scores.R
src/lib/colorRamp.js     port of R's colorRampPalette, verified against real R
src/lib/projection.js    ONE projection, fitted once, shared by every panel (§2)
src/state/appState.js    the reducer + URL mirroring (§4)
src/pages/MapPage.jsx    composition only (§6)
```

Components are grouped by where they appear on the page, not by what they are
made of — so "change the thing above the fold" is one folder, not a hunt through
a flat list of thirty files:

```
src/components/shell/    chrome that is on every page: header, Section, Callout,
                         SegmentedControl, ScopeBar
src/components/hero/     above the fold: the headline stats and the brush chart
src/components/map/      CountyMap ("the whole risk"), its tooltip, search,
                         ramp + bivariate legends, glyphs, the rank list
src/components/charts/   every plot that is not the map, plus their shared
                         charts.module.css
src/components/rail/     the sticky right rail: observed SNAP trend, policy feed
```

Colour lives in `src/lib/scales.js` and nowhere else. Ramps must stay
bit-identical to `build_scores.R` (§13) — `npm test` enforces that against real
R when `Rscript` is available.

### The four views

The map strip is four views, not six layer cards (`VIEWS` in
`src/config/layers.js`; rationale in `docs/SPEC-DEVIATIONS.md` §M):

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
  window in `src/lib/layerValues.js`, and their colour bands are anchored to the
  statewide loss over that same window — so `binsFor(layer)` alone is not enough
  to colour them. Use the `bins` that come back with the values.
- `work_both` is **bivariate**: two values per county, a 3x3 red-blue scheme,
  and no single ramp. `LayerValues.secondary` is what tells `<CountyMap>` to
  colour that way. **Both axes point toward difficulty on purpose** — if you
  swap a corner colour, keep the two single-high corners luminance-matched, or
  "work is unreachable here" starts looking as urgent as "unreachable *and* a
  big exposed caseload". A test pins that.

### The scatter's metric registry

`src/config/metrics.js` drives the axis dropdowns on "Where need meets
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

Data ramps are unchanged and must stay that way here: `scales.js` is pinned
bit-identical to `build_scores.R` and verified against real R in CI, so
recolouring marks in the browser would desynchronise the dashboard from the
review maps. That change starts on the R side. See §R7.

### Page shell

One grid, two columns: a main column, and a **sticky rail** holding the observed
SNAP trend chart and the Texas Works policy feed. (The three statewide facts moved
into the green hero band on 2026-09-11.) Two things to leave alone:

- `.page` uses `align-items: start`. A stretched grid item cannot be sticky, so
  switching that back to `stretch` silently kills the sticky rail.
- The rail hides its overflow and the feed inside it takes the leftover height.
  That is what keeps it to **one** scroll region — cap both and you get nested
  scrollbars.

The map's own controls live in an aside *inside* the map panel, not in the rail.
Measure (Rate/Count) and the render style sit together **above** the map, because
both change how it draws rather than what it is about. The "Show advanced"
disclosure that used to hide Measure was removed on 2026-09-11 — it held two
things, and one of them (the infrastructure picker) only ever applied to the
Vulnerability index view, where it is now shown inline.

The rail is ONE colour (`--ft-tan-alt`, full-bleed to the right edge) against the
main column's alternating tans. Nothing inside it paints its own surface.

The hero number is `clamp(2.5rem, 18vw, …)`. The `vw` term is not cosmetic: at a
fixed 6.75rem, `−547,051` overflows a phone viewport and the overflow widens the
whole document, which makes every other section render narrow with a gap beside
it.

### County stat pages (Insights)

The Insights page is **scopeable**: `state.scope` holds a geoid, mirrors to
`?county=`, and every chart reads from a `Scope` (`src/lib/insights.js`). So
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

The funnel's limits are **fitted per window** (`fitFunnel` in
`src/lib/insights.js`, ported from the analysis notebook), and outliers are only
coloured while the band catches ≤10% of counties — 17 of 254 on the policy
window. See §Q2 and §U of the deviations doc.

### The policy feed filter

`classify()` in `src/data/timeline.js` tags bulletins `snap` / `hr1` at load
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

`snap_children` is not in the build spec's §3 contract; it is built from HHSC's
county age columns (under 5 + 5–17). See §A4.

## Deploy

Push to `main`; `.github/workflows/deploy.yml` runs tests, builds and publishes.
The deploy gates on `npm test`.

One-time setup:
1. Settings → Pages → Source: **GitHub Actions** — do this *before* the first
   push, or the deploy job fails with "Get Pages site failed".
2. Settings → Actions → General → Workflow permissions → **Read and write**,
   which the bulletins refresh job needs in order to commit.
3. `vite.config.js` `base` must match the repo path (`/hr1-dashboard/`). It is
   commented as the one place to change; a custom domain means `base: '/'`.

### Deep links

Pages serves static files only, so `/hr1-dashboard/map` has no file to serve and
would 404. The `githubPagesSpaFallback` plugin in `vite.config.js` copies
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
