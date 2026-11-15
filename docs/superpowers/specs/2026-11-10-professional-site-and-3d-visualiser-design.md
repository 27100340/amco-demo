# Amco Paints: professional redesign, realistic 3D visualiser and "build your own property"

Date: 10 November 2026
Status: draft for approval
Applies to: `website/` (static site, deployed on Vercel)

---

## 1. Intent

### What was asked

1. The site looks childish and basic: cartoon colours, styles and fonts. Make it look as professional as ICI Dulux and other big paint brands. The landing page matters most.
2. The 3D house looks like a cartoon. Replace it with real-looking buildings: a couple of houses, office space and shops.
3. New feature: a customer uploads their **floor plan, section drawings, working drawings of all sections, and layouts**. All four are required. The site reconstructs the property in 3D, and the customer selects walls and tries paint on them.
4. Reconstruction must not use AI, to avoid running costs.
5. Provide one dummy set of drawings to upload and test the full flow.
6. Make the architecture smart and easy to scale. Creative freedom is granted.

### Decisions confirmed by the user (10 Nov 2026)

| Topic | Decision |
|---|---|
| Turning drawings into 3D | **CAD auto-read plus trace fallback.** DXF files are read automatically. PDFs and images are accepted, and the customer traces over them in a 2D editor. The same editor is used to review and correct anything the auto-reader detects. |
| Where uploads live | **In the customer's browser** (IndexedDB). Nothing goes to a server. Storage sits behind an interface so a cloud backend can be added later without rewrites. |
| Landing page imagery | **Free-licence photography** (Unsplash/Pexels licence), stored locally and swappable from one config file when Amco has its own shoot. |

### Assumptions (correct these if wrong)

- Brand naming stays as it is today: "Amco Paints, makers of Cover Up". Logo and wordmark are refined, not renamed.
- All existing placeholders stay placeholders and stay flagged: prices, shades, dealers, WhatsApp number, and the two proposed products. New placeholders (photos, product packshots, stats) are flagged the same way.
- The site moves to native ES modules. It must be served over HTTP (Vercel, or `python -m http.server` locally); double-clicking `index.html` will no longer run the 3D. There is still **no build step**.
- The existing classic scripts (`site.js`, `shades.js`, `data.js`, the tools pages) keep working. New code reads them through a small adapter, so they can be migrated later.

### Success criteria

1. The landing page and inner pages read as a premium paint brand when set side by side with Dulux, Jotun and Benjamin Moore screenshots. That means photography-led pages, refined type and quiet UI chrome, with the colour coming from rooms and not from interface blocks.
2. The 3D properties read as architectural visualisation, not toy blocks. Walls have thickness and reveals, furniture has bevelled and believable forms, the materials look real, the shadows are soft with ambient occlusion, and paint colour stays true on screen.
3. At least four showcase properties: two houses, one office and one shop row with a boutique interior. Each has an exterior view, a dollhouse view and room views, and every wall can be painted.
4. Uploading the sample drawing set, with all four required document types, produces a correct 3D model in under 10 seconds on a mid-range laptop, with no manual fixes needed. Walls, doors, windows, rooms, levels and site are all present.
5. A customer with only PDFs can trace their plan and reach the same 3D painting stage.
6. "Build my 3D model" stays disabled until every required document is present. The UI shows exactly what is missing.
7. Zero per-use running cost: no AI, no server processing.

---

## 2. Scope

**In:** design system and full visual restyle of every page; a new landing page; the 3D engine (replacing `house3d.js`); four showcase properties; the visualiser page; the "My property" page (upload, requirements, auto-reconstruction, trace and review editor, 3D painting, browser storage); the sample drawing set and its generator; unit and round-trip tests; visual verification screenshots; README update.

**Out (v1), with a path recorded in §12:** cloud storage and accounts; DWG binary reading (customers export DXF instead); IFC/BIM import; curved walls (arcs on wall layers are reported, not modelled); stair geometry in reconstructed models (shown as a floor void); automatic extraction from vector PDFs; real product packshots and real photography (placeholders until Amco supplies them).

---

## 3. Architecture overview

One idea carries the whole system: **every building is data in a single format, the Building Model, and one engine renders it.**

```
 showcase property files ─┐
 DXF importer ────────────┼──▶ Building Model (JSON) ──▶ 3D engine ──▶ paint, estimates, project
 2D trace/review editor ──┘          ▲
                                     └── saved in the ProjectStore (IndexedDB now, cloud later)
```

- Adding a property means adding one data file.
- Adding an input format (DWG, IFC, vector PDF) means adding one importer that outputs a Building Model.
- Adding a storage backend means adding one `ProjectStore` adapter.
- Adding furniture means registering one kit.

### File layout

```
website/
  index.html                  landing page (rebuilt)
  visualiser.html             NEW: property gallery + 3D studio (replaces walkthrough.html)
  my-property.html            NEW: upload drawings -> review/trace -> 3D paint
  walkthrough.html            becomes a redirect to visualiser.html
  colours.html tools.html products.html dealers.html   restyled; logic unchanged
  samples/
    amco-sample-drawings.zip  the dummy set (DXF + PDF + README)
    drawings/*                the same files unzipped (used by "Load the sample project")
  assets/
    css/      tokens.css  base.css  components.css  pages/*.css   (site.css split; old classes kept working)
    fonts/    Instrument Serif, Instrument Sans (variable), Noto Nastaliq Urdu
    img/      photos/ (webp, 3 widths) + CREDITS.md, products/ (tin renders), stills/ (3D renders for landing)
    vendor/   three/ (three.module.js, three.core.js, used addons), pdfjs/ (pdf.mjs, pdf.worker.mjs)
    js/       existing classic scripts (site.js, shades.js, data.js, colours.js, tools.js, ...)
    app/      NEW ES modules
      legacy.js              adapter exposing window.AmcoShades / window.Amco / window.AmcoData to modules
      content/               photos.js (photo slots, alt text, credits, hero wall masks), collections.js
      model/                 schema.js, geometry.js, surfaces.js, units.js
      engine/                viewer.js (public API), renderer.js, quality.js, lighting.js, cameras.js,
                             picking.js, paint.js, estimate.js
        compile/             building.js, walls.js, openings.js, floors.js, roof.js, site.js
        materials/           registry.js, procedural.js (canvas noise -> colour/normal/roughness maps)
        kits/                index.js (registry) + seating.js tables.js beds.js storage.js kitchen.js
                             office.js retail.js lighting.js decor.js exterior.js openings.js
      properties/            index.js (catalogue) + one file per property
      importers/             index.js (readDrawing, checkPackage, assemble)
        dxf/                 tokenizer.js, reader.js (entities, blocks, units)
        extract/             classify.js, plan.js, section.js, schedule.js, layout.js
        requirements.js      the mandatory-document rules
        assemble.js          drawings -> Building Model + report
        raster.js            PDF/image -> backdrop bitmap (pdf.js), browser-only
      editor/                plan-editor.js, view.js (SVG), commands.js (undo/redo), tools/*.js
      storage/               project-store.js (interface + validation), idb-store.js
      ui/                    visualiser-page.js, my-property-page.js, shade-panel.js, upload-slots.js,
                             requirements-list.js, hero-recolour.js, ...
tools/                       NOT deployed: node scripts
  vendor.mjs                 copies pinned three/pdfjs/fonts from npm into assets/vendor
  sample-drawings/           generate.mjs, dxf-writer.mjs, svg-sheet.mjs, zip.mjs, sample-house.js
  render-stills.mjs          headless Chrome -> assets/img/stills/*.webp
  render-tins.mjs            headless Chrome -> assets/img/products/*.webp
tests/                       node:test suites (pure modules only)
```

**Rule:** `model/`, `importers/dxf/`, `importers/extract/`, `importers/requirements.js` and `importers/assemble.js` are pure. No DOM and no three.js. They run in Node for tests.

### Pinned dependencies (vendored and served locally, no CDN)

- three.js **0.187.0**: `three.module.js`, `three.core.js` and these addons: OrbitControls, RoomEnvironment, RoundedBoxGeometry, BufferGeometryUtils, EffectComposer, RenderPass, GTAOPass, SMAAPass, OutputPass, RectAreaLightUniformsLib, Sky.
- pdfjs-dist **6.5.438**: ES module build plus worker, loaded only on `my-property.html` when a PDF is added.
- @fontsource/instrument-serif **5.3.0** and @fontsource-variable/instrument-sans **5.3.0**: latin and latin-ext woff2 files.
- An import map in each 3D page maps `three` and `three/addons/` to `assets/vendor/three/`.

---

## 4. Part A: professional redesign

### Design direction

The big brands share three habits, and this site currently breaks all three:

1. **Photography carries the colour.** Benjamin Moore and Jotun place the room photo beside a panel filled with the same wall shade.
2. **Type is light and elegant.** Jotun uses a serif, Benjamin Moore a regular-weight sans. Our site uses ultra-condensed black-weight type.
3. **Chrome is quiet.** Navigation, buttons and cards are white or charcoal. Brand red appears only in the logo and the occasional accent.

### Design system (`tokens.css`)

- **Type:** *Instrument Serif* for display, weight 400 only, at large sizes with line-height about 1.05. *Instrument Sans* (variable) for UI and body. *Noto Nastaliq Urdu* for Urdu lines, used sparingly as an accent and never in headlines next to English.
- **Scale:** 12, 14, 16, 18, 22, 28, 36, 48, 64 and 80 px, fluid between breakpoints.
- **Colour:** warm white paper `#FFFFFF`, canvas `#F6F4F0`, charcoal ink `#1D2023`, soft ink `#5F656B`, hairlines `#E4E0D9`. Brand red stays as the logo red and is used as an accent only. Primary buttons are charcoal; secondary buttons are outlined. No saturated UI backgrounds, ever: colour only appears as paint (swatches, wall panels, photos).
- **Shape and depth:** radius 2 to 6 px; hairline borders; at most one soft shadow level (cards on hover); 4 px spacing grid; generous section padding (96 to 128 px on desktop).
- **Motion:** 200 to 400 ms fades and slides, image hover zoom of 1.03 at most, carousel cross-fades. Everything respects `prefers-reduced-motion`.
- **Icons:** one inline-SVG line-icon set with a 1.5 px stroke (search, pin, brush, roller, ruler, shield, WhatsApp, arrow, upload, cube).
- **Swatches:** square chips with a hairline edge, the name and code set below in small sans. This replaces the rainbow blocks.

### Landing page (`index.html`), top to bottom

1. **Utility bar** (thin, charcoal): "Made in Lahore since 1985", Find a dealer, Painter services, WhatsApp.
2. **Header:** refined wordmark; nav: Colours, Products, Visualiser, Inspiration, Advice & tools, Dealers; and My project. The header becomes sticky and condensed on scroll.
3. **Hero with recolour:** a full-bleed real room photo. Its plain wall has a hand-authored mask polygon stored in `content/photos.js`. A row of 6 to 8 curated shades repaints the wall in the photo using a colour layer clipped to the mask with `mix-blend-mode: multiply`, which keeps the photo's own light and shadow. A split colour panel (Benjamin Moore style) carries the serif headline, the shade name and code, and two CTAs: "Explore colours" and "See it in 3D". There are 2 or 3 hero photos in a slow cross-fade; the shade row recolours the active one. If a photo has no mask, it is shown static.
4. **Explore by space:** six photo cards (Living room, Bedroom, Kitchen, Exterior, Office, Retail). Each links to the matching visualiser property and view.
5. **Colour collection feature:** an editorial split block. One side has a photo; the other has the "Rang-e-Pakistan" collection story with 5 curated chips. Shade data is still flagged as a proposal.
6. **Visualiser band** (charcoal): pre-rendered stills of the new 3D properties, plus two clear paths: "Explore our show homes" (houses, office, shops) and "Upload your plans", with the 3 steps Upload drawings → We rebuild it in 3D → Paint every wall. No three.js loads on the landing page.
7. **Products:** four category cards (Interior emulsions, Exterior weather coats, Enamels & wood, Primers & putty), each with a rendered tin image. The tins are placeholder packshots generated by `tools/render-tins.mjs`.
8. **Plan your job:** a quiet four-column list with line icons: paint calculator, paint for your city, wall doctor, genuine-tin check. Each links to the existing tools.
9. **Trust band:** "Since 1985", "Made in Lahore", dealer count, Ustad Club. The numbers are placeholders and flagged.
10. **Dealer and painter call to action** with a photo.
11. **Footer:** restyled with the same content.

### Inner pages

The coloured `.page-title` bands are replaced by editorial headers: a serif title on canvas, with an optional photo. The shared components (buttons, segmented controls, fields, tables, chips, drawer, toast) are restyled in `components.css`, so `colours`, `tools`, `products` and `dealers` change look without changing logic. Page-specific inline styles that clash with the new system move into `pages/*.css`. Every nav and link that pointed at `walkthrough.html` now points at `visualiser.html`.

### Photography

- **Sources:** about 10 photos from Unsplash/Pexels under their free commercial licences: 2 or 3 living rooms with plain light walls (for the hero masks), a bedroom, a kitchen, a modern house exterior, an office, a retail interior, a painter at work, and a fan deck or swatches.
- **Format:** webp at 640, 1280 and 1920 px widths, with `srcset`. The hero LCP image must be 250 KB or less at 1280.
- **Records:** `assets/img/photos/CREDITS.md` lists the source URL, author and licence for each photo. `content/photos.js` is the single place to swap in Amco's own photography.

---

## 5. Part B: Building Model and 3D engine

### Building Model, schema `amco.building/1` (`model/schema.js`, documented with JSDoc)

Units are metres. Plan coordinates are `[x, y]`, with x pointing east and y pointing north on the drawing. They map to world space as `(x, elevation, -y)`.

```
Building  { schema:'amco.building/1', id, name, kind:'house'|'office'|'shop'|'mixed',
            source:'showcase'|'dxf'|'trace', levels:Level[], walls:Wall[], rooms:Room[],
            site?:Site, fixtures?:Fixture[], views?:View[],
            defaults?:{ paint:{[selector]:shadeCode}, finish:'matt'|'silk'|'gloss' },
            meta?:{ address?, drawings?:DrawingRef[], warnings?:string[] } }
Level     { id, name, elevation, height /*floor-to-floor*/, ceiling /*clear height*/, slab,
            parapet? /*top level only*/ }
Wall      { id, level, a:[x,y], b:[x,y], thickness, height? /*default: level.ceiling*/,
            role:'exterior'|'interior'|'partition'|'glass', openings:Opening[],
            cladding?:{ left?:materialId, right?:materialId } /*non-paint finish on one side*/ }
Opening   { id, type:'door'|'window'|'opening'|'shopfront'|'garage', at /*centre, metres from a*/,
            width, height, sill, tag? /*'D1'*/, style? /*kit id for the infill*/ }
Room      { id, level, name, use:RoomUse, at?:[x,y] /*label point*/, polygon?:[x,y][] /*derived from
            the wall graph face containing `at` if absent*/, floor?, ceiling? }
Site      { boundary:[x,y][], boundaryWall?:{ height, thickness, gates:{at:[x,y],width,style}[] },
            ground:{ polygon, material:'lawn'|'paving'|'road'|'gravel' }[], street?:{ side, width } }
Fixture   { kit, level, at:[x,y], rotation /*degrees*/, params? }
View      { id, label, mode:'exterior'|'dollhouse'|'room', level?, room?, position?, target? }
```

`validateBuilding(b)` returns `{ ok, errors[], warnings[] }`. It checks references, degenerate walls, openings that overrun their wall, and openings that overlap each other.

**Surfaces** are derived by `model/surfaces.js` and are never stored:

- Each wall has two sides, `L` (left of the a→b direction) and `R`, giving surface ids `${wallId}:L` and `${wallId}:R`.
- Each surface is assigned to the room whose polygon contains a point sampled just off that face. If no room contains it, the surface is `exterior`.
- The boundary wall has an `inner` and an `outer` surface. Room ceilings are optional surfaces.
- Each surface records its net area (openings subtracted) and a human label, for example "Lounge, north wall".
- Paint selectors are a surface id, `room:<id>`, `exterior`, `site` or `*`.

**Geometry** (`model/geometry.js`, pure):

- vectors and segments;
- polygon area and centroid, point-in-polygon, polygon inset;
- **mitred wall junctions:** at each node, sort the incident walls by angle and intersect neighbouring offset lines, which gives exact wall footprints and exact face extents;
- planar-graph noding (splitting walls at T-junctions);
- **room detection** by enumerating the faces of the wall centreline graph;
- snapping helpers.

### Engine (`engine/viewer.js`), the only public 3D API

```js
const viewer = createViewer(container, { quality:'auto', onSelect, onHover, onChange, onView });
await viewer.load(building, paintState?);
viewer.setView('dollhouse' | 'exterior' | { mode:'room', room:'lounge' });
viewer.setLevel(levelId | null);           // dollhouse: hide levels above
viewer.select(surfaceId | null);
viewer.paint(code, { scope:'surface'|'room'|'exterior'|'all', finish });
viewer.setLight('day'|'warm'|'cool');      // daylight / warm bulb / tube light
viewer.getSurfaces();                      // [{id,label,room,level,area,code,finish}]
viewer.getPaintState(); viewer.setPaintState(state);
viewer.estimate(productId);                // litres for two coats, per room and total
await viewer.snapshot({ width, height });  // Blob, used for still renders and sharing
viewer.dispose();
```

**Compilation** (`compile/*`) turns a Building Model into a three.js scene:

- Walls are built from their mitred footprint. Each side face is a `ShapeGeometry` with holes cut for openings, so paint areas are exact. The wall also gets end caps, a top cap (shown as a dark section cut in dollhouse view), and opening reveals (jambs, head and sill), which take the room-side surface's paint.
- Skirting is added along room-side faces.
- Openings are filled from kits: panel door, glass slider, casement window with frame and mullions, rolling shutter, shopfront glazing, curtain wall.
- Floors and ceilings are built from room polygons. Ceilings get downlights.
- Slabs, the roof, the parapet and the site (boundary wall, gates, lawn, paving, street and kerb) are built from the same model.
- Each paintable surface gets its own material, so paint changes are instant.

**Realism pipeline:**

- **Renderer:** WebGL2, sRGB output, `NeutralToneMapping` (Khronos PBR Neutral). This tone mapping is chosen because it preserves hue, and paint colour must stay true on screen. Exposure is set per light mode. MSAA render target, or SMAA when post-processing is on.
- **Lighting:**
  - an environment map from `RoomEnvironment` (interiors) or a sky gradient (exteriors) through PMREM;
  - a sun as a directional light with PCF soft shadows;
  - window light from rect-area lights;
  - lamps from point and spot lights;
  - three light modes: Daylight, Warm bulb (2700 K) and Tube light (6500 K), as the site has today.
- **Ambient occlusion:** `GTAOPass` on the high quality tier.
- **Materials** (`materials/registry.js`): every material has an id (`paint`, `plaster`, `marble`, `oak-floor`, `porcelain`, `stone-cladding`, `brick`, `concrete`, `glass`, `brushed-steel`, `fabric-linen`, `leather`, `walnut`, `lawn`, `paving`, `asphalt`, ...).
  - Each id resolves to a generator that returns PBR maps: colour, normal and roughness. v1 generates these procedurally on canvas (layered noise, with normals derived from height by a Sobel filter) and caches them.
  - The registry can later point an id at a CC0 texture set (ambientCG or Poly Haven) instead. v1 may bundle up to 3 MB of CC0 sets where procedural maps look fake (wood floor, marble, fabric), and must record their licences.
  - Paint uses the matt, silk or gloss roughness with a faint plaster normal map.
- **Kits** (`kits/index.js`): this is the furniture and prop registry. `registerKit(id, build(params) → Object3D)` defines a kit. Every kit is built from bevelled and rounded geometry (RoundedBox, lathe, tube, extrude), never raw boxes.
  - The v1 library covers sofas, armchairs, coffee and side tables, rugs, a TV unit, curtains and blinds, beds with bedding, wardrobes, a dining set, a kitchen run with appliances, office workstations, task chairs, a meeting table, a reception desk, shelving, clothing rails, display tables, a cash counter, a café counter, pendant and floor lamps, plants in planters, artwork, mirrors and books.
  - Exterior props are hedges, trees, planters, gates, street lights and a parked car.
  - A kit can later be backed by a CC0 GLB without changing any property file.
- **Quality tiers** (`quality.js`):
  - *high:* GTAO, 4096 shadow maps, pixel ratio up to 2;
  - *medium:* no AO, 2048 shadow maps, pixel ratio up to 1.5;
  - *low:* no shadows, pixel ratio 1.
  - *auto* picks a tier from the device (mobile or desktop, WebGL2) and steps down if frames stay above 33 ms for 2 seconds.

**Cameras** (`cameras.js`):

- *Exterior:* orbit around the building, clamped above ground.
- *Dollhouse:* steep orbit with ceilings hidden and exterior faces culled. Interior faces are single-sided, so the near walls disappear. A level selector hides the floors above the chosen one.
- *Room:* eye height (1.55 m) inside a room. Drag looks around; WASD and the arrow keys walk, with collision against walls and furniture; clicking the floor glides there. Rooms switch with a fade.
- Every transition is an eased camera flight.

**Picking and paint:**

- Raycast against surface meshes. Hover shows a subtle outline; selection shows a short emissive pulse.
- Paint scope is *this wall*, *whole room*, *all exterior* or *everything*. The colour lerps over 0.4 s.
- `estimate.js` uses the coverage figures in `data.js` (two coats) and returns litres per room and in total. It also suggests tins with the existing `packsFor`.

**Colour fidelity check** (automated in verification): a matt wall in the reference room under Daylight should render within ΔE2000 6 of its swatch hex in its brightest lit region. The selected shade's flat swatch is always shown in the side panel, labelled as the true colour.

---

## 6. Part C: showcase properties (`properties/*`)

Each property is one module that exports a Building Model with fixtures, views and default paint. The catalogue lists its name, kind, a short description, the still images and the views.

| id | Property | What is in it |
|---|---|---|
| `dha-residence` | **Modern family home, 10 marla, double storey** | Exterior: white render with a stone-clad feature wall, wooden louvres, cantilevered slab canopies, glass balcony rail, car porch, boundary wall with sliding gate, lawn and street. Ground floor: drawing room, lounge and dining, kitchen. First floor: master bedroom, kids' bedroom. |
| `bahria-townhouse` | **Compact townhouse, 5 marla** | A narrow-front double-storey house with a brick and render façade. Inside: lounge with kitchenette, bedroom and stair hall. |
| `gulberg-office` | **Corporate office floor** | A glass and ACP façade on the building shell. Inside: reception with a feature wall, open-plan workstations, a glass meeting room, a manager's cabin, and a pantry and breakout area. |
| `high-street-shops` | **Shop row and boutique** | Three shopfronts with signage, awnings and shutters: boutique, café and pharmacy. Each façade is paintable on its own. Inside the boutique: clothing rails, display tables, a cash counter and a fitting room. |

Shop and business names are generic and fictional.

The visualiser page shows a property gallery: cards with still renders and a kind filter (All, Homes, Office, Retail). The selected property opens in the studio, with view tabs, a level selector, room chips, the shade panel (families, swatches and search), scope, light and finish controls, the per-room paint estimate, and "Save to my project". The URL encodes the state (`?property=dha-residence&view=room:lounge`), so every view can be linked.

---

## 7. Part D: "My property", upload and reconstruction

### Flow (`my-property.html`)

1. **Start.** The customer enters a property name, a type (House, Office or Shop) and the number of floors (1 to 4). Their existing projects are listed from the ProjectStore. There is also a **"Load the sample project"** button and a link to download the sample zip.
2. **Upload drawings.** Four required slots, each showing a live status:
   - **Floor plans:** one per floor.
   - **Section drawings:** every section cut marked on the plan.
   - **Working drawings:** one for each section.
   - **Layouts:** at least the site layout.

   Files can be dropped anywhere on the page. A DXF is placed into its slot automatically from its title text. A PDF or image asks which slot it belongs to and which floor or section it covers. Each file shows a thumbnail and what was read from it, for example "Ground floor plan · 23 walls · 9 doors · 8 windows · sections A-A, B-B".
3. **Requirements gate.** The checklist (§7.2) is shown beside the slots. **"Build my 3D model" stays disabled until every requirement is satisfied.** Each unmet item says exactly what is missing, for example "Section B-B is marked on your ground floor plan but no section drawing for B-B was uploaded".
4. **Review and trace (2D editor).**
   - *DXF packages* open with the auto-reconstructed walls, openings and rooms drawn over the plan, along with a report of what was found and any warnings.
   - *PDF and image packages* open with the plan as a backdrop. The customer sets the scale, then traces.
   - In both cases, heights come from a panel per level that is pre-filled from the sections (or from defaults), with the section drawing shown beside it. Door and window sizes come from the schedule table, pre-filled from the working drawings (or from Pakistani standard sizes).
5. **3D paint.** The same studio as the visualiser, loaded with the customer's Building Model. They can save to the project, estimate litres, and send the result on WhatsApp.
6. **Autosave.** Everything is saved to IndexedDB after every step. The project can be exported and imported as a `.amco.json` file (model plus paint), so it can be handed to Amco by hand.

### 7.2 Requirement rules (`importers/requirements.js`, pure)

| Rule | Satisfied when |
|---|---|
| R1 Floor plans | There is one plan per declared floor. A DXF plan's floor is read from its title ("GROUND FLOOR PLAN", "FIRST FLOOR PLAN", ...). A PDF or image plan's floor is chosen by the customer. |
| R2 Sections | There is at least one section drawing. If any DXF plan carries section marks, every mark letter needs a section with the same label ("SECTION A-A"). With PDF-only plans, the customer declares which labels are marked (at least one), and each must be covered. |
| R3 Working drawings | There is one working drawing for each required section label ("WORKING DRAWING ... A-A"). |
| R4 Layouts | There is at least one site layout ("SITE LAYOUT", "SITE PLAN" or "LAYOUT PLAN"). A furniture layout is accepted as an extra. |
| Files | Accepted types: `.dxf .pdf .png .jpg .jpeg .webp`. Each file must be 25 MB or less, and the project 150 MB or less. A `.dwg` is rejected with export instructions: "AutoCAD: File → Save As → DXF". |

`checkPackage(drawings, { floors, declaredSections })` returns `{ complete, items:[{ key, label, satisfied, files, missing:[...] }] }`.

### 7.3 Reading DXF without AI (`importers/dxf/*`, `importers/extract/*`)

All of this is deterministic geometry and text parsing.

**Reader.**
- Parses ASCII DXF, R12 through current versions. Entities read: LINE, LWPOLYLINE, POLYLINE/VERTEX, ARC, CIRCLE, TEXT, MTEXT (formatting codes stripped), INSERT (with block expansion, transforms and attributes) and DIMENSION (its text).
- Units come from `$INSUNITS`. If that is missing, a **thickness heuristic** decides: the most common wall-pair spacing of about 230 means mm, about 0.23 means m, about 9 means inches, and about 0.75 means feet. This works because Pakistani walls are 9" (230 mm) or 4½" (115 mm). The customer can override the units in review.

**Layer conventions.** These follow AIA/NCS naming, matched through an alias table in `extract/classify.js`, so new aliases are a one-line change.
- Walls: `A-WALL*`, `WALL*`. If no wall layer is found, the layer with the most wall-like parallel pairs is chosen.
- Doors: `A-DOOR*`, `DOOR*`. Windows: `A-GLAZ*`, `A-WIND*`, `WINDOW*`.
- Rooms: `A-AREA-IDEN`, `A-ANNO-ROOM`, `ROOM*`.
- Section marks: `A-ANNO-SECT`, `A-SECT*`, `SECTION*`. Levels: `A-ANNO-LEVL`, `LEVEL*`.
- Site: `C-PROP`, `A-SITE*`, `PLOT*`, `BOUNDARY*`, `GATE*`, `L-PLNT`, `A-SITE-PAVE`, `C-ROAD`, `A-SITE-BLDG`.

**Classify** (`classify.js`). The drawing kind and its label come from title text matched by regular expressions: floor plans by level, sections by letter, working drawings by letter, layouts by type.

**Plan extraction** (`plan.js`).

Walls:
1. Collect segments on the wall layers.
2. Bucket the segments by angle (±1°) and by perpendicular offset.
3. Pair parallel segments whose spacing is between 75 and 600 mm and whose projections overlap. Each segment pairs with its nearest partner. A pair gives a centreline piece with a thickness.
4. Merge collinear pieces of the same thickness across gaps when the gap is a junction (no wider than 1.5× the thickness) or contains an opening entity.
5. Snap wall ends to neighbouring centrelines to form L and T junctions, then node the graph.

Openings:
1. Cluster door and window entities, or take block inserts directly.
2. Project each cluster onto the nearest wall band; the projected span gives the width and the position.
3. Read the nearest `D\d+` or `W\d+` tag text within 1.5 m, which links the opening to its schedule entry.

Rooms:
1. Enumerate the faces of the wall graph and drop the outer face.
2. Name each face from the room text inside it (a vocabulary maps names to uses: lounge, drawing, bed, kitchen, dining, bath, store, office, reception, shop, ...).

Section marks: the distinct letters found on the section layers, or in "A-A" text.

**Section extraction** (`section.js`). Level markers are read by regex:
- `FFL`, `F.F.L`, `FINISH FLOOR`, `CEILING`, `CLG`, `SLAB`, `ROOF`, `PARAPET`, `PLINTH`, `SILL`, `LINTEL`;
- each followed by a value in m or mm (`±0.000`, `+3.350`, `+3350`) or in ft-in (`+10'-6"`);
- grouped by the storey names in the same text or on the same row.

These give the floor elevations, floor-to-floor heights, clear ceiling heights, slab thickness, parapet height and the default sill and lintel heights. Where a value is missing, a Pakistani default is used: ceiling 3.05 m, slab 0.15 m, parapet 1.07 m, plinth 0.45 m, sill 0.9 m, lintel 2.1 m. Every default used is recorded as a warning.

**Schedule extraction** (`schedule.js`). Working-drawing text is grouped into rows by baseline. Each row is matched for a tag, a type, `W x H` in mm or ft-in, an optional `SILL n` and the material. The result is a `{ tag → { type, width, height, sill, material } }` map. When the schedule width differs from the width measured on the plan by more than 5%, the schedule wins and a warning is recorded.

**Layout extraction** (`layout.js`):
- the plot boundary, taken as the largest closed polyline on the site or property layers;
- the boundary wall and its gate gaps;
- lawn, paving and road polygons;
- the building footprint (`A-SITE-BLDG`), used to align the plan into the plot. Without a footprint, the plan and layout are assumed to share an origin.

**Assembly** (`assemble.js`) takes the drawings and options and returns `{ building, report:{ counts, levels, warnings[], unitsUsed } }`. The building passes `validateBuilding`. Every wall and opening carries a reference to the drawing it came from, so the review editor can highlight it.

### 7.4 2D review and trace editor (`editor/*`)

This is an SVG-based editor. It shares the Building Model and the geometry module with the engine, so whatever the customer draws is exactly what gets built.

- **Navigation:** pan and zoom; a tab per level; the backdrop drawing for each level (DXF linework or a PDF/image bitmap); the backdrop opacity can be adjusted.
- **Scale tool:** click two points, then type the real length (ft-in or m).
- **Wall tool:**
  - click to click, drawing a polyline;
  - orthogonal lock on by default, Shift for free angles;
  - snaps to endpoints and to walls;
  - thickness chips: 9" exterior and 4½" partition, plus a custom value.
- **Door and window tool:** hover a wall to preview the opening, click to place it. The size comes from the selected schedule type. The schedule table is editable and pre-filled from the working drawings or with standard sizes (D1 3'×7', D2 2'6"×7', W1 4'×4', W2 6'×4', V1 2'×1'6").
- **Room tool:** rooms are detected automatically from closed wall loops. Click a room to name it and set its use.
- **Site tool:** on the layout backdrop, draw the plot boundary, the boundary wall and the gate.
- **Select tool:** drag endpoints, edit properties in the side panel, delete. Undo and redo use a command stack.
- **Live 3D:** a "Preview 3D" button opens the engine's dollhouse view of the current model.

### 7.5 Storage (`storage/*`)

```js
ProjectStore: list(), get(id), save(project), remove(id),
              putFile(projectId, fileId, blob, meta), getFile(projectId, fileId)
Project { id, name, kind, floors, created, updated, status:'collecting'|'review'|'ready',
          drawings:[{ fileId, name, format, slot, level?, section?, summary }],
          declaredSections?, building?, paint?, schedule?, scale? }
```

`createIdbStore()` implements this on IndexedDB. Storage-quota errors surface as a clear message ("Your browser is out of space for drawings. Remove an old project or export this one."). A later `SupabaseProjectStore` would implement the same interface.

---

## 8. Part E: sample drawing set

The sample is a fictional **"Sample House, 10 marla, DHA Lahore"**: a 35′ × 65′ plot with a double-storey house, 9″ exterior walls and 4½″ partitions.

- *Ground floor:* car porch, drawing room, TV lounge with dining, kitchen, guest bedroom with bath, powder room, stair hall.
- *First floor:* master bedroom with bath, a second bedroom with bath, family lounge, front balcony.

`tools/sample-drawings/generate.mjs` defines the house once, as a Building Model in `sample-house.js`, and emits:

| File | Contents |
|---|---|
| `01-ground-floor-plan.dxf/.pdf` | Walls (pairs on A-WALL), doors with swings, windows, D/W tags, room names, section marks A and B, dimensions, title block |
| `02-first-floor-plan.dxf/.pdf` | The same conventions for the first floor |
| `03-section-A-A.dxf/.pdf` | Longitudinal section with FFL, ceiling, slab, parapet and plinth levels for both storeys |
| `04-section-B-B.dxf/.pdf` | Cross section |
| `05-working-drawing-A-A.dxf/.pdf` | Section A-A dimensioned, front elevation, and the door and window schedule |
| `06-working-drawing-B-B.dxf/.pdf` | Section B-B details, side elevation, and the schedule repeated |
| `07-site-layout.dxf/.pdf` | Plot boundary, boundary wall, gate, driveway, lawn and building footprint |
| `README.txt` | What each file is, and the layer conventions |

- The DXFs are R12 ASCII, which AutoCAD, LibreCAD and every viewer can open, in mm.
- The PDFs are A3 sheets with a title block, rendered from the same geometry as SVG and printed by headless Chrome. They let the trace path be tested with real PDFs.
- `zip.mjs` is a minimal zip writer (store method plus CRC32, no dependencies). It produces `website/samples/amco-sample-drawings.zip`.

**Round-trip test:** generate the sample, import it, and compare the result with `sample-house.js`. Wall count, lengths within ±20 mm, openings by tag and position within ±30 mm, rooms by name, and levels all have to match. This is the importer's main acceptance test.

---

## 9. Error handling

- **Unparseable DXF:** the file stays in its slot, marked "Couldn't read this file" with the reason (binary or DWG, unsupported version, empty model space). It does not count towards the requirements.
- **Partial extraction** (for example walls found but no rooms): reconstruction continues with warnings, and the review editor highlights the gaps.
- **No WebGL:** the studio shows a static still and a link to the shade card. The upload and the 2D editor still work.
- **pdf.js failure:** the customer is offered to upload a PNG or JPG export of the same sheet instead.
- **Storage blocked** (private mode): the project works for the session, with a banner saying it won't be saved, plus a working "Export project" button.
- **Engine load failure** on a property: an error card with a retry button. Other properties stay available.
- All customer-visible text is plain English, and every error offers a next step.

---

## 10. Testing and verification

**Unit tests** (`node --test tests/`, Node 22, no dependencies) cover:
- geometry: mitre joins, noding, face enumeration, inset, areas;
- schema validation;
- surfaces and areas;
- the DXF tokenizer and reader: R12 and R2000, LWPOLYLINE bulges ignored with a warning, INSERT transforms, MTEXT cleanup;
- units detection;
- every extractor, using small fixture strings;
- the requirement rules (every rule and its missing-item messages);
- the estimate maths;
- the sample **round-trip** test.

**Visual verification** uses headless Chrome screenshots (`tools/` scripts) at 1440 and 390 px widths for every page. For the 3D, it captures the exterior, dollhouse and one room view of each property, plus a reconstructed sample. The screenshots are checked against the success criteria, and the colour-fidelity sample is taken from the room view.

**Flow checks:**
- load the sample project: build, paint, save, reload, and confirm the paint persists;
- upload each sample file by hand: watch the gate open only when the set is complete;
- remove section B-B: the gate closes with the right message;
- PDF-only path: calibrate, trace two rooms, build;
- the landing page on mobile;
- `prefers-reduced-motion`;
- keyboard focus order on the studio controls.

**Performance:**
- Landing page: no three.js loaded; LCP image 250 KB or less; fonts 150 KB or less.
- Visualiser: 50 fps or better on the high tier on a mid-range laptop (integrated GPU allowed to drop to medium); first frame in under 3 s on broadband.

---

## 11. Build order

The work is done by agent teams, each owning its own files.

0. **Contract (sequential).**
   - `git init`, local only: gives rollback and isolated worktrees for the agents.
   - Vendor the dependencies; split the CSS into tokens.
   - Build `model/` (schema, geometry, surfaces) with tests.
   - Stub `engine/viewer.js` with the full API.
   - Write the `legacy.js` adapter.
1. **Three parallel tracks:**
   - **A, design:** the design system, photography with credits, the landing page and hero recolour, and the inner-page restyle.
   - **B, engine:** compile, materials, kits, cameras, picking, paint and estimate; the four properties; `visualiser.html`.
   - **C, import:** the DXF reader and extractors, requirements and assembly; the sample generator, zip and PDFs; the round-trip tests.
2. **Track D, my property (needs B and C):** the storage layer, `my-property.html` (upload slots and requirements), the 2D editor, and the 3D paint integration.
3. **Integration:**
   - still renders and tin renders for the landing page;
   - redirects and link updates;
   - README;
   - an independent QA review of every changed file against this spec;
   - the full verification pass in §10.

Each phase gets its own implementation plan in `docs/superpowers/plans/`.

---

## 12. Risks, placeholders and future extensions

**Risks**
- *Real-time realism has a ceiling.* The target is good real-time architectural visualisation, not photographs. The mitigation is the AO, colour-accurate tone mapping, bevelled kits and the material quality spelled out above. CC0 texture or GLB swaps stay open through the registries.
- *Real-world DXFs are messy.* Inconsistent layers, walls drawn as single lines, blocks inside blocks. The mitigation is the alias table, the wall-layer auto-detection, warnings, and the review editor as a mandatory step. The sample set follows the conventions exactly. A "Drawing guide for architects" section on the upload page explains them.
- *Hero masks need hand authoring per photo.* The mitigation is to choose photos with large, clear walls. Without a mask, the slide is shown static.

**Placeholders (flagged in the README):** photos (third-party licensed, swap for Amco's shoot); tin renders (swap for real packshots); trust-band numbers; plus everything already listed: prices, shades, dealers, the WhatsApp number and the proposed products.

**Extensions the architecture already allows:**
- a cloud `ProjectStore` (Supabase), so uploads become leads;
- a DWG importer (server-side converter);
- an IFC importer;
- a vector-PDF importer (pdf.js operator lists);
- stairs, curved walls and more kits;
- per-property CC0 GLB furniture;
- shareable project links;
- AR preview.
