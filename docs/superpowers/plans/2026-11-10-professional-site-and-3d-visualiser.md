# Amco professional site + realistic 3D visualiser + "build your own property" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the cartoonish Amco Paints MVP into a Dulux-grade site with a realistic multi-property 3D paint visualiser and a no-AI "upload your drawings → 3D → paint" feature, plus a dummy drawing set to test it.

**Architecture:** One Building Model JSON format (`amco.building/1`) is the contract between everything: showcase property files, the DXF importer and the 2D trace editor all produce it; one three.js engine renders and paints it; one `ProjectStore` persists it. Pure modules (model, DXF reader, extractors, requirements, assemble) have no DOM/three dependency and are unit-tested in Node. Browser code is native ES modules with an import map — no build step.

**Tech Stack:** HTML/CSS/JS (ES2022 modules), three.js 0.187.0 (vendored), pdfjs-dist 6.5.438 (vendored, lazy), Instrument Serif + Instrument Sans (self-hosted), Node 22 `node:test` for tests, headless Chrome for screenshots/PDFs/stills, Python Pillow for image conversion.

**Spec:** `docs/superpowers/specs/2026-11-10-professional-site-and-3d-visualiser-design.md` — read it before your track. The spec wins on intent; this plan wins on names, files and signatures.

## Global Constraints

- No build step. Browser code = native ES modules loaded via `<script type="module">`; `three` and `three/addons/` resolved by an import map pointing at `assets/vendor/three/`. All imports inside `assets/app/` are **relative** (`'../model/geometry.js'`), except the bare `'three'` / `'three/addons/...'` specifiers in browser-only modules.
- Pure modules (no `document`, `window`, `three`): `assets/app/model/**`, `assets/app/importers/dxf/**`, `assets/app/importers/extract/**`, `assets/app/importers/requirements.js`, `assets/app/importers/assemble.js`, `assets/app/engine/estimate.js`, `assets/app/engine/paint-state.js`, `assets/app/storage/project-schema.js`, `assets/app/editor/commands.js`, `assets/app/editor/snap.js`.
- Runtime makes **no network calls** except `wa.me` links and same-origin static files. No CDN, no AI/ML, no analytics.
- Pinned: three **0.187.0**, pdfjs-dist **6.5.438**, @fontsource/instrument-serif **5.3.0**, @fontsource-variable/instrument-sans **5.3.0**.
- Units in the Building Model are **metres**; plan coords `[x, y]` (x east, y north) → world `(x, elevation, -y)`.
- Wall sides: `L` = left of a→b, `R` = right. Surface ids: `${wallId}:L`, `${wallId}:R`, `site:inner`, `site:outer`, `${roomId}:ceiling`.
- Paint state shape: `{ [surfaceId]: { code: 'AM-5006', finish: 'matt'|'silk'|'gloss' } }`.
- Existing classic scripts (`assets/js/site.js`, `shades.js`, `data.js`, `colours.js`, `tools.js`, `products.js`, `dealers.js`) keep their globals (`window.Amco`, `window.AmcoShades`, `window.AmcoData`). Modules reach them only through `assets/app/legacy.js`.
- Code style: 2-space indent, single quotes, semicolons; named exports; JSDoc on every exported function; British spelling in UI copy ("colour"); plain English copy; no `TODO`/`FIXME`, no commented-out code, no leftover `console.log` (only `console.error` in catch paths).
- Accessibility: every control keyboard reachable, `aria-pressed`/`aria-label` on toggle/icon buttons, visible `:focus-visible`, `prefers-reduced-motion` respected.
- Placeholder data (prices, shades, dealers, WhatsApp number, proposed products, stock photos, tin renders, trust numbers) stays flagged as placeholder in README.
- No git commits (the user will set up the repo later). "Commit" steps below are replaced by: run the track's tests and record the result in your report.
- Local serving for checks: `python -m http.server 8765 -d "C:/Users/Baqir/Documents/jj/Amco Paints"` then open `http://127.0.0.1:8765/website/...` (serving the repo root lets `tools/dev/*` harness pages import from `../../website/assets/...`). Headless Chrome: `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1440,900 --virtual-time-budget=8000 --screenshot=OUT.png URL`.
- Tests: `node --test "tests/**/*.test.js"` from repo root (`package.json` has `"type": "module"`).

## Review Focus

1. **A real customer DXF in feet/inches with walls on layer `0` and no `$INSUNITS`** → units detected from 9″/4½″ wall spacing, wall layer auto-detected, clear warning; never a crash. Test: `tests/importers/plan.test.js` "inch drawing on layer 0".
2. **Section labels written differently** ("SEC. A-A", "SECTION 1-1", "A–A" with an en dash, "Section a-a") → all match the same requirement. Test: `tests/importers/classify.test.js` "section label variants".
3. **Re-uploading a corrected file into a filled slot** → replaces, never double-counts; requirements recomputed. Test: `tests/importers/requirements.test.js` "duplicate section drawings count once".
4. **Browser storage blocked or over quota** → project keeps working in memory with a visible banner + working export. Test: `tests/storage/project-store.test.js` "falls back to memory store when backend throws".
5. **Phone/touch in the 3D studio** → dragging rotates without scrolling the page; a tap selects a wall. Verified in Task B1.5 by `touch-action:none` assertion + manual check at 390px.

---

## Phase 0 — Contract (orchestrator, sequential)

### Task 0.1: Tooling, vendored dependencies, import map

**Files:**
- Create: `package.json`, `.gitignore`, `tools/vendor.mjs`
- Create (generated): `website/assets/vendor/three/**`, `website/assets/vendor/pdfjs/**`, `website/assets/fonts/instrument-serif-*.woff2`, `website/assets/fonts/instrument-sans-*.woff2`
- Modify: `website/assets/fonts/fonts.css` (add the two families; keep Archivo until Track A removes it, keep Nastaliq)

**Produces:** the import map every 3D/editor page pastes into `<head>`:
```html
<script type="importmap">
{ "imports": {
  "three": "./assets/vendor/three/three.module.js",
  "three/addons/": "./assets/vendor/three/addons/"
} }
</script>
```
- [ ] `package.json`: `{ "name":"amco-paints", "private":true, "type":"module", "scripts":{ "test":"node --test \"tests/**/*.test.js\"", "vendor":"node tools/vendor.mjs", "samples":"node tools/sample-drawings/generate.mjs", "serve":"python -m http.server 8765" }, "devDependencies":{ "three":"0.187.0", "pdfjs-dist":"6.5.438", "@fontsource/instrument-serif":"5.3.0", "@fontsource-variable/instrument-sans":"5.3.0", "esbuild":"<latest>" } }`; `npm install`.
- [ ] `tools/vendor.mjs`: copy `three/build/three.module.js` + `three.core.js`; for each addon entry (`controls/OrbitControls.js`, `environments/RoomEnvironment.js`, `geometries/RoundedBoxGeometry.js`, `utils/BufferGeometryUtils.js`, `postprocessing/{EffectComposer,RenderPass,GTAOPass,SMAAPass,OutputPass}.js`, `lights/RectAreaLightUniformsLib.js`, `objects/Sky.js`, `math/SimplexNoise.js`) copy it and recursively every relative import it references into `assets/vendor/three/addons/`; minify all copied JS with esbuild (`minify:true`, `format:'esm'`, keep file names); copy `pdfjs-dist/build/pdf.min.mjs` + `pdf.worker.min.mjs`; copy latin + latin-ext woff2 for both fonts.
- [ ] Run `npm run vendor`; verify with a headless-Chrome smoke page that `import * as THREE from 'three'` and every addon imports without error.

### Task 0.2: Model module (schema, geometry, surfaces, units) with tests

**Files:**
- Create: `website/assets/app/model/schema.js`, `geometry.js`, `surfaces.js`, `units.js`
- Create: `tests/fixtures/two-room-house.js`, `tests/model/geometry.test.js`, `tests/model/schema.test.js`, `tests/model/surfaces.test.js`, `tests/model/units.test.js`

**Produces (exact exports):**
```js
// schema.js
export const SCHEMA = 'amco.building/1';
export const ROOM_USES = ['living','drawing','lounge','dining','kitchen','bedroom','bath','study','hall','stair','store','porch','balcony','office','reception','meeting','pantry','shop','cafe','fitting','corridor','other'];
export function createBuilding({ id, name, kind, source }) /* -> Building with empty arrays */;
export function validateBuilding(building) /* -> { ok:boolean, errors:string[], warnings:string[] } */;
export function guessRoomUse(name) /* 'Master Bedroom' -> 'bedroom' */;

// geometry.js  (points are [x,y] arrays)
export const EPS;
export function sub(a,b), add(a,b), scale(a,s), dot(a,b), cross(a,b), length(a), normalize(a), leftNormal(d), distance(a,b), lerp(a,b,t);
export function lineIntersection(p, d, q, e) /* infinite lines p+td, q+se -> [x,y] | null */;
export function projectOnSegment(pt, a, b) /* -> { t (0..1 unclamped), point, distance } */;
export function polygonArea(poly) /* signed, CCW positive */;
export function polygonCentroid(poly);
export function pointInPolygon(pt, poly);
export function nodeWalls(walls, tolerance = 0.02) /* -> new walls array: ends snapped, walls split where another wall end touches them (T); split walls keep openings re-based; ids `${id}`, `${id}~2` */;
export function wallFootprints(walls) /* -> Map<wallId, { L:[p0,p1], R:[p0,p1], polygon:[x,y][] }> mitred at shared nodes */;
export function findRoomFaces(walls) /* -> [{ polygon, area }] interior faces of the centreline graph (outer face dropped) */;

// surfaces.js
export function roomPolygons(building) /* -> Map<roomId, polygon> (room.polygon, else face containing room.at) */;
export function deriveSurfaces(building) /* -> Surface[] */;
// Surface = { id, wallId, side:'L'|'R', level, room:roomId|'exterior', label, t0, t1, height, grossArea, area, openings:[{ id, start, end, sill, head }] }
export function resolveSelector(building, surfaces, selector) /* surface id | 'room:<id>' | 'exterior' | 'site' | '*' -> surfaceId[] */;

// units.js
export const UNIT_FACTORS = { mm:0.001, cm:0.01, m:1, in:0.0254, ft:0.3048 };
export function parseLength(text, defaultUnit = 'm') /* "10'-6\"", "+3.350", "3350" (with defaultUnit 'mm'), "9\"" -> metres | null */;
export function formatLength(metres, system = 'imperial') /* 3.2004 -> "10′ 6″" ; 'metric' -> "3.20 m" */;
```
- [ ] Write fixture `two-room-house.js`: 1 level (ceiling 3.05), 7 walls forming two rooms side by side (outer 8×5 m, partition at x=4), 0.23 exterior / 0.115 partition, one door in the partition, one window per room, rooms with `at` points named "Lounge" and "Bedroom".
- [ ] Write failing tests, including:
```js
test('mitred L corner meets exactly', () => {
  const walls = [{ id:'w1', a:[0,0], b:[4,0], thickness:0.2, level:'g', openings:[] },
                 { id:'w2', a:[4,0], b:[4,3], thickness:0.2, level:'g', openings:[] }];
  const fp = wallFootprints(walls);
  // inner corner (left side of w1 = y>0 side, left of w2 = x<4 side)
  assert.deepEqual(round(fp.get('w1').L[1]), [3.9, 0.1]);
  assert.deepEqual(round(fp.get('w2').L[0]), [3.9, 0.1]);
});
test('T-junction splits the through wall', () => { /* wall 0..8 on y=0, stub from (4,0) to (4,5) -> 3 walls */ });
test('two rooms found in fixture', () => { assert.equal(findRoomFaces(fixture.walls).length, 2); });
test('surface areas net of openings', () => { /* lounge window 1.5x1.2 subtracted from that face */ });
test('surface labels name the room and side', () => { /* 'Lounge, north wall' */ });
test('parseLength handles ft-in, mm, signed metres', ...);
```
- [ ] Implement until green: `npm test`.

### Task 0.3: Shared seams

**Files:**
- Create: `website/assets/app/legacy.js` — `export const shades = window.AmcoShades; export const amco = window.Amco; export const data = window.AmcoData;` plus `export function shade(code)` that returns `{ code, name, hex, ink, family }` or `null`.
- Create: `website/assets/app/engine/viewer.js` — **interface stub** with the full JSDoc'd API from spec §5 (throws `Error('not implemented')`), so Tracks B2/D can import it.
- Create: `website/assets/app/engine/kits/index.js` — the kit registry (real, small):
```js
const kits = new Map();
/** @param {string} id @param {{ build:(params:object, ctx:KitContext)=>import('three').Object3D, footprint?:[number,number] }} def */
export function registerKit(id, def) { kits.set(id, def); }
export function hasKit(id) { return kits.has(id); }
export function buildKit(id, params, ctx) { const k = kits.get(id); if (!k) throw new Error(`Unknown kit ${id}`); return k.build(params || {}, ctx); }
export function listKits() { return [...kits.keys()]; }
// KitContext = { THREE, mat(id, opts?) => Material, rounded(w,h,d,r,seg?) => BufferGeometry, quality:'high'|'medium'|'low' }
```
- Create: `website/assets/css/tokens.css` — design tokens (names fixed now, values tunable by Track A): `--color-paper #fff; --color-canvas #F6F4F0; --color-ink #1D2023; --color-ink-soft #5F656B; --color-line #E4E0D9; --color-brand #C8202A; --color-ok #1d7a4f; --color-warn #a45a00; --font-display 'Instrument Serif', Georgia, serif; --font-sans 'Instrument Sans', system-ui, sans-serif; --font-urdu (existing); --text-xs .75rem ... --text-5xl 5rem; --space-1 .25rem ... --space-16 8rem; --radius-sm 2px; --radius-md 6px; --shadow-1 0 12px 32px -18px rgba(29,32,35,.35); --ease cubic-bezier(.2,.7,.2,1); --header-h 72px;` and **legacy aliases** (`--ink`, `--ink-soft`, `--paper`, `--wash`, `--line`, `--brand`, `--brand-ink`, `--radius`, `--step--1..--step-5`) mapped to the new tokens so old inline styles keep working.

---

## Phase 1 — Parallel tracks (A, B1, B2, C, D2)

Each track owns only its listed files. Read spec + this plan + Phase 0 files first.

### Track A — Design system, landing page, inner pages

**Owns:** `website/assets/css/**` (except `tokens.css` names), `website/assets/fonts/**`, `website/assets/img/photos/**`, `website/assets/img/products/**`, `website/assets/app/content/**`, `website/assets/app/ui/hero-recolour.js`, `website/assets/app/ui/home-page.js`, `website/assets/js/site.js` (header/footer/drawer markup only — keep `window.Amco` API identical), `website/index.html`, `website/colours.html`, `website/tools.html`, `website/products.html`, `website/dealers.html`, `website/assets/js/home.js` (delete when unused), `tools/render-tins.mjs`, `tools/screenshot.mjs`.

#### Task A1: Base + components + shell
- [ ] Load the `frontend-design` skill for craft guidance; direction is fixed by spec §4 (photography-led, Instrument Serif display at weight 400, Instrument Sans UI, charcoal/white chrome, brand red as accent only, 2–6px radius, hairlines).
- [ ] `assets/css/site.css` becomes the single entry every page links: `@import url('tokens.css'); @import url('base.css'); @import url('components.css');` then page files are linked separately (`pages/home.css`, etc.). Remove Archivo from `fonts.css` and delete its woff2 files once nothing references them.
- [ ] `base.css`: reset, typography (display headings in serif, body in sans 16/1.6), links, focus ring, layout (`.wrap` max 1320, `.band` padding 96–128px desktop / 64px mobile), utility classes still used by existing pages (`.stack*`, `.split*`, `.grid`, `.row*`, `.muted`, `.small`, `.num`, `.urdu`, `.visually-hidden`).
- [ ] `components.css`: restyle every existing component class (`.btn*`, `.seg`, `.field`, `.input`, `.select`, `.panel`, `.leaf`, `.result`, `.table`, `.tag`, `.note`, `.chip*`, `.swatch-btn`, `.dot`, `.drawer*`, `.scrim`, `.project-item`, `.icon-btn`, `.toast`, `.count-badge`, `.list-check`) in the new language; add `.utility-bar`, `.site-header` (sticky, condenses on scroll via `[data-scrolled]`), `.mega-nav` not needed — plain nav, `.card`, `.card-media`, `.eyebrow`, `.editorial-head` (replaces `.page-title`), `.swatch` (square chip + name/code below), `.icon` (inline SVG 1.5px stroke).
- [ ] `site.js`: new header markup = utility bar ("Made in Lahore since 1985" · Find a dealer · Painter services · WhatsApp) + logo (refined wordmark: brand-red mark + "AMCO" set in Instrument Sans semibold, letter-spaced, with "Makers of Cover Up paints" small) + nav: **Colours** (`colours.html`), **Visualiser** (`visualiser.html`), **Upload your plans** (`my-property.html`), **Products** (`products.html`), **Tools & advice** (`tools.html`), **Dealers** (`dealers.html`) + "My project" button. Footer restyled; footer link "Walk the house in 3D" → "3D visualiser" (`visualiser.html`); add "Upload your plans". Add `data-scrolled` toggling on scroll (passive listener). `window.Amco` API unchanged.
- [ ] Verify: `tools/screenshot.mjs <url> <out> [width]` (wraps headless Chrome) — screenshot all 5 existing pages at 1440 and 390; nothing overflows horizontally at 390 (`document.documentElement.scrollWidth <= 390` check via a `--dump-dom` probe or by eye).

#### Task A2: Photography
- [ ] Choose ~10 photos from Unsplash (unsplash.com/license — **exclude Unsplash+**) or Pexels (pexels.com/license): slots `hero-living-1`, `hero-living-2`, `hero-living-3` (each must show a large **plain light-coloured wall** with little furniture overlapping it — required for recolour masks), `space-bedroom`, `space-kitchen`, `space-exterior` (contemporary house, warm climate if possible), `space-office`, `space-retail`, `painter`, `palette` (fan deck/swatches). Avoid any visible third-party paint brand.
- [ ] Download originals into a temp dir, convert with Pillow to webp at widths 640/1280/1920 (quality 78) into `assets/img/photos/<slot>-<w>.webp`; hero 1280 ≤ 250 KB.
- [ ] `assets/img/photos/CREDITS.md`: slot, photographer, source page URL, licence name, date downloaded.
- [ ] `assets/app/content/photos.js`: `export const PHOTOS = { [slot]: { alt, credit, sizes:[640,1280,1920], focal:[x%,y%], wallMask?: [[x%,y%],...] } }` and `export function srcset(slot)`.

#### Task A3: Landing page + hero recolour
- [ ] `ui/hero-recolour.js`: `mountHeroRecolour(root, { slides:[slot...], shades:[code...] })` — renders the photo (`<img srcset>`), an absolutely-positioned SVG with a `<clipPath>` from `wallMask` and a `<rect fill=shadeHex>` using `mix-blend-mode:multiply` (+ a second low-opacity `color` blend layer to push saturation if needed), cross-fades slides every 7s (paused on hover/focus, disabled under reduced motion), shade row buttons recolour the active slide with a 500ms fill transition, and the split panel (`--panel` = shade hex, ink chosen from shade.ink) shows shade name/code/story.
- [ ] Hand-author `wallMask` polygons for each hero photo by viewing the image (Read the 1280 webp) — trace the visible wall area excluding furniture/frames/windows; verify by screenshot that a dark shade (AM-5006) reads as a believably repainted wall with photo shading intact.
- [ ] `index.html` + `assets/css/pages/home.css` + `ui/home-page.js`: sections in spec §4 order (utility/header via site.js; hero; explore by space → `visualiser.html?property=…&view=…` links: living→`dha-residence&view=room:lounge`, bedroom→`dha-residence&view=room:master-bedroom`, kitchen→`dha-residence&view=room:kitchen`, exterior→`dha-residence&view=exterior`, office→`gulberg-office&view=room:open-plan`, retail→`high-street-shops&view=exterior`; colour collection feature; visualiser band using `assets/img/stills/*.webp` (placeholder grey blocks until Phase 3 renders exist — use `<img>` with explicit width/height and `onerror` hiding); products with tin images; plan-your-job four columns; trust band (numbers flagged placeholder in README); dealer/painter CTA; footer). Keep the JSON-LD block. `home.js` and its old sections removed; delete `assets/js/home.js`.
- [ ] Verify screenshots at 1440 and 390; compare side by side with `scratchpad/refs/*.png` (Dulux/Jotun/Benjamin Moore) and iterate until it reads as a premium brand.

#### Task A4: Tin renders
- [ ] `tools/render-tins.mjs`: writes a temp HTML page (served from repo root) that renders a realistic 4-litre paint tin with three.js (lathe body with rolled rims, brushed-metal lid, wire handle, wrap-around label from a canvas: "COVER UP" wordmark, product name, colour band, "Amco Paints · Lahore"), studio lighting (RoomEnvironment + soft key), transparent background; captures one PNG per product category (interior emulsion, exterior weather coat, enamel, primer/putty) via headless Chrome `--screenshot` with `--default-background-color=00000000`; converts to webp into `assets/img/products/`.

#### Task A5: Inner pages restyle
- [ ] Replace each `.page-title` band with `.editorial-head` (eyebrow, serif title, lede, optional Urdu line, optional photo). Move inline `<style>` blocks into `assets/css/pages/{colours,tools,products,dealers}.css` and restyle to the new system. Do not change tool logic; if JS emits old markup that looks wrong, adjust only class names/markup strings in that page's JS.
- [ ] Replace every `walkthrough.html` link in these pages/JS with `visualiser.html`.
- [ ] Screenshot all pages 1440/390; zero horizontal overflow; consistent header/footer.

### Track B1 — 3D engine, studio UI, visualiser page

**Owns:** `website/assets/app/engine/**` except `engine/kits/*` content files (B1 owns `kits/index.js` usage only), `website/assets/app/ui/studio.js`, `website/assets/app/ui/shade-panel.js`, `website/assets/app/ui/visualiser-page.js`, `website/assets/css/pages/visualiser.css`, `website/assets/css/pages/studio.css`, `website/visualiser.html`, `website/walkthrough.html`, `website/assets/js/house3d.js` (delete at end), `tools/render-stills.mjs`, `tools/dev/engine.html`, `tests/engine/*.test.js`.

**Consumes:** Phase 0 model API; kit registry (`buildKit`, `hasKit`); `legacy.js`.

**Produces:**
```js
// engine/viewer.js
export function createViewer(container, options) -> Viewer   // options: { quality:'auto'|'high'|'medium'|'low', interactive=true, onSelect(surface|null), onHover(surface|null), onChange(paintState), onView({mode,level,room}) }
// Viewer: load(building, paintState?) -> Promise<void>; setView(viewIdOrSpec); setLevel(levelId|null); select(surfaceId|null);
//         paint(code, { scope:'surface'|'room'|'exterior'|'all', finish? }) -> boolean; setLight('day'|'warm'|'cool'); setFinish(finish);
//         getSurfaces() -> SurfaceInfo[] ({...Surface, code, finish, hex, shadeName}); getPaintState(); setPaintState(state);
//         estimate(productId) -> { rows:[{ room, label, area, litres }], totalArea, totalLitres, tins }; snapshot({width,height}) -> Promise<Blob>; dispose()
// engine/materials/registry.js
export function getMaterial(id, opts) -> THREE.Material   // cached by id+JSON(opts); ids listed in spec §5
export function registerMaterial(id, factory)
export function createPaintMaterial(hex, finish) -> THREE.MeshStandardMaterial
// engine/paint-state.js (pure)
export function applyPaint(state, surfaceIds, code, finish) -> newState; export function defaultPaintState(building, surfaces) -> state
// engine/estimate.js (pure)
export function estimateLitres(surfaces, paintState, product, coats = 2) -> { rows, totalArea, totalLitres }
// ui/studio.js
export function mountStudio(root, { building, paintState, onChange(paintState), onSave(paintState, look) , headerSlot? }) -> { viewer, destroy() }
```

#### Task B1.1: Renderer, quality tiers, lighting
- [ ] `renderer.js`: `createRenderer(container, quality)` — WebGL2 `WebGLRenderer({ antialias: quality!=='high', powerPreference:'high-performance' })`, `outputColorSpace = SRGBColorSpace`, `toneMapping = NeutralToneMapping`, shadows PCFSoft (off on low); `EffectComposer` on high: `RenderPass` → `GTAOPass` (blendIntensity ~0.9, radius ~0.35 m equivalent) → `SMAAPass` → `OutputPass`. Resize via ResizeObserver; pause when off-screen (IntersectionObserver) and when tab hidden.
- [ ] `quality.js`: `pickQuality()` (mobile UA/`matchMedia('(pointer:coarse)')` → medium; no WebGL2 → throw; else high) + `createFrameGovernor(onDowngrade)` stepping down when the 2s average frame time > 33ms.
- [ ] `lighting.js`: `createLighting(scene, renderer)` returns `{ setMode('day'|'warm'|'cool'), setContext('interior'|'exterior', bounds) }`. Interior env = PMREM of `RoomEnvironment`; exterior env = PMREM of a `Sky` + ground-colour scene; sun DirectionalLight with shadow camera fitted to bounds; per-room window `RectAreaLight`s added by compile; lamp lights tinted per mode (2700K ≈ #ffb46b, 6500K ≈ #e6f0ff); exposure per mode.
- [ ] Unit test (`tests/engine/estimate.test.js`, `paint-state.test.js`) for the pure parts written in B1.4.

#### Task B1.2: Materials
- [ ] `materials/procedural.js`: canvas generators returning `{ map, normalMap, roughnessMap }` (CanvasTexture, sRGB colour space on `map` only, RepeatWrapping, anisotropy 8): `plaster`, `concrete`, `marble` (veined), `porcelain` (large-format tiles with fine grout), `oak-floor` (planks with grain + per-plank tone variation), `walnut`, `stone-cladding` (random ashlar), `brick` (Pakistani small red brick bond), `fabric-linen`, `leather`, `lawn`, `paving`, `asphalt`, `gravel`, `brushed-steel`. Normals from height via Sobel. Generated once, cached, sizes 512 (medium/low) / 1024 (high).
- [ ] `materials/registry.js`: factories for all ids above + `glass` (MeshPhysicalMaterial, transmission 0 — use opacity .25 + envMap reflections + `clearcoat`), `glass-frosted`, `chrome`, `aluminium-dark`, `ceramic-white`, `rubber`, `led` (emissive), `paint` (via `createPaintMaterial`, roughness matt .92 / silk .55 / gloss .25, faint `plaster` normal at scale .15).

#### Task B1.3: Building compiler
- [ ] `compile/building.js`: `compileBuilding(building, ctx) -> { root:Group, surfaces:Surface[], surfaceMeshes:Map<surfaceId, Mesh[]>, levelGroups:Map<levelId, Group>, ceilings:Mesh[], exteriorFaces:Mesh[], rooms:Map<roomId,{ polygon, level, bounds }>, colliders:Box2[] }`.
- [ ] `compile/walls.js`: per level, `nodeWalls` → `wallFootprints`; for each wall side build a `ShapeGeometry` in face-local coords (`t0..t1` × `0..height`) with `Path` holes per opening, transformed onto the side plane; UVs in metres; tag `mesh.userData.surfaceId`. End caps where the footprint is exposed; top cap (dark `section-cut` material, visible only in dollhouse); opening reveals (jambs/head/sill quads through the thickness) assigned to the room-side surface (or exterior side for exterior-only openings); skirting (90mm, `ceramic-white`/`walnut` per room floor) along room-side faces skipping door openings. Exterior surfaces with `cladding` use that material instead of paint and are excluded from `surfaces`.
- [ ] `compile/openings.js`: for each opening build `buildKit(opening.style || defaultStyle(type), { width, height, thickness, role }, kitCtx)` placed at the opening bottom-centre in wall-local frame; fallback infill (simple frame + glass/door slab) when `!hasKit`. Windows add a `RectAreaLight` facing inward on interior levels (high/medium only).
- [ ] `compile/floors.js`: floor per room polygon (material from `room.floor` or by use: bedroom→`oak-floor`, kitchen/bath→`porcelain`, office→`carpet-tile` (add generator) , default `marble`); ceiling per room (paint material, surface `${roomId}:ceiling`, hidden in dollhouse/exterior), recessed downlights grid (emissive discs + one point light per room on high).
- [ ] `compile/roof.js`: slabs between levels (edge band visible on façade, thickness `level.slab`), roof slab, parapet walls on the top level following exterior wall footprints (paintable exterior surfaces `parapet:*`).
- [ ] `compile/site.js`: ground plane (large, `lawn` default), `site.ground` polygons extruded 2cm with their materials, boundary wall (from `site.boundary` minus gate gaps, height/thickness from model, coping, paintable `site:inner`/`site:outer`), gates via kit `gate.sliding`, street (asphalt + kerb + footpath) on `site.street.side`. Buildings without `site`: a paved plinth + lawn around the footprint.
- [ ] Fixtures: `buildKit(f.kit, f.params, kitCtx)` positioned at `(x, levelElevation, -y)` rotated `-rotation°` about Y; collect XZ bounding boxes as colliders.

#### Task B1.4: Cameras, picking, paint, estimate
- [ ] `cameras.js`: modes `exterior` (OrbitControls, target = building centre, minPolar .2, maxPolar 1.45, distance clamp from bounds), `dollhouse` (OrbitControls, polar .35–1.05, ceilings + upper levels hidden, exterior faces hidden, interior wall materials `side: FrontSide`), `room` (eye 1.55 m, yaw/pitch drag with pointer capture, WASD/arrow walk with collision against walls (footprints) + colliders, click-floor glide, fade transition between rooms). Eased fly-to (600 ms) between views. `touch-action:none` on the canvas.
- [ ] `picking.js`: raycast surface meshes only (respecting visibility); hover outline via a slightly scaled back-face clone in an overlay group or emissive tint; selection pulse.
- [ ] `paint-state.js` + `estimate.js` (pure) with tests:
```js
test('room scope paints every surface in the room', ...);
test('estimate: 20 m² at 11 m²/L, two coats = 3.64 L', () => { /* uses product.coverage */ });
test('estimate excludes cladded and unpainted surfaces', ...);
```
- [ ] Paint colour lerp 0.4s; finish change updates roughness of painted materials.

#### Task B1.5: Viewer API, studio UI, visualiser page
- [ ] Implement `viewer.js` fully over the pieces above; `snapshot()` renders one frame at the requested size to an offscreen target and returns a webp Blob.
- [ ] `ui/shade-panel.js`: families tabs + search box (name/code) + square swatch grid (new `.swatch` style) + "true colour" chip of the selected shade; emits `onPick(code)`.
- [ ] `ui/studio.js` `mountStudio`: layout = stage (canvas + view tabs [Exterior · Dollhouse · rooms…] + level selector + hint) and side panel (selected surface card, scope seg [This wall · Whole room · All exterior], shade panel, light seg [Daylight · Warm bulb · Tube light], finish seg [Matt · Silk · Gloss], estimate list per room with total litres + product select (from `data.products`, wall paints), buttons "Save to my project" (calls `amco.project.setWalls` + `setEstimate`, same shape as today) and "Reset"). Error card when WebGL fails. Mobile: panel becomes a bottom sheet under the stage.
- [ ] `visualiser.html` (+ import map + classic scripts `shades.js`, `data.js`, `site.js` before the module) and `ui/visualiser-page.js`: gallery of `properties/index.js` `CATALOGUE` cards (still image, name, kind, description) with filter chips [All · Homes · Office · Retail]; selecting loads the property via its `load()` into the studio; URL state `?property=&view=` read on load and written with `history.replaceState`. Second CTA band: "Have your own drawings? Upload your plans" → `my-property.html`.
- [ ] `walkthrough.html` → minimal page with `<meta http-equiv="refresh" content="0; url=visualiser.html">` + link. Delete `assets/js/house3d.js` and `assets/vendor/three.min.js` once nothing references them (grep).
- [ ] `tools/render-stills.mjs`: for each property and view in a list, load `visualiser.html?property=…&view=…&still=1` (`still=1` hides UI, sets quality high, waits for `window.__amcoReady === true`) in headless Chrome with GPU flags `--use-angle=swiftshader --enable-unsafe-swiftshader` (or real GPU if available), screenshot 1600×1000, convert to webp in `assets/img/stills/<property>-<view>.webp`.
- [ ] Verify with `tools/dev/engine.html` (loads `tests/fixtures/two-room-house.js`) then with each property once B2 lands: screenshots of exterior / dollhouse / one room per property; colour-fidelity probe (sample the brightest 5% pixels of the selected wall vs swatch hex, report ΔE2000).

### Track B2 — Kits (furniture/props/openings) and the four properties

**Owns:** `website/assets/app/engine/kits/{seating,tables,beds,storage,kitchen,office,retail,lighting,decor,exterior,openings}.js`, `website/assets/app/engine/kits/all.js` (imports every kit file for side-effect registration), `website/assets/app/properties/**`, `tools/dev/kits.html`.

**Consumes:** `registerKit` + `KitContext` (Phase 0), `getMaterial(id, opts)` ids (B1.2 list), model schema.

**Produces:**
```js
// properties/index.js
export const CATALOGUE = [{ id, name, kind:'house'|'office'|'shop', blurb, still:'assets/img/stills/<id>-exterior.webp', views:[{id,label}], load: () => import('./<id>.js').then(m => m.default) }];
export function findProperty(id);
// each property module: export default Building (with fixtures, views, defaults)
```

#### Task B2.1: Kit library
- [ ] Every kit is built from `ctx.rounded(...)` (RoundedBoxGeometry), `LatheGeometry`, `TubeGeometry`, `ExtrudeGeometry` with bevels — no sharp raw boxes on anything you'd touch. Real-world dimensions in metres; origin at floor centre of footprint; front faces −Z (i.e. toward local −Z); `castShadow/receiveShadow` set.
- [ ] Ids (minimum): `sofa.3-seat`, `sofa.l-shape`, `armchair.lounge`, `ottoman`, `table.coffee`, `table.side`, `table.dining-6`, `chair.dining`, `rug.rect` (params w,d,material/pattern), `tv.unit`, `curtain.pair` (params width,height), `blind.roller`, `bed.king`, `bed.single`, `nightstand`, `wardrobe.2door`/`.3door`, `dresser`, `kitchen.run` (params length; base + wall cabinets, worktop, sink, hob, hood), `kitchen.island`, `fridge`, `desk.workstation-pod` (4 desks + screens + dividers), `chair.task`, `table.meeting` (params seats), `chair.meeting`, `desk.reception`, `desk.executive`, `shelving.open`, `storage.filing`, `rail.clothing` (with hanging garments), `table.display`, `counter.cash`, `counter.cafe`, `stool.bar`, `mannequin`, `mirror.full`, `fitting.room` (curtain booth), `lamp.floor`, `lamp.pendant`, `lamp.table`, `plant.floor` (fiddle-leaf / areca: leaf cards with alpha canvas texture), `plant.small`, `art.frame` (params w,h, abstract canvas print), `books.row`, `vase`, `hedge` (params length), `tree.ornamental`, `planter.box`, `streetlight`, `car.sedan` (rounded body, glass, wheels — believable silhouette), `gate.sliding` (params width,height; MS bars), opening infills `door.panel`, `door.main` (wider, wood veneer), `door.glass-slider`, `window.casement` (aluminium frame, mullions, glass), `window.fixed`, `shutter.rolling`, `shopfront.glass` (frameless glass + door), `curtainwall` (mullion grid), `garage.door`.
- [ ] Opening infill contract: params `{ width, height, thickness, role }`; local origin = bottom-centre of the opening in the wall mid-plane; x along wall, y up, z across thickness.
- [ ] `tools/dev/kits.html`: grid of every kit on a turntable (uses B1 renderer when available; before then a minimal local scene with RoomEnvironment + NeutralToneMapping). Screenshot and iterate until furniture reads as real product shapes.

#### Task B2.2: Properties
- [ ] `dha-residence.js` — 10 marla (approx. 10.7 m × 19.8 m plot), double storey per spec §6: levels ground (ceiling 3.2) + first (ceiling 3.05) + parapet 1.0; walls 0.23/0.115; rooms with `at`: `drawing-room`, `lounge`, `kitchen`, `master-bedroom`, `kids-bedroom` (+ hall/stair/bath as `use`); façade: white render, `stone-cladding` feature wall, wooden louvre screen (kit or decor), cantilevered canopies (slab extensions as fixtures), glass balcony rail; site: boundary, boundary wall 2.1 m with `gate.sliding`, lawn, driveway paving, street on south; fixtures furnishing each room fully (no empty rooms); `views`: `exterior`, `dollhouse`, `room:lounge`, `room:drawing-room`, `room:kitchen`, `room:master-bedroom`, `room:kids-bedroom`; defaults: tasteful palette (whites/greige with one feature wall per room).
- [ ] `bahria-townhouse.js` — 5 marla (approx. 7.6 m × 13.7 m), double storey, brick + render façade, rooms `lounge` (with kitchenette), `bedroom`, `stair-hall`; furnished; views.
- [ ] `gulberg-office.js` — one commercial floor (approx. 24 × 16 m) inside a shell with `curtainwall` + ACP band façade; rooms `reception` (feature wall), `open-plan` (workstation pods), `meeting-room` (glass partitions: walls with role `glass`), `manager-cabin`, `pantry`; carpet tile + polished concrete; views.
- [ ] `high-street-shops.js` — three adjoining units (each ≈ 6 m frontage × 12 m) with `shopfront.glass`/`shutter.rolling`, fascia sign boards (canvas text, generic names: "Noor Boutique", "Chai Corner Café", "City Pharmacy"), awnings, separately paintable façades; `boutique` interior furnished (rails, display tables, cash counter, fitting room, mirrors, mannequins); street + footpath; views.
- [ ] `index.js` `CATALOGUE` as above. Each property passes `validateBuilding` with zero errors (add `tests/properties/properties.test.js` that imports each default export and asserts `validateBuilding(b).ok` and every `fixtures[].kit` is a registered id — import `engine/kits/ids.js`, a pure list of kit ids exported by B2 for this test).

### Track C — DXF reading, extraction, requirements, assembly, sample set

**Owns:** `website/assets/app/importers/**`, `tools/sample-drawings/**`, `website/samples/**`, `tests/importers/**`, `tests/fixtures/dxf/**`.

**Produces:**
```js
// importers/dxf/reader.js (pure)
export function parseDxf(text) -> DxfDoc
// DxfDoc = { version, insunits:number|null, layers:string[], entities: Entity[], extents:{min:[x,y],max:[x,y]} }
// Entity (blocks expanded into model space, all coords in drawing units):
//  { type:'LINE', layer, a, b } | { type:'POLY', layer, points, closed } | { type:'ARC', layer, center, radius, startDeg, endDeg }
//  | { type:'CIRCLE', layer, center, radius } | { type:'TEXT', layer, at, text, height, rotationDeg }   (MTEXT -> TEXT, one per line)
//  | { type:'INSERT', layer, name, at, rotationDeg, scale:[sx,sy], attributes:{TAG:value} }   (kept in addition to its expanded children)
// importers/extract/classify.js (pure)
export function layerRole(layerName) -> 'wall'|'door'|'window'|'room'|'section'|'level'|'boundary'|'gate'|'lawn'|'paving'|'road'|'footprint'|'site'|null
export function normaliseSectionLabel(text) -> 'A' | '1' | null      // "SEC. A-A", "Section a–a", "SECTION 1-1"
export function classifyDrawing(doc) -> { kind:'plan'|'section'|'working'|'layout'|'unknown', levelIndex:number|null, levelName:string|null, section:string|null, title:string|null }
// importers/extract/units.js (pure)
export function detectUnits(doc, wallSpacings?) -> { unit:'mm'|'cm'|'m'|'in'|'ft', factor, source:'header'|'heuristic'|'default' }
// importers/extract/plan.js (pure) — returns metres
export function extractPlan(doc, { factor }) -> { walls:[{ a, b, thickness }], openings:[{ type:'door'|'window'|'opening', wall:number, at, width, tag:string|null }], rooms:[{ name, use, at }], sectionMarks:string[], wallLayer:string|null, warnings:string[] }
// importers/extract/section.js (pure)
export function extractSection(doc, { factor }) -> { section:string|null, levels:[{ index, name, ffl, ceiling:number|null, slab:number|null }], parapet:number|null, plinth:number|null, sill:number|null, lintel:number|null, warnings }
// importers/extract/schedule.js (pure)
export function extractSchedule(doc, { factor }) -> { section:string|null, entries:{ [tag]:{ type:'door'|'window'|'ventilator'|'opening', width, height, sill:number|null, material:string|null } }, warnings }
// importers/extract/layout.js (pure)
export function extractLayout(doc, { factor }) -> { boundary:[x,y][]|null, boundaryWall:{ thickness, height:number|null, gates:[{ at, width }] }|null, ground:[{ polygon, material }], footprint:[x,y][]|null, street:{ side, width }|null, warnings }
// importers/requirements.js (pure)
export function checkPackage(drawings, { floors, declaredSections = [] }) -> { complete:boolean, required:{ floors:number[], sections:string[] }, items:[{ key:'plans'|'sections'|'working'|'layouts', label, satisfied, files:string[], missing:string[] }] }
//   drawings: [{ id, name, format:'dxf'|'pdf'|'image', slot:'plan'|'section'|'working'|'layout', levelIndex?, section?, sectionMarks?:string[], readable:boolean }]
// importers/assemble.js (pure)
export function assemble(parsed, { name, kind, floors }) -> { building, report:{ counts:{ walls, doors, windows, rooms, levels }, unitsUsed, warnings:string[], defaultsUsed:string[] } }
//   parsed: [{ id, slot, levelIndex, section, doc, extracted }] where extracted is the matching extract* result
// importers/index.js (browser)
export async function readDrawing(file) -> ParsedDrawing  // { id, name, size, format, slot, levelIndex, section, sectionMarks, readable, error?, summary, doc?, extracted?, thumbnail:Blob|null }
export { checkPackage, assemble };
// importers/raster.js (browser): export async function rasterise(file, { maxSize = 4096 }) -> { bitmap: ImageBitmap, width, height, pages:number }  (pdf.js lazy-imported for PDFs, first page; image via createImageBitmap)
```

#### Task C1: DXF tokenizer + reader
- [ ] Tests first (`tests/importers/dxf-reader.test.js`) using inline DXF strings: R12 LINE/TEXT/POLYLINE+VERTEX+SEQEND; R2000 LWPOLYLINE (closed flag 70&1), MTEXT with `\P` line breaks and `{\fArial|b0;...}` formatting stripped; BLOCK + INSERT with rotation 90 and scale 2 expanded correctly; `$INSUNITS` read; CRLF line endings; unknown entities skipped without error; binary DXF / DWG header (`AC10`) rejected with `Error('Not an ASCII DXF')`.
- [ ] Implement `dxf/tokenizer.js` (pairs of code/value; trims; handles `\r\n`) and `dxf/reader.js`.

#### Task C2: Classify + units
- [ ] Tests: titles "GROUND FLOOR PLAN"→plan level 0; "FIRST FLOOR PLAN"→1; "SECOND FLOOR PLAN"→2; "BASEMENT PLAN"→-1; "SECTION A-A"/"SEC. A-A"/"Section a–a"/"SECTION 1-1"→section 'A'/'A'/'A'/'1'; "WORKING DRAWING SECTION B-B"/"W.D. B-B"/"DOOR & WINDOW SCHEDULE … B-B"→working 'B'; "SITE LAYOUT"/"SITE PLAN"/"LAYOUT PLAN"→layout; layer roles for every alias in spec §7.3; units: header 4→mm, 6→m, 1→in, 2→ft; heuristic: wall spacing mode 230→mm, 0.23→m, 9→in, 0.75→ft.
- [ ] Implement `extract/classify.js`, `extract/units.js` (alias table as one exported constant `LAYER_ALIASES`).

#### Task C3: Plan extraction
- [ ] Fixture builder in tests: use `tools/sample-drawings/dxf-writer.mjs` (C7) — so write the writer's minimal `createDxf()` API first: `const d = createDxf({ insunits:4 }); d.layer('A-WALL'); d.line(layer,a,b); d.poly(layer,pts,closed); d.arc(layer,c,r,s,e); d.circle(...); d.text(layer,at,height,text,rot=0); d.toString()`.
- [ ] Tests: single rectangle room 4000×3000 mm with 230 walls → 4 walls, thickness .23, 1 room; two rooms + partition with T junctions → 7 walls (after noding) & 2 rooms named from text; door gap 900 with arc+leaf on A-DOOR and tag "D1" → opening type door width .9 tag D1 at correct `at` (±0.03); window lines inside wall band on A-GLAZ with "W1" → window; walls on layer `0` in **inches** with no `$INSUNITS` → walls found, units 'in' heuristic, warning "Wall layer guessed"; section marks "A" and "B" text on A-ANNO-SECT → `['A','B']`; arc on wall layer → warning "Curved wall skipped".
- [ ] Implement `extract/plan.js` per spec §7.3 algorithm (angle bucket ±1°, pair spacing 0.075–0.6 m after factor, nearest partner, merge across junction gaps ≤1.5×thickness or gaps containing an opening cluster, end snapping to neighbouring centrelines within thickness, then `nodeWalls`; rooms via `findRoomFaces` + label text inside; opening clusters by layer with 0.1 m proximity union; tag = nearest `^[DWV]\d+[A-Z]?$` text within 1.5 m).

#### Task C4: Section, schedule, layout extraction
- [ ] Section tests: texts "GROUND FLOOR FFL ±0.000", "CEILING +3.050", "FIRST FLOOR FFL +3.350", "CEILING +6.400", "PARAPET +7.750", "PLINTH +0.450", "SILL +0.900", "LINTEL +2.100" (in m) → 2 levels (ffl 0 & 3.35, ceilings 3.05 & 3.05, slab .3), parapet 1.0 above roof (+6.75 roof slab top)…; same in ft-in ("FFL +11'-0\"") → converted; missing ceiling → default + entry in warnings.
- [ ] Schedule tests: rows "D1  DOOR  1050 x 2100  TEAK", "W1 WINDOW 1500X1200 SILL 900 ALUMINIUM", "V1 VENTILATOR 600 x 450 SILL 1800", "D2 3'-0\" x 7'-0\"" → entries in metres; row grouping by y within 0.6×text height; header row ignored.
- [ ] Layout tests: closed polyline on `C-PROP` → boundary; `A-SITE-WALL` line pairs → boundary wall thickness; gap with `GATE` text → gate; `L-PLNT` closed poly → lawn; `A-SITE-BLDG` → footprint; "ROAD" text side → street side.
- [ ] Implement `extract/section.js`, `extract/schedule.js`, `extract/layout.js`.

#### Task C5: Requirements
- [ ] Tests (one per rule + messages): complete package → complete; missing first floor plan when floors=2 → `missing:['First floor plan']`; plan marks A,B but only section A → `missing:['Section B-B']`; working for A missing → `missing:['Working drawing for section A-A']`; no layout → `missing:['Site layout']`; PDF-only plans with `declaredSections:['A']` → requires A only; PDF-only plans and no declared sections → sections item unsatisfied with message "Tell us which sections are marked on your plan"; **duplicate section drawings for A count once**; unreadable DXF in a slot does not satisfy.
- [ ] Implement `requirements.js`.

#### Task C6: Assembly
- [ ] Tests on the fixtures: plan + section + schedule + layout → building passes `validateBuilding`; level elevations/ceilings from section; opening sizes overridden by schedule with warning when width differs >5%; window sill from schedule; plan aligned to layout footprint (translation); report counts; `defaultsUsed` lists every default.
- [ ] Implement `assemble.js` (ids: walls `w1..`, openings `o1..`, rooms slug of name + index on collision; `source:'dxf'`; `meta.drawings` with file names; wall `role` = 'exterior' if either side faces the outer face, thickness ≥ 0.2 & outer → exterior, else interior/partition).

#### Task C7: Sample drawing set + round trip
- [ ] `tools/sample-drawings/sample-house.js`: the spec §8 house as a Building Model (exact dimensions in metres; 9″=0.2286, 4½″=0.1143; door/window tags D1,D2,D3,W1,W2,W3,V1 with schedule) + `schedule` + `site`.
- [ ] `dxf-writer.mjs` (R12 ASCII: HEADER with `$ACADVER AC1009`, `$INSUNITS 4`, TABLES/LAYER, ENTITIES; LINE, ARC, CIRCLE, TEXT, POLYLINE/VERTEX/SEQEND), in **mm**.
- [ ] `drawings.mjs`: from the model emit — floor plans per level (wall line pairs with gaps at openings, door leaf + swing arc, window triple lines, tags, room names, section marks with cut lines, dimension strings, title block text "GROUND FLOOR PLAN" etc.); sections A-A (longitudinal) and B-B (cross) drawn as cut walls/slabs with level marker texts; working drawings A-A/B-B (section linework + "WORKING DRAWING SECTION A-A" title + door/window schedule table text + elevation outline); site layout (C-PROP boundary, A-SITE-WALL pairs with gate gap + "GATE", L-PLNT lawn, A-SITE-PAVE driveway, A-SITE-BLDG footprint, "ROAD" text).
- [ ] `svg-sheet.mjs`: same geometry → A3 landscape SVG with title block (project "Sample House — 10 Marla, DHA Lahore", drawing title, scale 1:100, "For testing the Amco 3D visualiser"), line weights (walls heavy); `generate.mjs` writes DXF+SVG, prints PDFs via headless Chrome `--print-to-pdf` (`--no-pdf-header-footer`), writes `README.txt`, zips everything with `zip.mjs` (store + CRC32) to `website/samples/amco-sample-drawings.zip`, and copies files to `website/samples/drawings/`. Also writes `website/samples/drawings/manifest.json` `[{ file, slot, levelIndex?, section? }]` (used by "Load the sample project").
- [ ] **Round-trip test** `tests/importers/roundtrip.test.js`: generate in-memory → `parseDxf` → classify → extract → `assemble` → compare with `sample-house.js`: wall count equal (after noding both), every model wall matched by a reconstructed wall with endpoints within 0.02 m and thickness within 0.005 m; every opening matched by tag with `at` within 0.03 m and width/height exact from schedule; rooms by name; levels ffl/ceiling within 0.005; boundary within 0.02.
- [ ] Open one generated DXF in a viewer check: parse it back with the reader (done by test) and render the SVG/PDF; screenshot the PDF page to confirm it looks like a real architectural sheet.

#### Task C8: Browser entry
- [ ] `importers/index.js` `readDrawing(file)`: format by extension/magic (`.dwg` → `readable:false, error:'DWG files can\'t be read in the browser. In AutoCAD use File → Save As → DXF and upload that.'`); DXF text → `parseDxf` → `classifyDrawing` → `detectUnits` → matching extractor; `summary` strings (e.g. "Ground floor plan · 23 walls · 9 doors · 8 windows · 6 rooms · sections A-A, B-B"); thumbnails: DXF → small SVG→canvas render; PDF/image → `rasterise` scaled to 320px.
- [ ] `importers/raster.js` as specified; pdf.js loaded with `import('../../vendor/pdfjs/pdf.min.mjs')` and `GlobalWorkerOptions.workerSrc` set to the vendored worker URL.

### Track D2 — 2D review/trace editor

**Owns:** `website/assets/app/editor/**`, `website/assets/css/pages/editor.css`, `tools/dev/editor.html`, `tests/editor/*.test.js`.

**Consumes:** model API; DXF `Entity` shapes (Track C contract above); `formatLength`/`parseLength`.

**Produces:**
```js
// editor/plan-editor.js
export function createPlanEditor(container, {
  building,                       // Building (may be empty: levels only)
  backdrops,                      // { [levelId|'site']: { kind:'dxf', entities, factor, offset:[x,y] } | { kind:'bitmap', bitmap, metresPerPixel:number|null, offset:[x,y] } }
  schedule,                       // { [tag]: { type, width, height, sill } }
  mode,                           // 'review' (DXF) | 'trace' (PDF/image)
  onChange(building, schedule),   // debounced 300ms
  onPreview3D(building)
}) -> { setLevel(levelId|'site'), setTool(name), getBuilding(), getSchedule(), undo(), redo(), destroy() }
// editor/commands.js (pure): createHistory(limit=200) -> { exec(cmd), undo(), redo(), canUndo, canRedo }  cmd = { do(state)->state, undo(state)->state, label }
// editor/snap.js (pure): snapPoint(pt, { walls, ortho:boolean, from?:[x,y], tolerance }) -> { point, kind:'endpoint'|'wall'|'ortho'|'free' }
```

#### Task D2.1: View + navigation
- [ ] `view.js`: SVG with a world group (y flipped so north is up), pan (drag empty space / middle button / two-finger), wheel/pinch zoom around cursor, fit-to-content; layers: backdrop (DXF entities → `<path>` per layer in muted grey; bitmap → `<image>` scaled by `metresPerPixel` with opacity slider), site, rooms (light fill + name label + area), walls (footprint polygons from `wallFootprints`, dark fill), openings (door swing arc, window triple line), selection handles.

#### Task D2.2: Tools + history
- [ ] Tests first: `commands.test.js` (exec/undo/redo, redo cleared after new exec, limit), `snap.test.js` (endpoint within tolerance wins over ortho; ortho locks to 0/90/180/270 from `from`; free when `ortho:false`).
- [ ] Tools in `editor/tools/`: `select.js` (click wall/opening/room; drag wall endpoints with snapping, connected endpoints move together; Delete removes), `scale.js` (click 2 points, prompt panel field for length in ft-in or m via `parseLength`, sets `metresPerPixel` for the bitmap backdrop of the current level), `wall.js` (click-click polyline, Esc/double-click ends, thickness chips 9″ / 4½″ / custom, ortho default on, Shift = free), `opening.js` (hover shows preview on nearest wall within 0.3 m; type from selected schedule tag; click places with `at` snapped to 0.05 m; rejects if overlapping/overrunning with a toast), `room.js` (rooms auto from `findRoomFaces`; click a face → name field + use select from `ROOM_USES`; creates/updates `Room` with `at`), `site.js` (draw plot boundary polygon, mark gate on boundary with width).
- [ ] Every mutation goes through `history.exec`.

#### Task D2.3: Side panel
- [ ] Panel sections: tool palette; selected-item properties (wall thickness/role, opening tag/type/width/height/sill, room name/use); **Heights** per level (FFL, ceiling, slab, parapet on top level) with `formatLength` in the user's chosen system (ft-in default, toggle metres); **Door & window schedule** table (add/edit/remove rows; pre-filled defaults D1 3′×7′, D2 2′6″×7′, W1 4′×4′ sill 3′, W2 6′×4′ sill 3′, V1 2′×1′6″ sill 6′); counts summary; "Preview 3D" button → `onPreview3D(getBuilding())`.
- [ ] `tools/dev/editor.html`: loads `tests/fixtures/two-room-house.js` in review mode and an empty building with a bitmap backdrop (any PNG in `website/assets/img`) in trace mode. Screenshot + manual drive with Claude-in-Chrome or by reasoning through the code: draw 4 walls, place a door, name the room, undo/redo.

---

## Phase 2 — Track D1: "My property" page (after B1 + C land; D2 in place)

**Owns:** `website/assets/app/storage/**`, `website/my-property.html`, `website/assets/app/ui/{my-property-page,upload-slots,requirements-list,project-list}.js`, `website/assets/css/pages/my-property.css`, `tests/storage/*.test.js`.

**Produces:**
```js
// storage/project-schema.js (pure)
export function createProject({ name, kind, floors }) -> Project; export function validateProject(p) -> { ok, errors };
export function toExport(project) -> object /* { format:'amco.project/1', project (without file blobs) } */; export function fromExport(obj) -> Project
// storage/project-store.js
export function createStore() -> Promise<ProjectStore>   // tries IndexedDB, falls back to memory store with store.persistent === false
// ProjectStore: { persistent, list(), get(id), save(project), remove(id), putFile(projectId, fileId, blob, meta), getFile(projectId, fileId), removeFile(projectId, fileId) }
// storage/idb-store.js: export function createIdbStore() -> Promise<ProjectStore>; storage/memory-store.js: export function createMemoryStore() -> ProjectStore
```

### Task D1.1: Storage
- [ ] Tests: `project-schema.test.js` (create/validate/export/import round trip), `project-store.test.js` using `createMemoryStore` for the contract + **"falls back to memory store when backend throws"** (inject a failing IDB factory into `createStore({ idbFactory })`).
- [ ] Implement IDB store (db `amco`, stores `projects` keyPath id, `files` key `[projectId, fileId]`), quota errors mapped to `Error` with `code:'QUOTA'`.

### Task D1.2: Page, upload, requirements gate
- [ ] `my-property.html` (import map; classic `shades.js`, `data.js`, `site.js`; module `ui/my-property-page.js`) with step header (1 Your property · 2 Drawings · 3 Review · 4 Paint).
- [ ] Step 1: project list (resume/delete/export), new-project form (name, type House/Office/Shop, floors 1–4), **"Load the sample project"** (fetch `samples/drawings/manifest.json` + files → `File` objects → normal upload path) and "Download sample drawings (.zip)".
- [ ] Step 2: `upload-slots.js` four slots (Floor plans per floor, Section drawings, Working drawings, Layouts) + page-wide drop zone; each file → `readDrawing` → auto slot from `kind` (DXF) else a small inline form (slot, floor, section label); file cards with thumbnail, summary, warnings, replace/remove; **re-adding a file for the same slot+floor/section replaces the old one**. "Which sections are marked on your plan?" chips input shown when any plan is non-DXF. `requirements-list.js` renders `checkPackage` items (✓ / missing lines). "Build my 3D model" disabled until `complete`; files saved via `putFile`.
- [ ] Architects' drawing guide accordion (layers, units, title text conventions, DXF export steps) — copy from spec §7.3 in plain English.

### Task D1.3: Review + paint integration
- [ ] Step 3: DXF packages → `assemble` → editor in `review` mode with report banner (counts + warnings + defaults used); PDF/image packages → empty building with levels from heights panel defaults → editor in `trace` mode with bitmap backdrops from `rasterise`; section/working drawing thumbnails shown beside the Heights/Schedule panels (click to enlarge).
- [ ] Step 4: `mountStudio` with the building + saved paint; "Back to review" keeps paint for surfaces that still exist; "Send to Amco on WhatsApp" (summary via `amco.whatsappLink` listing rooms, shades, litres) ; "Export project (.amco.json)" / "Import project".
- [ ] Autosave after every change (debounced 500ms); banner when `store.persistent === false`.
- [ ] End-to-end check: serve, open `my-property.html`, Load the sample project → requirements all ✓ → Build → review shows counts matching sample (no warnings except defaults) → Paint → paint lounge wall → reload page → paint persists. Then remove Section B-B → gate closes with "Section B-B" message. Screenshots at each step (1440 and 390).

---

## Phase 3 — Integration and QA (orchestrator)

### Task 3.1: Assets + wiring
- [ ] Run `tools/render-stills.mjs` (stills for every property's exterior + 2 rooms) and `tools/render-tins.mjs`; wire stills into landing visualiser band, explore-by-space fallbacks and visualiser gallery.
- [ ] Grep for `walkthrough.html`, `house3d.js`, `three.min.js`, `home.js`, Archivo — no stale references.
- [ ] Update `README.md`: how to run (`npm install`, `npm run vendor`, `npm test`, `npm run samples`, serve), page list, architecture summary (Building Model contract, adding a property/importer/kit/storage), DXF conventions, placeholders list (old + new: photos, tins, trust numbers).

### Task 3.2: Independent QA review
- [ ] Dispatch a fresh reviewer agent with the spec, this plan and the file list: check every success criterion, global constraint, Review Focus item, dead code/TODOs, unused files, accessibility basics, broken links. Fix findings.

### Task 3.3: Verification
- [ ] `npm test` all green (report counts).
- [ ] Screenshots: every page at 1440/390; each property exterior/dollhouse/room; sample reconstruction in 3D; colour-fidelity ΔE report.
- [ ] Flow checks from spec §10.
- [ ] Update memory file `amco-client-facts.md` placeholder list if new placeholders were introduced.
