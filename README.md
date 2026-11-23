# Texas SNAP Tracker — county dashboard

County and legislative-district mapping of H.R. 1's impact on SNAP and ACA
Marketplace coverage in Texas, for Feeding Texas.

**Live:** https://januaryadvisors.github.io/hr1-dashboard/ (`noindex` while the
figures are preliminary).

## Run it

```bash
npm install
npm run dev     # http://localhost:5173/hr1-dashboard/
npm test
npm run build   # → dist/
```

React 18 + Vite, plain JavaScript with JSDoc types (`jsconfig.json` is editor
config only). State is one `useReducer` mirrored to the URL. Maps are inline SVG
drawn from TopoJSON with `d3-geo`; charts are `d3-scale` + `d3-shape` as JSX.
Styles are CSS modules plus the custom properties in `src/styles/tokens.css`.

## Where things are

```
src/pages/map/          the Map page: hero, scrolling story, scatter, policy feed
src/pages/insights/     the Insights report for Texas, a county or a district
src/components/
  hero/                 the green band: headline, brush, statewide figures
  map/                  the county map, its tooltip, legend, search, controls
  story/                the story rail, chapter bar and story charts
  charts/               every other chart
  rail/                 the policy feed
  shell/                header, sections, report box, shared controls
src/config/layers.js    domains, map layers, views and assistance registries
src/config/story.js     the story's chapters and copy
src/config/metrics.js   the scatter's metrics and curated pairings
src/lib/                calculations, formatting and hooks (see each file's header)
src/state/appState.js   the reducer and URL mirroring
scripts/                data builds and scrapers
```

Colours live in `src/lib/scales.js` only. The ramps must stay identical to the
analysis repo's `build_scores.R`; `npm test` checks this against real R when
`Rscript` is available.

## Data

The app reads static files in `public/data/`, shaped as described in
`src/types.js`. Generated data is committed so CI builds standalone.

| File | Built by |
|---|---|
| `geometry.json` | `npm run build:geometry` (needs the 8MB source geojson, not committed) |
| `counties.json`, `statewide.json`, `snap-observed.json`, `district-counts.json` | `npm run build:counties` |
| `district-geometry.json` | `npm run build:district-geometry` |
| `marketplace.json` | `npm run build:marketplace` |
| `bulletins.json` | `npm run fetch:bulletins` (weekly in CI) |
| `officials.json` | `npm run fetch:officials` |

`build:counties` reads the analysis repo's `data-clean/` outputs (a sibling
`../feeding-texas-hr1` checkout by default, or `FT_DATA=/path`). It refuses to
write if a county or month is missing or the age bands stop adding up, and
prints the hero's figures so they can be checked after each refresh.

Things to know about the data:

- **Statewide = the sum of the 254 counties.** HHSC's call-center and
  state-office rows are excluded, matching the analysis.
- **Districts are counts only.** Split counties are apportioned by where the
  ACS finds SNAP households, so those districts are estimates (the report box
  says which, with a margin). Percentile scores are never weighted into districts.
- **Food banks are partial** (4 of 21 report). A county no reporting bank
  covers is null and draws grey, never zero.
- **Community health workers** are published as ranges, so the bar is the band.

### Refreshing

When HHSC publishes a month, add the export to the analysis repo's
`data-raw/snap/`. Its workflow rebuilds `data-clean/` and triggers this repo's
`refresh-county-data.yml`, which rebuilds `public/data/`, commits and deploys.
That workflow reads the analysis repo with the `FT_DEPLOY_KEY` deploy key.

## Deploy

Push to `main`: `.github/workflows/deploy.yml` runs the tests, builds and
publishes to GitHub Pages. One-time setup: Pages source **GitHub Actions**, and
Actions workflow permissions **Read and write** (the refresh jobs commit).
`base` in `vite.config.js` must match the repo path.

Pages serves only static files, so the build copies `index.html` to `404.html`
for deep links. Test that with `npm run build && npm run serve:pages`, not
`vite preview`, which has its own fallback.

## Before launch

`index.html` carries `noindex, nofollow` and `public/robots.txt` disallows
crawlers while the figures are preliminary. Remove both when they are signed off.
