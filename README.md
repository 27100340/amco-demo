# Amco Paints: marketing plan and website MVP

Prepared 9 November 2026 for Amco Paint Industries (Pvt) Ltd, Lahore, makers of Cover Up paints.

## What is here

| Path | What it is |
|---|---|
| `marketing-plan/Amco-Paints-Marketing-Plan.pdf` | The 22-page plan: market, competitors, positioning, channel plans, SEO, GEO, day-by-day December calendar, week-by-week plan to May 2027, budget. |
| `marketing-plan/source/` | The plan's source (`plan.html`, `plan.css`, `plan-data.js`). Calendars, charts and the timeline live in `plan-data.js`. |
| `marketing-plan/build.py` | Rebuilds the PDF: `python build.py` (needs Chrome or Edge). |
| `website/` | The website MVP. Plain HTML, CSS and JavaScript, no build step. |

## Opening the website

Double-click `website/index.html`, or serve the folder:

```
cd website
python -m http.server 8765
```

then open http://127.0.0.1:8765. Everything, including fonts and the 3D library, is stored locally, so it runs offline.

## Website pages

- `index.html`: home, with the wall you can repaint and a live 3D preview
- `walkthrough.html`: the 3D house (drawing room, bedroom, kitchen, front elevation)
- `colours.html`: shade card and colour match from a photo
- `tools.html`: paint calculator with cost, paint for your city, wall doctor, Eid and shaadi countdown
- `products.html`: price list, comparison, good/better/best guide
- `dealers.html`: dealer finder, genuine-tin check, painter booking and Ustad Club

## Placeholders to replace before launch

All of these live in two files, `website/assets/js/data.js` and `website/assets/js/site.js`.

- **Prices and coverage figures** (`data.js`): indicative. Product names are Amco's real Cover Up range.
- **Two proposed products** (`data.js`): Cover Up Damp Stop and Cover Up Roof Cool do not exist; they are tagged "Proposed product".
- **Shade names, codes and colours** (`shades.js`): the Rang-e-Pakistan collection is a proposal to be matched to Amco's shade card.
- **Dealer rows and batch codes** (`data.js`): samples.
- **WhatsApp number** (`site.js`, `CONFIG.whatsapp`): a dummy number. Every "Send on WhatsApp" button uses it.
- **Urdu copy**: should be read by a native speaker before launch.
