# Trusted Painters and Ustad Club Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `painters.html` page with a filterable directory of Amco-trusted painters (sample listings until Amco supplies its list), the Ustad Club rules (points, tiers, rewards, calculator), the referral bonus, and the booking and join WhatsApp forms moved over from `dealers.html`.

**Architecture:** Painter, tier, point and referral data live in one classic script, `website/assets/js/painters-data.js` (`window.AmcoPainters`, same pattern as `data.js`). Pure logic (tier maths, calculator, filtering, URL params, WhatsApp messages, HTML string builders) lives in ES modules under `website/assets/app/painters/` that take the data as an argument, so `node --test` can import them without a DOM. A page controller `website/assets/app/ui/painters-page.js` wires them to the DOM. The WhatsApp form code moves out of `dealers.js` into a shared classic script, `website/assets/js/whatsapp-forms.js`.

**Tech Stack:** Plain HTML, CSS and JavaScript, no build step. Classic scripts in `website/assets/js/`, ES modules in `website/assets/app/`. Tests: `node --test` (`npm test`), `node:assert/strict`, `node:vm` for classic scripts.

**Spec:** `docs/superpowers/specs/2026-11-19-trusted-painters-design.md`

## Global Constraints

- Another agent is committing 3D-engine work in this repo at the same time. Never touch `website/assets/app/engine/`, `tests/engine/` or `tools/load-timing.mjs`. Stage only the files your task lists, by path. Never `git add -A`, `git add .` or `git commit -a`.
- Every commit message ends with these two lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SgrnMkQS33Gks93wFiF4qp
  ```
- No server and no logins. Copy on the page says points are checked on WhatsApp. No payments.
- Every card's WhatsApp and Book buttons message Amco's number (`window.Amco.whatsappLink`, which uses `CONFIG.whatsapp`), naming the painter and their code. No painter phone numbers anywhere in data or markup.
- Sample painters carry `sample: true`; every rendered sample card carries `data-placeholder="sample painter"` and the visible text "Sample listing".
- Reward values (points per tin, tier thresholds, cash-back, referral bonus) live only in `painters-data.js`, are marked indicative on the page, and appear in README section 8.
- Painter codes: `USTAD-<CITY>-<NNN>`, city codes `LHR` Lahore, `KHI` Karachi, `ISB` Islamabad, `FSD` Faisalabad, `MUL` Multan. A painter's `id` equals their `code`.
- Specialities, fixed ids and labels: `interior` Interior, `exterior` Exterior, `texture` Texture, `wood-metal` Wood and metal, `waterproofing` Waterproofing.
- Tiers in order: Bronze, Silver, Gold, Platinum. Points count per calendar year; the tier is set on the previous year's points; a painter drops at most one tier per year. Points depend on tin size (quarter, gallon, drum).
- Directory order: higher tier first (the "higher place in the directory" reward), then more jobs, then name.
- Styling uses `tokens.css` variables and existing components (`.panel`, `.seg`, `.tag`, `.table`, `.field`, `.btn-wa`, `.list-check`, `.editorial-head`, `.section-head`). New CSS only in `website/assets/css/pages/painters.css`; new tokens only in `tokens.css`. Works at 360 px wide.
- Bilingual pattern: each section head carries a `<p class="urdu" lang="ur">` line, as on `dealers.html`.
- All interpolated text goes through `amco.escapeHtml` (or the `escape` argument of the render functions).

## Review Focus

1. `?painter=` and `?ref=` with junk, lowercase or markup (`?ref=<img onerror>`): lowercase codes are upper-cased; anything not matching the code pattern is ignored and never reaches the HTML. Tests in Task 3.
2. Calculator input empty, `0`, negative, decimal (`2.5`), text, or huge (`99999`): no `NaN`, no `Infinity`, a clear prompt instead of a result. Tests in Task 2.
3. A city and speciality combination with no painters: an empty state that names what was looked for and offers a WhatsApp ask to Amco. Tests in Task 3 and Task 5.
4. Points exactly on a tier threshold, and a Platinum painter whose year collapses to 0 points (drops to Gold, not Bronze). Tests in Task 2.
5. The header with a seventh nav item between 1181 px and 1280 px (where the full nav still shows) and the page at 360 px: no wrap, overflow or horizontal scroll. Screenshot check in Task 7.

---

### Task 1: Painter data file

**Files:**
- Create: `website/assets/js/painters-data.js`
- Create: `tests/painters/load-classic.js`
- Test: `tests/painters/painters-data.test.js`

**Interfaces:**
- Produces: `window.AmcoPainters = { indicative: true, cities, specialities, sizes, tiers, referral, painters }` where
  - `cities: { code: string, name: string }[]` (the five above)
  - `specialities: { id: string, label: string, urdu: string }[]` (Urdu: اندرونی، بیرونی، ٹیکسچر، لکڑی اور لوہا، واٹر پروفنگ)
  - `sizes: { id: 'quarter'|'gallon'|'drum', label: string, points: number }[]`, values quarter 1, gallon 4, drum 16
  - `tiers: { id, name, minPoints, cashBack: { quarter, gallon, drum }, rewards: string[] }[]`, lowest first:
    - bronze, Bronze, 0, cash-back 5 / 20 / 80, rewards: "Listed in the Amco painter directory", "One free colour training day a year"
    - silver, Silver, 600, 10 / 40 / 150, adds "An Amco tool kit each year" and "Listed above Bronze painters"
    - gold, Gold, 2000, 15 / 60 / 240, adds "An Amco ID card your customers can verify" and "Accident insurance while you work"
    - platinum, Platinum, 5000, 20 / 80 / 320, adds "Top place in the directory", "Advanced texture and waterproofing training" and "Higher insurance cover"
    - Each tier's `rewards` lists only what it adds; the page shows "Everything in <previous tier>, plus".
  - `referral: { bonusPoints: 250 }`
  - `painters: Painter[]`, `Painter = { id, code, name, city, areas: string[], years, specialities: string[], tier, jobs, verified, photo: null, sample: true }`. Eight entries with ids `USTAD-LHR-014`, `USTAD-LHR-022`, `USTAD-LHR-040`, `USTAD-KHI-007`, `USTAD-KHI-031`, `USTAD-ISB-003`, `USTAD-FSD-011`, `USTAD-MUL-005`; all four tiers used; every speciality used at least once; names are a given name and an initial (for example "Akram B.") so no real person is implied.
- Produces: `loadClassic(relativePath: string, globals?: object) => object` in `tests/painters/load-classic.js`: reads the file under `website/`, runs it with `node:vm` in a context `{ ...globals, window: globals.window || {} }`, returns that `window` object.

- [ ] **Step 1: Write the failing test** `tests/painters/painters-data.test.js`

```js
const { AmcoPainters: P } = loadClassic('assets/js/painters-data.js');
const CODE = /^USTAD-(LHR|KHI|ISB|FSD|MUL)-\d{3}$/;

test('tiers run Bronze to Platinum with rising thresholds', () => {
  assert.deepEqual(P.tiers.map((t) => t.id), ['bronze', 'silver', 'gold', 'platinum']);
  assert.equal(P.tiers[0].minPoints, 0);
  P.tiers.slice(1).forEach((t, i) => assert.ok(t.minPoints > P.tiers[i].minPoints));
  P.tiers.forEach((t) => assert.deepEqual(Object.keys(t.cashBack).sort(), ['drum', 'gallon', 'quarter']));
});
test('sizes give points by tin size', () => {
  assert.deepEqual(P.sizes.map((s) => [s.id, s.points]), [['quarter', 1], ['gallon', 4], ['drum', 16]]);
});
test('every painter is a well-formed sample listing with no phone number', () => {
  const tierIds = P.tiers.map((t) => t.id);
  const specIds = P.specialities.map((s) => s.id);
  const cityNames = P.cities.map((c) => c.name);
  assert.equal(P.painters.length, 8);
  assert.equal(new Set(P.painters.map((p) => p.id)).size, 8);
  for (const p of P.painters) {
    assert.match(p.code, CODE); assert.equal(p.id, p.code);
    assert.equal(P.cities.find((c) => c.name === p.city).code, p.code.split('-')[1]);
    assert.ok(cityNames.includes(p.city) && tierIds.includes(p.tier));
    assert.ok(p.specialities.length && p.specialities.every((s) => specIds.includes(s)));
    assert.ok(Number.isInteger(p.years) && Number.isInteger(p.jobs) && p.areas.length);
    assert.equal(p.sample, true); assert.equal(p.photo, null);
    assert.ok(!('phone' in p) && !('whatsapp' in p));
  }
  assert.deepEqual([...new Set(P.painters.map((p) => p.tier))].sort(), [...tierIds].sort());
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/painters/painters-data.test.js`
Expected: FAIL, ENOENT for `painters-data.js`.

- [ ] **Step 3: Implement `tests/painters/load-classic.js` and `website/assets/js/painters-data.js`**

`painters-data.js` follows `data.js`: an IIFE with `'use strict'`, a header comment saying the painters are sample listings and the reward values are indicative, both to be replaced before launch, and a final `window.AmcoPainters = { ... }`.

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/painters/painters-data.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add website/assets/js/painters-data.js tests/painters/load-classic.js tests/painters/painters-data.test.js
git commit -m "Add the painter directory and Ustad Club data"
```

---

### Task 2: Ustad Club logic (points, tiers, calculator)

**Files:**
- Create: `website/assets/app/painters/club.js`
- Test: `tests/painters/club.test.js`

**Interfaces:**
- Consumes: `AmcoPainters.tiers`, `AmcoPainters.sizes` (Task 1), loaded in tests with `loadClassic`.
- Produces (all named exports, JSDoc-typed, pure):
  - `MAX_TINS_PER_MONTH = 500`
  - `tierForPoints(points: number, tiers) => Tier`: highest tier whose `minPoints <= points`.
  - `nextYearTier(currentId: string, lastYearPoints: number, tiers) => Tier`: the earned tier, but never more than one rank below `currentId`.
  - `parseTins(text: string) => number | null`: a whole number 1 to `MAX_TINS_PER_MONTH` after trim, else `null`.
  - `calculate(tinsPerMonth: number, sizeId: string, data) => { pointsPerYear, tier, cashBackPerYear, next: { tier, pointsShort } | null } | null`: `null` for a non-integer, `< 1`, `> MAX_TINS_PER_MONTH` or unknown size. `pointsPerYear = tins * 12 * size.points`; `cashBackPerYear = tins * 12 * tier.cashBack[sizeId]`; `next` is the next tier up and the points still needed, `null` at Platinum.

- [ ] **Step 1: Write the failing test** `tests/painters/club.test.js`

```js
test('tierForPoints uses the threshold inclusively', () => {
  assert.equal(tierForPoints(0, P.tiers).id, 'bronze');
  assert.equal(tierForPoints(599, P.tiers).id, 'bronze');
  assert.equal(tierForPoints(600, P.tiers).id, 'silver');
  assert.equal(tierForPoints(5000, P.tiers).id, 'platinum');
});
test('nextYearTier drops at most one tier and can rise any amount', () => {
  assert.equal(nextYearTier('platinum', 0, P.tiers).id, 'gold');
  assert.equal(nextYearTier('gold', 100, P.tiers).id, 'silver');
  assert.equal(nextYearTier('bronze', 9000, P.tiers).id, 'platinum');
  assert.equal(nextYearTier('silver', 700, P.tiers).id, 'silver');
});
test('parseTins accepts whole numbers 1 to 500 only', () => {
  assert.equal(parseTins(' 12 '), 12);
  for (const bad of ['', '0', '-3', '2.5', 'ten', '501', '99999']) assert.equal(parseTins(bad), null, bad);
});
test('calculate: 12 drums a month is Gold with yearly cash-back', () => {
  const r = calculate(12, 'drum', P);
  assert.equal(r.pointsPerYear, 2304); assert.equal(r.tier.id, 'gold');
  assert.equal(r.cashBackPerYear, 12 * 12 * 240);
  assert.deepEqual([r.next.tier.id, r.next.pointsShort], ['platinum', 2696]);
});
test('calculate: Platinum has no next tier; bad input gives null', () => {
  assert.equal(calculate(30, 'drum', P).next, null);
  assert.equal(calculate(0, 'drum', P), null);
  assert.equal(calculate(Number.NaN, 'drum', P), null);
  assert.equal(calculate(5, 'barrel', P), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/painters/club.test.js`
Expected: FAIL, cannot find module `club.js`.

- [ ] **Step 3: Implement `website/assets/app/painters/club.js`** with the exports above. No DOM, no `window`.

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/painters/club.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add website/assets/app/painters/club.js tests/painters/club.test.js
git commit -m "Add Ustad Club tier and calculator logic"
```

---

### Task 3: Directory logic (filter, order, URL params, messages)

**Files:**
- Create: `website/assets/app/painters/directory.js`
- Test: `tests/painters/directory.test.js`

**Interfaces:**
- Consumes: `AmcoPainters` (Task 1).
- Produces (named exports, pure):
  - `ALL = 'all'`, `CODE_PATTERN = /^USTAD-[A-Z]{3}-\d{3}$/`
  - `normaliseCode(text: string) => string | null`: trim, upper-case, return it if it matches `CODE_PATTERN`, else `null`.
  - `orderPainters(painters, tiers) => Painter[]`: new array, tier rank descending, then `jobs` descending, then `name` ascending (`localeCompare`).
  - `filterPainters(painters, { city, speciality }) => Painter[]`: `ALL` matches everything; keeps input order.
  - `readParams(search: string, painters) => { painter: Painter | null, ref: string | null }`: from `URLSearchParams`; `painter` is the listed painter whose code equals `normaliseCode(?painter)`; `ref` is `normaliseCode(?ref)` (an unlisted but well-formed code is kept, because unlisted club members have codes too).
  - `painterLabel(p) => string`: `` `${p.name} (${p.code})` ``. The booking form's painter `<option>`s use it as value and text.
  - `enquiryMessage(p) => string`: `Assalam o alaikum, I found ${p.name} (${p.code}) on the Amco website. Please put me in touch about a painting job in ${p.city}.`
  - `noMatchMessage(cityName: string, specialityLabel: string) => string`: `Assalam o alaikum, I am looking for an Amco painter` + ` for ${specialityLabel.toLowerCase()} work` when not all + ` in ${cityName}` when not all + `.`
  - `initials(name: string) => string`: first letters of the first two words, upper-cased (`"Akram B."` gives `"AB"`).
  - `shareLink(code: string, origin: string) => string`: `` `${origin}/painters.html?ref=${code}` `` with no double slash when `origin` ends in `/`.

- [ ] **Step 1: Write the failing test** `tests/painters/directory.test.js`

```js
test('normaliseCode upper-cases good codes and rejects junk', () => {
  assert.equal(normaliseCode(' ustad-lhr-014 '), 'USTAD-LHR-014');
  for (const bad of ['', 'USTAD-LHR-14', '<img src=x onerror=alert(1)>', 'USTAD-LHR-014x']) assert.equal(normaliseCode(bad), null);
});
test('orderPainters puts higher tiers first, then more jobs', () => {
  const ordered = orderPainters(P.painters, P.tiers);
  const rank = (p) => P.tiers.findIndex((t) => t.id === p.tier);
  ordered.slice(1).forEach((p, i) => {
    const prev = ordered[i];
    assert.ok(rank(prev) > rank(p) || (rank(prev) === rank(p) && prev.jobs >= p.jobs));
  });
  assert.notEqual(ordered, P.painters);
});
test('filterPainters combines city and speciality, and can come back empty', () => {
  assert.equal(filterPainters(P.painters, { city: ALL, speciality: ALL }).length, 8);
  assert.ok(filterPainters(P.painters, { city: 'Lahore', speciality: ALL }).every((p) => p.city === 'Lahore'));
  assert.deepEqual(filterPainters(P.painters, { city: 'Nowhere', speciality: 'texture' }), []);
});
test('readParams finds the painter and keeps a well-formed ref', () => {
  const r = readParams('?painter=ustad-khi-007&ref=USTAD-MUL-999', P.painters);
  assert.equal(r.painter.id, 'USTAD-KHI-007'); assert.equal(r.ref, 'USTAD-MUL-999');
  assert.deepEqual(readParams('?painter=nope&ref=%3Cscript%3E', P.painters), { painter: null, ref: null });
  assert.deepEqual(readParams('', P.painters), { painter: null, ref: null });
});
test('messages name the painter and code; no-match names what was looked for', () => {
  const p = P.painters[0];
  assert.ok(enquiryMessage(p).includes(`${p.name} (${p.code})`) && enquiryMessage(p).includes(p.city));
  assert.equal(noMatchMessage('Multan', 'Texture'), 'Assalam o alaikum, I am looking for an Amco painter for texture work in Multan.');
  assert.equal(noMatchMessage(ALL, ALL), 'Assalam o alaikum, I am looking for an Amco painter.');
  assert.equal(initials('Akram B.'), 'AB');
  assert.equal(shareLink('USTAD-LHR-014', 'https://amco.pk/'), 'https://amco.pk/painters.html?ref=USTAD-LHR-014');
});
```

`noMatchMessage(ALL, ALL)` receives the `ALL` sentinel for both; the page passes `ALL` rather than a label when a filter is off.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/painters/directory.test.js`
Expected: FAIL, cannot find module `directory.js`.

- [ ] **Step 3: Implement `website/assets/app/painters/directory.js`** with the exports above.

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/painters/directory.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add website/assets/app/painters/directory.js tests/painters/directory.test.js
git commit -m "Add painter directory filtering, ordering and link logic"
```

---

### Task 4: Shared WhatsApp form script

Move the "Painter forms" block (`padTwo` to `initWhatsAppForm`, `dealers.js:196-299` plus its constants) out of `dealers.js` into a shared script, so `painters.html` can use it and `dealers.js` keeps only the finder and the tin check.

**Files:**
- Create: `website/assets/js/whatsapp-forms.js`
- Modify: `website/assets/js/dealers.js` (delete the painter-forms block, the constants only it used, and the last line that initialises `[data-whatsapp-form]`; update the header comment)
- Modify: `website/dealers.html` (add `<script src="assets/js/whatsapp-forms.js"></script>` after `dealers.js` so its two forms keep working until Task 7 removes them)
- Test: `tests/painters/whatsapp-forms.test.js`

**Interfaces:**
- Consumes: `window.Amco.whatsappLink` (site.js).
- Produces: `window.AmcoForms = { init(formEl: HTMLFormElement): void, ruleProblem(value: string, rule: string | null, today: string): string, readableDate(iso: string): string }`. `ruleProblem` is today's `fieldProblem` minus the DOM and the required check: it returns the `RULE_MESSAGES` text or `''` for a non-empty value; the DOM wrapper still handles required/empty. The script initialises every `[data-whatsapp-form]` on the page when it runs (loaded at the end of `<body>`, after `site.js`). Field markup contract is unchanged: `data-label`, `data-rule` (`phone`, `years`, `date`), `data-required-message`, `data-empty-text`, `#<id>-error`, `[data-form-status]`, `data-intro` on the form.

- [ ] **Step 1: Write the failing test** `tests/painters/whatsapp-forms.test.js`

```js
const win = loadClassic('assets/js/whatsapp-forms.js', {
  document: { querySelectorAll: () => [] }
});
const { ruleProblem, readableDate } = win.AmcoForms;
test('phone rule wants 10 to 13 digits', () => {
  assert.equal(ruleProblem('0300 1234567', 'phone', '2026-11-19'), '');
  assert.match(ruleProblem('12345', 'phone', '2026-11-19'), /phone number/);
  assert.match(ruleProblem('0300-abc', 'phone', '2026-11-19'), /phone number/);
});
test('years rule wants a whole number up to 70', () => {
  assert.equal(ruleProblem('8', 'years', '2026-11-19'), '');
  assert.match(ruleProblem('71', 'years', '2026-11-19'), /years/);
  assert.match(ruleProblem('2.5', 'years', '2026-11-19'), /years/);
});
test('date rule refuses the past; readableDate spells the month', () => {
  assert.equal(ruleProblem('2026-11-19', 'date', '2026-11-19'), '');
  assert.match(ruleProblem('2026-11-18', 'date', '2026-11-19'), /today or a later date/);
  assert.equal(readableDate('2026-11-15'), '15 November 2026');
});
```

If the script reads `window.Amco` at load time, also pass `window: { Amco: { whatsappLink: () => '' } }`.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/painters/whatsapp-forms.test.js`
Expected: FAIL, ENOENT for `whatsapp-forms.js`.

- [ ] **Step 3: Create `whatsapp-forms.js` by moving the code, then trim `dealers.js`**

Behaviour of the forms must not change. `fieldProblem(field)` becomes: empty value → required message or `''`; else `ruleProblem(value, rule, todayIso())`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, including the 3 new tests; no other test changes.

- [ ] **Step 5: Commit**

```bash
git add website/assets/js/whatsapp-forms.js website/assets/js/dealers.js website/dealers.html tests/painters/whatsapp-forms.test.js
git commit -m "Move the WhatsApp form code into a shared script"
```

Also check by hand: on `dealers.html` the booking form still flags an empty city and opens WhatsApp when complete.

---

### Task 5: `painters.html` with the directory and booking form

**Files:**
- Create: `website/painters.html`
- Create: `website/assets/css/pages/painters.css`
- Create: `website/assets/app/painters/render.js`
- Create: `website/assets/app/ui/painters-page.js`
- Modify: `website/assets/app/legacy.js` (add `export const painters = window.AmcoPainters;`)
- Modify: `website/assets/css/tokens.css` (add `--tier-bronze`, `--tier-silver`, `--tier-gold`, `--tier-platinum` under "Supporting values"; muted metal tones that pass 4.5:1 against `--color-paper` as text, or are used only as a badge edge with ink text)
- Test: `tests/painters/render.test.js`, `tests/painters/page.test.js`

**Interfaces:**
- Consumes: Task 1 data, Task 3 `orderPainters`, `filterPainters`, `readParams`, `painterLabel`, `enquiryMessage`, `noMatchMessage`, `initials`, `ALL`; Task 4 `window.AmcoForms` (already initialised on the booking form by the time the module runs); `amco.whatsappLink`, `amco.escapeHtml` via `legacy.js`.
- Produces in `render.js` (pure, each takes `escape: (s) => string` and returns an HTML string):
  - `cardHtml(painter, data, { escape, whatsappHref }) => string`: `<article class="painter-card" data-tier="<tier>" data-placeholder="sample painter">` (the attribute only when `sample`), avatar with `initials()` (or `<img>` when `photo`), name, "City: areas", "N years painting", speciality `.tag`s, tier badge `<span class="tier-badge" data-tier>`, "N jobs with Amco", "Verified by Amco" when `verified`, "Sample listing" `.tag` when `sample`, a WhatsApp `<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href=whatsappHref>` and `<button class="btn btn-sm" type="button" data-book="<id>">Book</button>`.
  - `emptyHtml(message, { escape, whatsappHref }) => string`: a `.panel` saying no listed painter matches and offering "Ask Amco on WhatsApp".
  - Task 6 adds more exports to this file.
- Produces in `painters-page.js`: `initPaintersPage()`, called at the bottom of the module. It renders the city filter (`#painter-city`, `.seg.seg-wrap`, "All cities" plus cities that have painters) and speciality filter (`#painter-speciality`, "All work" plus all five), the count line (`#painter-count`, `role="status"`), the grid (`#painter-list`), fills the booking form's `#book-painter` `<select>` (first option value `''`, text "Any painter Amco suggests"; then one option per painter, value and text `painterLabel(p)`), applies `readParams(location.search)` (pre-select the painter; put `ref` in `#book-ref`), and on `[data-book]` click selects that painter, scrolls `#book` into view (`behavior: 'smooth'` unless `prefers-reduced-motion: reduce`) and focuses `#book-painter`.

**Page structure (`painters.html`)**, copying `dealers.html`'s head, header, footer and skip link; `<body data-page="painters">`; title `Trusted painters and the Ustad Club | Amco Paints`; a meta description:
1. `.editorial-head` hero: eyebrow "Painters", `h1` "Trusted painters", Urdu "قابلِ اعتماد پینٹر", a lede, buttons "Find a painter" (`#directory`), "Book a painter" (`#book`), link "Painters: join the Ustad Club" (`#club`); the existing `painter-*.webp` photo.
2. `#directory`: section head "Painters Amco trusts" / Urdu "امکو کے بھروسے کے پینٹر"; a `.note` "Sample listings for this prototype. Amco's own painter list replaces them before launch." with `data-placeholder="sample painters"`; the two filters, count, grid; a `<noscript>` note as on dealers.
3. `#book`: "Book a painter", the existing booking form moved from `dealers.html` unchanged except: intro `Assalam o alaikum, I would like to book a painter through Amco.`; a new first field `#book-painter` (`<select class="select">`, `data-label="Painter"`, `data-empty-text="Any painter Amco suggests"`, optional); a new last optional field `#book-ref` ("Painter who sent you (optional)", hint "Their Ustad code, for example USTAD-LHR-014.", `data-label="Sent by"`, `data-empty-text="Nobody"`, `maxlength="20"`, `autocapitalize="characters"`). Copy: "Every request comes to Amco on WhatsApp. We pass it to the painter you chose, or suggest one near you. You agree the rate with the painter yourself."
4. Task 6 sections go between `#book` and the footer.
Scripts, in order: `shades.js`, `painters-data.js`, `site.js`, `whatsapp-forms.js`, then `<script type="module" src="assets/app/ui/painters-page.js">`.

**CSS (`painters.css`)**: `main section[id] { scroll-margin-top: var(--header-h); }`; `.painter-list` grid `repeat(auto-fill, minmax(min(100%, 18rem), 1fr))`; card, avatar (initials on `--color-canvas-deep`), `.tier-badge[data-tier=...]` using the tier tokens; reuse `.form-fields`/`.field-error` rules by copying only what `dealers.css` defines for forms into `painters.css` (Task 7 deletes them from `dealers.css` once no forms remain there).

- [ ] **Step 1: Write the failing tests**

`tests/painters/render.test.js`:

```js
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const opts = { escape: esc, whatsappHref: 'https://wa.me/x?text=y' };
test('a sample card is marked, carries its tier and both actions', () => {
  const p = P.painters[0];
  const html = cardHtml(p, P, opts);
  assert.match(html, /data-placeholder="sample painter"/);
  assert.match(html, /Sample listing/);
  assert.match(html, new RegExp(`data-tier="${p.tier}"`));
  assert.match(html, new RegExp(`data-book="${p.id}"`));
  assert.match(html, /href="https:\/\/wa\.me\/x\?text=y"/);
  assert.ok(!/tel:/.test(html));
});
test('card text is escaped', () => {
  const html = cardHtml({ ...P.painters[0], name: '<b>X</b>', areas: ['<i>'] }, P, opts);
  assert.ok(!html.includes('<b>X</b>') && !html.includes('<i>'));
});
test('emptyHtml offers the WhatsApp ask', () => {
  assert.match(emptyHtml('msg', opts), /Ask Amco on WhatsApp/);
});
```

`tests/painters/page.test.js` reads `website/painters.html` as text:

```js
test('painters.html loads its scripts in order and has the anchors', () => {
  const order = ['assets/js/shades.js', 'assets/js/painters-data.js', 'assets/js/site.js', 'assets/js/whatsapp-forms.js', 'assets/app/ui/painters-page.js'];
  const at = order.map((src) => html.indexOf(`src="${src}"`));
  assert.ok(at.every((i) => i > 0)); assert.deepEqual([...at].sort((a, b) => a - b), at);
  for (const id of ['directory', 'book', 'painter-list', 'painter-city', 'painter-speciality', 'book-painter', 'book-ref']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /data-page="painters"/);
  assert.match(html, /data-placeholder="sample painters"/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/painters/render.test.js tests/painters/page.test.js`
Expected: FAIL, missing `render.js` and `painters.html`.

- [ ] **Step 3: Implement `render.js`, `legacy.js` export, tokens, `painters.css`, `painters.html`, `painters-page.js`**

Card WhatsApp href is `amco.whatsappLink(enquiryMessage(p))`. Empty state href is `amco.whatsappLink(noMatchMessage(cityOrAll, specialityLabelOrAll))`. Count line: "8 painters listed", "3 painters in Lahore", "1 painter for texture work in Karachi", "No painters found".

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Check it in the browser**

Run `npm run serve`, open `http://127.0.0.1:8765/website/painters.html?painter=ustad-khi-007&ref=USTAD-LHR-014`. Expected: the Karachi painter is selected in the booking form and `#book-ref` shows `USTAD-LHR-014`; filters change the grid and count; Multan plus Texture (or any empty pair) shows the empty state; "Book" on a card scrolls to the form with that painter selected; submitting opens WhatsApp with lines `Painter: <name> (<code>)` and `Sent by: USTAD-LHR-014`; the browser console has no errors.

- [ ] **Step 6: Commit**

```bash
git add website/painters.html website/assets/css/pages/painters.css website/assets/css/tokens.css website/assets/app/painters/render.js website/assets/app/ui/painters-page.js website/assets/app/legacy.js tests/painters/render.test.js tests/painters/page.test.js
git commit -m "Add the trusted painters page with directory and booking"
```

---

### Task 6: Ustad Club, calculator, referral, join form and FAQ

**Files:**
- Modify: `website/painters.html` (sections after `#book`)
- Modify: `website/assets/app/painters/render.js`
- Modify: `website/assets/app/ui/painters-page.js`
- Modify: `website/assets/css/pages/painters.css`
- Test: `tests/painters/render.test.js`, `tests/painters/page.test.js`

**Interfaces:**
- Consumes: Task 2 `calculate`, `parseTins`, `MAX_TINS_PER_MONTH`; Task 3 `shareLink`; Task 1 data; `amco.formatPkr`.
- Produces in `render.js`:
  - `tiersTableHtml(data, { escape, formatPkr }) => string`: a `.table-scroll` > `.table` with one column per tier; rows "Points a year to reach it" (`minPoints`, "From the first tin" for 0), "Cash-back per quarter / gallon / drum" (`formatPkr`), "Rewards" (`<ul>` of that tier's `rewards`, prefixed by "Everything in <previous>, plus" from Silver up).
  - `earnTableHtml(data, { escape }) => string`: tin size and points per tin.
  - `calcResultHtml(result, sizeLabel, { escape, formatPkr }) => string`: "About N points a year puts you in <Tier> from next January.", "Cash-back at <Tier>: about Rs X a year.", the tier's rewards, and "N more points a year reaches <Next>." when `next`. When `result` is `null`: "Enter how many tins you use in a month, a whole number from 1 to 500."
- Produces in `painters-page.js`: calculator wiring on `#calc-form` (`#calc-tins` text input `inputmode="numeric"`, `#calc-size` select from `data.sizes`, default `gallon`; result into `#calc-result`, `role="status"`), recalculated on `input` and `change`; tables rendered into `#club-tiers` and `#club-earn`; referral example link in `#ref-example` is `shareLink('USTAD-LHR-014', location.origin + <path to website/>)`.

**Sections:**
1. `#club`: "The Amco Ustad Club" / Urdu "امکو استاد کلب". Copy: points on every Amco tin, recorded from the batch code on the tin or the dealer bill; points count per calendar year and set next year's tier; a tier drops one step at most in a year; "Reward values are indicative and will be confirmed by Amco." as a `.note` with `data-placeholder="reward values"`. Then "How you earn points" (`#club-earn`) and "Tiers and rewards" (`#club-tiers`).
2. `#calculator`: "What would you earn?" / Urdu "آپ کیا کمائیں گے؟". Labels "Tins I use in a month", "Usual tin size".
3. `#referral`: "Bring a customer, earn bonus points" / Urdu "گاہک لائیں، بونس پوائنٹس پائیں". Copy: share your link (example in `#ref-example`) or give the customer your Ustad code; when they book through this page and buy Amco for the job, you get the referral bonus (`data.referral.bonusPoints`, rendered by the module into `[data-referral-bonus]`), credited once the job's tins are bought; booking requests from the directory go to the painter named in them.
4. `#join`: "Join the Ustad Club", the join form moved from `dealers.html` unchanged (same four fields, ids `club-*`, same intro).
5. `#faq`: `<details>` items: "How do I check my points?" (on WhatsApp, with a `whatsappLink` built by the module into `[data-points-link]`, message "Assalam o alaikum, I would like to check my Ustad Club points. My code: "), "When does my tier change?", "Does Amco take a cut of my rate?" (no; you agree the rate with the customer), "Why are these painters marked Sample listing?".

- [ ] **Step 1: Add the failing tests**

Append to `render.test.js`:

```js
test('tiers table shows each tier, cash-back in rupees and inherited rewards', () => {
  const html = tiersTableHtml(P, { escape: esc, formatPkr: (n) => `Rs ${n}` });
  for (const t of P.tiers) assert.ok(html.includes(t.name));
  assert.match(html, /Rs 240/);
  assert.match(html, /Everything in Silver, plus/);
});
test('calculator result names tier, next tier, or asks for a number', () => {
  const fmt = { escape: esc, formatPkr: (n) => `Rs ${n}` };
  const html = calcResultHtml(calculate(12, 'drum', P), 'Drum', fmt);
  assert.match(html, /2,?304 points/); assert.match(html, /Gold/); assert.match(html, /Platinum/);
  assert.match(calcResultHtml(null, 'Drum', fmt), /whole number from 1 to 500/);
  assert.ok(!/NaN|Infinity|undefined/.test(html));
});
```

Append to `page.test.js`: ids `club`, `club-tiers`, `club-earn`, `calculator`, `calc-form`, `calc-tins`, `calc-size`, `calc-result`, `referral`, `join`, `faq` exist; exactly two `data-whatsapp-form` forms; `data-placeholder="reward values"` present; `club-years` field keeps `data-rule="years"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/painters/render.test.js tests/painters/page.test.js`
Expected: FAIL on the new tests only.

- [ ] **Step 3: Implement the sections, render functions, wiring and CSS** (`details` styling, calculator layout two columns over 640 px and one below).

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Check it in the browser**

On `painters.html`: typing 12 with Drum shows Gold, about Rs 34,560 a year, and 2,696 points to Platinum; clearing the field, typing `2.5` or `600` shows the prompt; the join form validates and opens WhatsApp as it did on `dealers.html`; the tiers table scrolls sideways inside its box at 360 px rather than the page.

- [ ] **Step 6: Commit**

```bash
git add website/painters.html website/assets/app/painters/render.js website/assets/app/ui/painters-page.js website/assets/css/pages/painters.css tests/painters/render.test.js tests/painters/page.test.js
git commit -m "Add the Ustad Club tiers, calculator, referral and join form"
```

---

### Task 7: Site wiring, dealers teaser and README

**Files:**
- Modify: `website/assets/js/site.js` (`NAV`, utility bar, footer)
- Modify: `website/dealers.html` (painters section, hero, meta, scripts)
- Modify: `website/assets/css/pages/dealers.css` (drop form rules no longer used)
- Modify: `website/index.html` (trust band and reach section)
- Modify: `README.md` (sections 3 and 8)
- Test: `tests/painters/site-links.test.js`

**Interfaces:**
- Consumes: `painters.html` anchors `#directory`, `#book`, `#club`, `#join` (Tasks 5 and 6).
- Produces: none for later tasks.

**Changes:**
- `site.js`: add `{ id: 'painters', href: 'painters.html', label: 'Painters' }` after `dealers` in `NAV`; utility link "Painter services" → `painters.html`; footer "Reach us": replace `['dealers.html#painters', 'Ustad Club for painters']` with `['painters.html', 'Trusted painters']` and `['painters.html#club', 'Ustad Club for painters']`.
- `dealers.html`: the `#painters` section keeps its id and head, and becomes a teaser: one `.panel` with "Book a painter Amco trusts" and a link to `painters.html#directory`, and one with "The Amco Ustad Club" and the rewritten list: "Points on every Amco tin, recorded from the batch code or your dealer bill", "Bronze, Silver, Gold and Platinum tiers with cash-back, tool kits and training", "Bonus points for every customer you bring", "Gold members get an Amco ID card customers can verify", then a link to `painters.html#club`. Both forms removed; `whatsapp-forms.js` script tag removed. Hero link "Book a painter or join the club" → `painters.html`; lede and meta description reworded to point to the painters page.
- `dealers.css`: remove `.form-fields`, `.field-error`, the `aria-invalid` rule and `.club-title` rules, and update the file comment.
- `index.html`: the "Painters in the Ustad Club" trust item wraps its label in `<a href="painters.html">` (keeps `data-placeholder="Ustad Club size"`); reach section "Book a painter" → `painters.html#directory`, "Painters and contractors: join the Ustad Club" → `painters.html#club`.
- README section 3: add a `painters.html` row ("Trusted painters directory, booking, Ustad Club tiers, calculator, referral and join form") and change the `dealers.html` row to "Dealer finder, genuine-tin check, links to the painters page". Section 8: add rows "Painter listings (8 samples)" in `website/assets/js/painters-data.js`, `painters` ("Samples, marked Sample listing. Replace with Amco's painter list; keep codes in the USTAD-<CITY>-<NNN> form.") and "Ustad Club points, tier thresholds, cash-back and referral bonus" in the same file, `sizes`, `tiers`, `referral` ("Indicative. Not agreed by Amco."). Section 4 module map: add a `painters/` row ("Painter directory and Ustad Club logic and HTML builders. Pure, no DOM.").

- [ ] **Step 1: Write the failing test** `tests/painters/site-links.test.js`

```js
test('the header nav lists the painters page', () => {
  assert.match(site, /\{ id: 'painters', href: 'painters\.html', label: 'Painters' \}/);
});
test('no page or the shared chrome still sends painters to dealers.html#painters', () => {
  for (const [name, text] of [['site.js', site], ['index.html', index]]) assert.ok(!text.includes('dealers.html#painters'), name);
});
test('dealers.html is a teaser that links to the painters page', () => {
  assert.ok(!dealers.includes('data-whatsapp-form'));
  assert.ok(!dealers.includes('Points on every drum you scan'));
  assert.match(dealers, /href="painters\.html#club"/);
});
test('the home trust band links to the painters page', () => {
  assert.match(index, /data-placeholder="Ustad Club size"[^]*?href="painters\.html"/);
});
test('README lists the painter placeholders', () => {
  assert.match(readme, /painters-data\.js/);
  assert.match(readme, /\| `painters\.html` \|/);
});
```

Each file is read with `readFileSync` relative to the repo root.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/painters/site-links.test.js`
Expected: FAIL on all five.

- [ ] **Step 3: Make the changes listed above**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, whole suite.

- [ ] **Step 5: Screenshot the layouts (Review Focus 5)**

With `npm run serve` running:

```
node tools/screenshot.mjs http://127.0.0.1:8765/website/painters.html shots/p-1200.png 1200 900
node tools/screenshot.mjs http://127.0.0.1:8765/website/painters.html shots/p-1280.png 1280 900
node tools/screenshot.mjs http://127.0.0.1:8765/website/painters.html shots/p-360.png 360 800 --full --eval="document.documentElement.scrollWidth"
node tools/screenshot.mjs http://127.0.0.1:8765/website/dealers.html shots/d-360.png 360 800 --full
```

Write `shots/` to the scratchpad, not the repo. Expected: at 1200 and 1280 the seven nav links sit on one line with "My project" beside them; at 360 the evaluated `scrollWidth` is 360, cards stack in one column and nothing overflows. If the nav wraps at 1181 to 1280 px, tighten `.site-nav` gap in `components.css` for that range (and stage that file), or raise the collapse breakpoint from 1180 px; say which in the commit message.

- [ ] **Step 6: Commit**

```bash
git add website/assets/js/site.js website/dealers.html website/assets/css/pages/dealers.css website/index.html README.md tests/painters/site-links.test.js
git commit -m "Link the painters page from the header, home and dealers pages"
```
