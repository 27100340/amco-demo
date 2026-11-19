# Amco Paints: marketing plan, website and 3D visualiser

Prepared for Amco Paint Industries (Pvt) Ltd, Lahore, makers of Cover Up paints.

The website has a professional design, a 3D paint visualiser with four showcase properties, and an "Upload your plans" page that rebuilds a customer's property in 3D from their drawings and lets them paint it. It is plain HTML, CSS and JavaScript with no build step. Node is used only for tests and tools.

## 1. What is here

| Path | What it is |
|---|---|
| `website/` | The site. This folder is what you deploy. |
| `website/assets/app/` | The ES-module code: Building Model, 3D engine, properties, importers, editor, storage, UI. |
| `website/assets/js/` | Classic scripts for the older pages (shade card, calculator, dealers) and the shared site chrome. |
| `website/assets/vendor/`, `website/assets/fonts/` | three.js, pdf.js and fonts, copied from `node_modules` and committed. Nothing loads from a CDN. |
| `website/samples/` | Sample drawing set (DXF, PDF, zip) for trying the upload page. Generated. |
| `tests/` | Unit tests for the model, engine, importers, editor, storage and properties. |
| `tools/` | Dev server, vendoring, render and screenshot scripts, sample generator, dev harnesses. See section 7. |
| `docs/superpowers/specs/2026-11-10-professional-site-and-3d-visualiser-design.md` | The design spec. Read it for depth. |
| `marketing-plan/` | The 22-page marketing plan: `Amco-Paints-Marketing-Plan.pdf`, its source in `source/` (`plan.html`, `plan.css`, `plan-data.js`) and `build.py`. `python marketing-plan/build.py` rebuilds the PDF (needs Chrome or Edge). |

## 2. Run it

You need Node.js (the tests use `node --test`) and, for the render and sample tools, Google Chrome.

```
npm install        # dev dependencies only: esbuild, three, pdfjs-dist, fonts
npm run vendor     # optional: refresh website/assets/vendor and fonts from node_modules
npm test           # all tests in tests/
npm run samples    # regenerate website/samples/
npm run serve      # serve the repo on http://127.0.0.1:8765
```

`npm run serve` serves the **repo root**, not `website/`. So the pages are at `http://127.0.0.1:8765/website/index.html` and so on, and the dev harnesses are at `http://127.0.0.1:8765/tools/dev/engine.html`. The vendored files are committed, so you can serve without running `npm install` first. The 3D pages and the upload page use ES modules, so open them through the server rather than from the file system.

## 3. Pages

All in `website/`.

| Page | What it does |
|---|---|
| `index.html` | Home: hero photo you can repaint, show-home gallery, paint-your-own-plans pitch, products, trust band. |
| `visualiser.html` | The 3D studio. Gallery of four properties; view tabs, level selector, shade panel, finish and light, paint estimate. The URL holds the state, for example `?property=dha-residence&view=room:lounge`. |
| `my-property.html` | Upload your plans. Add drawings, check them against the requirement rules, review and trace in 2D, then paint in 3D. Projects stay in the browser. |
| `colours.html` | Shade card and colour match from a photo. |
| `tools.html` | Paint calculator, paint for your city, wall doctor, Eid and shaadi countdown. |
| `products.html` | Price list, comparison, good/better/best guide. |
| `dealers.html` | Dealer finder, genuine-tin check, links to the painters page. |
| `painters.html` | Trusted painters directory, booking, Ustad Club tiers, calculator, referral and join form. |
| `walkthrough.html` | Old address of the 3D house. It now redirects to `visualiser.html`. |

## 4. How it works

### Building Model

Every property, uploaded or built in, is a Building Model with the schema id `amco.building/1`. It is defined and documented (JSDoc) in `website/assets/app/model/schema.js`. Units are metres. Plan points are `[x, y]` with x east and y north on the drawing; world space is `(x, elevation, -y)`.

| Part | Holds |
|---|---|
| `Building` | `id`, `name`, `kind` (house, office, shop, mixed), `source` (showcase, dxf, trace), `levels`, `walls`, `rooms`, optional `site`, `fixtures`, `views`, `defaults`, `meta` |
| `Level` | `elevation`, `height`, `ceiling`, `slab`, optional `parapet` |
| `Wall` | `level`, `a`, `b`, `thickness`, `role`, `openings`, optional `cladding` |
| `Opening` | `type` (door, window, opening, shopfront, garage), `at`, `width`, `height`, `sill`, optional `tag` and `style` |
| `Room` | `level`, `name`, `use`, label point `at`, optional `polygon` (otherwise found from the walls) |
| `Fixture` | `kit` id, `level`, `at`, `rotation`, `params` |
| `View` | `mode` (exterior, dollhouse, room), `label`, optional camera |

`validateBuilding(b)` returns `{ ok, errors, warnings }`. Paintable surfaces are never stored. `model/surfaces.js` derives them: each wall has a left and right side (`<wallId>:L`, `<wallId>:R`), assigned to a room or to `exterior`. Paint selectors are a surface id, `room:<id>`, `exterior`, `site` or `*`. Section 5 of the spec has the full contract.

### Module map

`website/assets/app/`:

| Folder | Role |
|---|---|
| `model/` | Schema and validation, geometry (mitred junctions, room detection), surfaces, units. Pure, no DOM. |
| `engine/` | three.js. `viewer.js` is the only public 3D API. `compile/` turns a model into meshes; `kits/` holds furniture and fixtures; `materials/` the material registry; also cameras, lighting, picking, paint, quality and the paint estimate. |
| `properties/` | The four showcase properties and `index.js`, the catalogue. |
| `importers/` | Reads uploaded drawings. `dxf/` is the reader; `extract/` classifies and extracts plans, sections, schedules and layouts; `requirements.js` checks the package; `assemble.js` builds the model. PDFs and images are rasterised for tracing. |
| `editor/` | The SVG 2D review and trace editor with its tools, snapping and undo. |
| `storage/` | `ProjectStore`: IndexedDB with a memory fallback. |
| `ui/` | Page controllers, the studio and the shade panel. |
| `content/` | Photo slots and curated shade lists for the home page. |
| `painters/` | Painter directory and Ustad Club logic and HTML builders. Pure, no DOM. |
| `legacy.js` | Bridge: re-exports the classic scripts' globals (`AmcoShades`, `Amco`, `AmcoData`, `AmcoPainters`) to modules. |

Pages load their module, for example `<script type="module" src="assets/app/ui/home-page.js">`, after the classic scripts they need. CSS is `assets/css/` (`tokens.css` holds the design tokens, `pages/` one file per page).

## 5. Extending it

### Add a property

1. Create `website/assets/app/properties/<id>.js` that default-exports a Building Model with fixtures, views and default paint. Copy a small one such as `bahria-townhouse.js`.
2. Add an entry to `CATALOGUE` in `properties/index.js`: `id`, `name`, `kind` (`house`, `office` or `shop`), `blurb`, `still`, `views` and a `load` that imports the module.
3. Render its stills (section 7) so the gallery card has an image.
4. Add it to the property tests in `tests/properties/` and run `npm test`.

### Add a furniture or fixture kit

Kits are registered with `registerKit(id, { build(params, ctx), footprint })` from `engine/kits/index.js`. Add it to the matching family file in `engine/kits/` (seating, tables, beds, storage, decor, lighting, kitchen, office, retail, exterior, openings), or add a new file and import it in `engine/kits/all.js`. Use it from a property with `{ kit: '<id>', level, at, rotation }`. Check it in `tools/dev/kits.html`. Materials are registered the same way with `registerMaterial` in `engine/materials/registry.js`.

### Add an importer rule

- **Layer names:** add one line to `LAYER_ALIASES` in `importers/extract/classify.js`.
- **Drawing titles:** the title patterns are in the same file. Requirement rules (R1 to R4 and file limits) are in `importers/requirements.js`.
- **Text, levels and schedules:** `extract/section.js`, `extract/schedule.js`, `extract/text.js`.
- **New file format:** add a branch to `importers/interpret.js` and `importers/index.js`, returning the same `ParsedDrawing` shape.

Try changes in `tools/dev/importer.html`, with the files from `website/samples/drawings/`.

### Add a storage backend

Implement the `ProjectStore` interface: `list()`, `get(id)`, `save(project)`, `remove(id)`, `putFile(projectId, fileId, blob, meta)`, `getFile(projectId, fileId)`, `removeFile(projectId, fileId)`. `storage/idb-store.js` and `storage/memory-store.js` are the two existing ones. `createStore()` in `storage/project-store.js` chooses between them; a cloud store (for example Supabase, so uploads become leads) would be chosen there. The project record is defined in `storage/project-schema.js`.

## 6. Drawing conventions for architects

The upload page reads DXF files directly, with no AI. Hand these rules to whoever supplies the drawings. The sample set in `website/samples/` follows them exactly. Spec section 7.3 has the full detail.

| Item | Convention |
|---|---|
| Format | ASCII DXF, R12 or later. A `.dwg` is turned away: in AutoCAD use File, Save As, DXF. PDFs and images are accepted but the customer traces them by hand. |
| Size | 25 MB per file, 150 MB per project. |
| Units | Set `$INSUNITS`. If it is missing, units are guessed from the wall thickness (9 inch or 4.5 inch walls) and the customer can correct them. |
| Wall layers | `A-WALL*` or `WALL*`. Walls drawn as double lines (two parallel lines 75 to 600 mm apart). |
| Door and window layers | `A-DOOR*` or `DOOR*`; `A-GLAZ*`, `A-WIND*` or `WINDOW*`. Tag them `D1`, `W1` and so on. |
| Room names | Text on `A-AREA-IDEN`, `A-ANNO-ROOM` or `ROOM*`. |
| Section marks and levels | `A-ANNO-SECT`, `A-SECT*` or `SECTION*`; `A-ANNO-LEVL` or `LEVEL*`. |
| Site | `C-PROP`, `A-SITE*`, `PLOT*` or `BOUNDARY*` for the plot; `GATE*`; `L-PLNT` lawn; `A-SITE-PAVE`; `C-ROAD`; `A-SITE-BLDG` building footprint. |
| Title text | One title per drawing: "GROUND FLOOR PLAN", "FIRST FLOOR PLAN", "SECTION A-A", "WORKING DRAWING A-A", "SITE LAYOUT" (or "SITE PLAN"). |
| Levels in sections | Text such as `FFL +0.000`, `CEILING +3.050`, `SLAB`, `PARAPET`, `SILL`, `LINTEL`, in m, mm or ft-in. |
| Door and window schedule | On the working drawing, one row per tag: tag, type, width x height, optional `SILL n`, material. |

A complete package has a floor plan for each floor, at least one section, a working drawing for each section letter, and a site layout.

## 7. Tools

Run all from the repo root. Chrome is expected at `C:/Program Files/Google/Chrome/Application/chrome.exe`. `render-stills.mjs` and `sample-drawings/generate.mjs` accept a `CHROME_PATH` environment variable to point elsewhere.

| Command | What it does |
|---|---|
| `npm run vendor` (`tools/vendor.mjs`) | Copies three.js, its add-ons, pdf.js and the fonts from `node_modules` into `website/assets/vendor/` and `website/assets/fonts/`. |
| `npm run serve` (`tools/serve.mjs`) | Static server for the repo root. Optional port argument: `node tools/serve.mjs 9000`. |
| `npm run samples` (`tools/sample-drawings/generate.mjs`) | Writes the DXFs, A3 PDFs, `README.txt`, `manifest.json` and `amco-sample-drawings.zip` into `website/samples/`. `--no-pdf` skips the PDFs. |
| `node tools/render-stills.mjs` | Renders the gallery and home-page stills into `website/assets/img/stills/`. Options: `--property <id>`, `--view <id>`, `--all`, `--light`, `--width`, `--height`, `--gpu`, `--out <dir>`. Slow without `--gpu`. |
| `node tools/render-tins.mjs` | Renders the four placeholder tin packshots into `website/assets/img/products/`. Needs Python 3 with Pillow for the webp step. |
| `node tools/screenshot.mjs <url> <out.png> [width] [height] [--full] [--wait=ms] [--eval=js]` | Headless Chrome screenshot of any page on the running server. |
| `tools/dev/engine.html`, `kits.html`, `importer.html`, `editor.html` | Harness pages for the engine, kit library, drawing importer and plan editor. Open them through `npm run serve`. |

## 8. Placeholders to replace before launch

| What | Where | Status |
|---|---|---|
| Prices, coverage figures | `website/assets/js/data.js` | Indicative. Product names are Amco's real Cover Up range. |
| Cover Up Damp Stop, Cover Up Roof Cool | `website/assets/js/data.js` | Proposed products that do not exist. Tagged "Proposed product". |
| 63-shade "Rang-e-Pakistan" collection: names, codes, colours | `website/assets/js/shades.js` | A proposal, to be matched to Amco's printed shade card. |
| Dealer rows and batch codes | `website/assets/js/data.js` | Samples. |
| Painter listings (8 samples) | `website/assets/js/painters-data.js`, `painters` | Samples, marked Sample listing. Replace with Amco's painter list; keep codes in the USTAD-<CITY>-<NNN> form. |
| Ustad Club points, tier thresholds, cash-back and referral bonus | `website/assets/js/painters-data.js`, `sizes`, `tiers`, `referral` | Indicative. Not agreed by Amco. |
| WhatsApp number | `website/assets/js/site.js`, `CONFIG.whatsapp` | A dummy number. Every "Send on WhatsApp" button uses it. |
| Urdu copy | Across the site | Needs a read by a native speaker. |
| 11 stock photos | `website/assets/img/photos/` | Unsplash-licensed stand-ins, credited in `CREDITS.md`. Replace with Amco's own shoot, keeping the slot names; update alt text, focal points and hero wall masks in `website/assets/app/content/photos.js`. `hero-living-3` is a 3D render, not a photograph. |
| 4 tin packshots | `website/assets/img/products/` | Made by `tools/render-tins.mjs`. Not real Amco tins. Replace with real packshots. |
| Trust figures "250+ dealers" and "1,200 painters" | `website/index.html` (the `data-placeholder` items) | Not verified. Search for `data-placeholder` to find every one. |
| Show-home card copy | `website/index.html` (the "Explore our show homes" section) and the `blurb` fields in `website/assets/app/properties/index.js` | Draft wording. |
| Shop names "Noor Boutique", "Chai Corner Café", "City Pharmacy" | `website/assets/app/properties/high-street-shops.js` | Fictional, so no real business is shown. |
| The 3D showcase properties and their stills | `website/assets/app/properties/`, `website/assets/img/stills/` | Generic Lahore-style designs, not Amco projects. Re-render stills if you change a property. |

## 9. Deploying

`website/` is the folder to deploy. It is static: there is no build step and nothing to compile. It is linked to a Vercel project, and the link lives in `website/.vercel/`. That folder is git-ignored and must never be committed. If you deploy from another machine, link the folder again with the Vercel CLI instead of copying it.

Before going live, work through section 8, then run `npm test` and open each page once through `npm run serve`.
