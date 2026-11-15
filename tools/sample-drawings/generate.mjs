/**
 * Generates the sample drawing set: DXF files, A3 PDFs (printed by headless Chrome from the SVG
 * sheets), README.txt and manifest.json in website/samples/drawings/, and
 * website/samples/amco-sample-drawings.zip.
 *
 * Usage: node tools/sample-drawings/generate.mjs [--no-pdf] [--keep-html=<dir>]
 * CHROME_PATH overrides the Chrome location.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDrawingSet } from './drawings.mjs';
import { sheetToHtml } from './svg-sheet.mjs';
import { createZip } from './zip.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(ROOT, 'website', 'samples', 'drawings');
const ZIP = join(ROOT, 'website', 'samples', 'amco-sample-drawings.zip');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PRINT_TIMEOUT = 120000;
/** Fixed PDF creation date, so a rerun with the same Chrome gives byte-identical files. */
const PDF_DATE = 'D:20261110120000+00\'00\'';
const PDF_DATE_RE = /\/(CreationDate|ModDate) \(D:\d{14}[+\-Z][^)]*\)/g;

const README = `SAMPLE HOUSE - 10 MARLA, DHA LAHORE (FICTIONAL)
Sample drawing set for testing the Amco 3D visualiser
=====================================================

These seven drawings describe one double-storey house on a 35'-0" x 65'-0"
(10 marla) plot. Upload all seven DXF files on the "My property" page (or press
"Load the sample project") and the site builds the house in 3D, ready to paint.
The PDFs are the same sheets for reading and printing; they can also be used to
try the trace path (upload a PDF, set the scale, trace the walls).

Files
-----
01-ground-floor-plan.dxf / .pdf     Ground floor plan: walls, doors with swings,
                                    windows, D/W/V tags, room names, section
                                    marks A-A and B-B, dimensions, title block
02-first-floor-plan.dxf / .pdf      First floor plan, same conventions
03-section-A-A.dxf / .pdf           Longitudinal section: plinth, ground floor,
                                    ceilings, first floor, roof slab, parapet
04-section-B-B.dxf / .pdf           Cross section through the stair hall
05-working-drawing-A-A.dxf / .pdf   Section A-A dimensioned, front elevation,
                                    door and window schedule
06-working-drawing-B-B.dxf / .pdf   Section B-B dimensioned, side (east)
                                    elevation, schedule repeated
07-site-layout.dxf / .pdf           Plot boundary, boundary wall with gate,
                                    driveway, lawn, building footprint, road

The house
---------
Ground floor: car porch, drawing room, TV lounge with dining, kitchen, guest
bedroom with bath, powder room, stair hall.
First floor: master bedroom with bath, bedroom 2 with bath, family lounge,
front balcony, stair hall.
External and main walls 9" brick, partitions 4 1/2". Floor to floor 11'-0",
clear ceiling 10'-6", slabs 6", parapet 3'-6", plinth 1'-6".

Drawing conventions (what the importer reads)
---------------------------------------------
Units          DXF R12 (AC1009), drawing units millimetres ($INSUNITS = 4).
               Dimension text and levels are written in feet and inches.
Titles         "GROUND FLOOR PLAN", "FIRST FLOOR PLAN", "SECTION A-A",
               "WORKING DRAWING SECTION A-A", "SITE LAYOUT".
Walls          A-WALL: two parallel lines per wall, closed at door and window
               openings. A-WALL-PRHT: low walls (balcony parapet).
Doors          A-DOOR: leaf and swing arc in the wall gap. Tags (D1, D2, D3) on
               A-DOOR-IDEN.
Windows        A-GLAZ: frame and glazing lines in the wall gap. Tags (W1, W2, W3,
               V1) on A-GLAZ-IDEN.
Rooms          A-AREA-IDEN: room name and clear size inside each room.
Section marks  A-ANNO-SECT: cut lines with A and B bubbles.
Levels         A-ANNO-LEVL: "FIRST FLOOR F.F.L. +11'-0"", "CEILING +10'-6"",
               "ROOF T.O.S. +22'-0"", "PARAPET +25'-6"", "N.G.L. -1'-6"".
Schedule       A-ANNO-SCHD: TAG | TYPE | SIZE (W x H) | SILL | MATERIAL | QTY.
Site           C-PROP plot boundary, A-SITE-WALL boundary wall (two lines, gap at
               the gate), A-SITE-GATE gate, A-SITE-PAVE driveway, L-PLNT lawn,
               A-SITE-BLDG building footprint, C-ROAD road, "ROAD" text on the
               street side.
Other layers   Stairs (A-FLOR-STRS), furniture (A-FURN), fittings (A-FLOR-PFIX),
               dimensions (A-ANNO-DIMS) and notes are drawn for people to read
               and are ignored by the importer.

The address, plot numbers and layout are made up for testing. Not for
construction.
`;

/**
 * Prints one HTML sheet to PDF with headless Chrome.
 * @returns {boolean} true when the PDF was written
 */
function printPdf(htmlPath, pdfPath) {
  rmSync(pdfPath, { force: true });
  const result = spawnSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href
  ], { stdio: 'ignore', timeout: PRINT_TIMEOUT });
  if (result.status !== 0 || !existsSync(pdfPath)) return false;
  pinPdfDates(pdfPath);
  return true;
}

/**
 * Replaces the creation and modification dates Chrome writes into a PDF with PDF_DATE. Only
 * same-length replacements are made, so the cross-reference offsets stay valid.
 * @param {string} pdfPath
 */
function pinPdfDates(pdfPath) {
  const text = readFileSync(pdfPath).toString('latin1');
  const pinned = text.replace(PDF_DATE_RE, (match, key) => {
    const fixed = `/${key} (${PDF_DATE})`;
    return fixed.length === match.length ? fixed : match;
  });
  if (pinned !== text) writeFileSync(pdfPath, Buffer.from(pinned, 'latin1'));
}

/**
 * Writes the sample set.
 */
function main() {
  const args = process.argv.slice(2);
  const withPdf = !args.includes('--no-pdf') && existsSync(CHROME);
  const keep = args.find((a) => a.startsWith('--keep-html='))?.slice('--keep-html='.length);
  mkdirSync(OUT, { recursive: true });
  const htmlDir = keep ? resolve(keep) : mkdtempSync(join(tmpdir(), 'amco-sheets-'));
  mkdirSync(htmlDir, { recursive: true });
  const sheets = buildDrawingSet();
  const files = [];
  for (const sheet of sheets) {
    const dxfPath = join(OUT, sheet.file);
    writeFileSync(dxfPath, sheet.dxf);
    files.push(sheet.file);
    const base = sheet.file.replace(/\.dxf$/, '');
    const htmlPath = join(htmlDir, `${base}.html`);
    writeFileSync(htmlPath, sheetToHtml(sheet));
    if (withPdf) {
      const pdf = `${base}.pdf`;
      if (printPdf(htmlPath, join(OUT, pdf))) files.push(pdf);
      else process.stderr.write(`Could not print ${pdf}\n`);
    }
  }
  if (!withPdf) process.stderr.write('PDFs skipped (no Chrome or --no-pdf).\n');
  writeFileSync(join(OUT, 'README.txt'), README.replace(/\n/g, '\r\n'));
  files.push('README.txt');
  const manifest = sheets.map((s) => {
    const entry = { file: s.file, slot: s.slot };
    if (s.levelIndex !== undefined) entry.levelIndex = s.levelIndex;
    if (s.section !== undefined) entry.section = s.section;
    return entry;
  });
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const zip = createZip(files.map((name) => ({ name: `amco-sample-drawings/${name}`, data: new Uint8Array(readFileSync(join(OUT, name))) })));
  writeFileSync(ZIP, zip);
  if (!keep) rmSync(htmlDir, { recursive: true, force: true });
  for (const name of [...files, 'manifest.json']) {
    process.stdout.write(`${name.padEnd(32)} ${String(statSync(join(OUT, name)).size).padStart(9)} bytes\n`);
  }
  process.stdout.write(`${'amco-sample-drawings.zip'.padEnd(32)} ${String(zip.length).padStart(9)} bytes\n`);
}

main();
