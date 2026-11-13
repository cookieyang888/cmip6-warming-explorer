# Future Warming Across Places and Seasons

DSC 106 Project 3. A static D3.js visualization of CMIP6 / CESM2 temperature changes near San Diego, New York, London, and New Delhi.

## Run locally

From this folder:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. No build step, external fonts, backend, or API keys are needed. D3 7 is vendored in `vendor/`; CSV data are served locally. Directly opening index.html may prevent CSV loading; use a server or the separate standalone HTML deliverable.

## Interactions

- Select a location, toggle scenarios (at least one remains selected).
- Brush the trend chart or use presets / numeric year inputs to update seasonal and cross-location views.
- Switch between annual values and 20-year trailing averages.
- Click a location in the comparison view to explore it.
- Hover or keyboard-focus seasonal points / comparison bars for details.
- Inspect a table or download the selected monthly anomalies as CSV.
- Reset returns to San Diego, all scenarios, 2081–2100, annual values.

## Data

CESM2 / NCAR, r4i1p1f1, native grid gn, tas / Amon. Historical 1985–2014; future 2015–2100 for SSP1-2.6, SSP2-4.5, SSP5-8.5. Data source stores and versions are in data/source_metadata.json. The webpage explains the transformations and limitations. Extraction script and Python requirements are included under data/. Annual means weight months by their calendar day counts. Monthly anomalies compare the selected period with the corresponding calendar month in the historical baseline.

Public catalog: https://storage.googleapis.com/cmip6/cmip6-zarr-consolidated-stores.csv

## Verification

Browser checks cover location changes, presets, numerical year ranges, reversed-range errors, single-year selection, scenario guard, smoothing, linked brush updates, comparison navigation, reset, and mobile layout. Selected displayed numbers were independently checked against the CSVs. No JavaScript errors were observed during those checks. This does not replace testing by a new user.

## Publishing

This repository uses relative asset paths and can be served from the root of the main branch in GitHub Pages. The site includes data methods and design rationale. The team's final development-process write-up (actual contributions, total person-hours, most time-consuming tasks and testing feedback) must be added when the team supplies it.

## Credits

Team: David Yang, Nam Ngo, Jun Tao Wang, Eric Che.
D3.js: Mike Bostock and contributors, ISC license. See vendor/LICENSE-D3.txt.

Live site: https://cookieyang888.github.io/cmip6-warming-explorer/
Repository: https://github.com/cookieyang888/cmip6-warming-explorer
