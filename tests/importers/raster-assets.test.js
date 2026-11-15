import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import { PDF_ASSET_OPTIONS } from '../../website/assets/app/importers/raster.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const vendored = join(root, 'website', 'assets', 'vendor', 'pdfjs');
const pdfjsDist = join(root, 'node_modules', 'pdfjs-dist');

/**
 * raster.js's asset options as folder paths, because pdf.js in Node reads files rather than file:
 * URLs; it wants them to end in a forward slash.
 */
const assetFolders = Object.fromEntries(Object.entries(PDF_ASSET_OPTIONS).map(([key, url]) => [key, fileURLToPath(url).replaceAll(sep, '/')]));

/** A 48 × 32 JPEG 2000 picture: a black frame with a red block in its top-left corner. */
const JP2 = Buffer.from('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', 'base64');

/**
 * A one-page PDF from its object bodies (object 1 the catalogue, 2 the page tree, 3 the page).
 * @param {(string | Buffer)[]} bodies
 * @returns {Uint8Array}
 */
function pdfOf(bodies) {
  const parts = [Buffer.from('%PDF-1.7\n')];
  let length = parts[0].length;
  const offsets = [];
  bodies.forEach((body, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.from(body), Buffer.from('\nendobj\n')]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = [`xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(parts));
}

/** A stream object body. */
const stream = (dict, data) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`), Buffer.from(data), Buffer.from('\nendstream')]);

/** A page showing the JPEG 2000 picture, as a scanned sheet would. */
const scannedPdf = () => pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 480 320] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
  stream('/Type /XObject /Subtype /Image /Width 48 /Height 32 /Filter /JPXDecode', JP2),
  stream('', 'q 480 0 0 320 0 0 cm /Im1 Do Q')
]);

/** A page of text in ZapfDingbats, a standard font the PDF doesn't embed. */
const unembeddedFontPdf = () => pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats >>',
  stream('', 'BT /F1 48 Tf 72 700 Td (GROUND FLOOR PLAN) Tj ET')
]);

/**
 * Opens a PDF with pdf.js (the legacy build of the same version, which runs in Node) and reads
 * its first page's drawing commands, collecting pdf.js's warnings.
 * @param {Uint8Array} data
 * @param {object} options getDocument options
 * @returns {Promise<{ images: object[], warnings: string[] }>}
 */
async function openFirstPage(data, options) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const warnings = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  for (const name of Object.keys(saved)) console[name] = (...args) => warnings.push(args.join(' '));
  const task = pdfjs.getDocument({ ...options, data, isEvalSupported: false });
  try {
    const page = await (await task.promise).getPage(1);
    const list = await page.getOperatorList();
    const ids = list.fnArray.flatMap((fn, k) => (fn === pdfjs.OPS.paintImageXObject ? [list.argsArray[k][0]] : []));
    const images = await Promise.all(ids.map((id) => new Promise((resolve) => page.objs.get(id, resolve))));
    return { images, warnings };
  } finally {
    await task.destroy();
    Object.assign(console, saved);
  }
}

/** Every file under a folder, as paths relative to it. */
const filesIn = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory()
  ? filesIn(join(dir, name)).map((f) => join(name, f))
  : [name]));

test('raster.js points pdf.js at the vendored standard fonts, image decoders and colour profile', () => {
  assert.deepEqual(Object.keys(PDF_ASSET_OPTIONS).sort(), ['iccUrl', 'standardFontDataUrl', 'wasmUrl']);
  for (const [key, url] of Object.entries(PDF_ASSET_OPTIONS)) {
    assert.ok(url.endsWith('/'), `${key} is a folder URL`);
    assert.ok(resolve(assetFolders[key]).startsWith(vendored + sep), `${key} is inside the vendored pdfjs folder`);
  }
  const source = readFileSync(join(vendored, 'pdf.min.mjs'), 'utf8');
  for (const key of Object.keys(PDF_ASSET_OPTIONS)) assert.ok(source.includes(key), `pdf.js reads the ${key} option`);
  for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
    assert.ok(readFileSync(join(vendored, name)).equals(readFileSync(join(pdfjsDist, 'build', name))), `${name} is the installed pdfjs-dist build`);
  }
});

test('tools/vendor.mjs copied every standard font and the JPEG 2000, JBIG2 and colour decoders, not QuickJS', () => {
  assert.deepEqual(filesIn(assetFolders.standardFontDataUrl).sort(), filesIn(join(pdfjsDist, 'standard_fonts')).sort());
  assert.deepEqual(filesIn(assetFolders.iccUrl).sort(), filesIn(join(pdfjsDist, 'iccs')).sort());
  const wasm = filesIn(assetFolders.wasmUrl).sort();
  const wanted = filesIn(join(pdfjsDist, 'wasm')).filter((name) => !/quickjs/i.test(name)).sort();
  assert.deepEqual(wasm, wanted);
  for (const name of ['openjpeg.wasm', 'openjpeg_nowasm_fallback.js', 'jbig2.wasm', 'jbig2_nowasm_fallback.js', 'qcms_bg.wasm']) {
    assert.ok(wasm.includes(name), name);
  }
  for (const name of wasm) {
    assert.ok(readFileSync(join(assetFolders.wasmUrl, name)).equals(readFileSync(join(pdfjsDist, 'wasm', name))), `${name} matches pdfjs-dist`);
  }
});

test('a scanned sheet (JPEG 2000 image) decodes with the vendored decoder, and not without it', async () => {
  // Without first: once pdf.js has loaded the decoder it keeps it for later documents.
  const without = await openFirstPage(scannedPdf(), {});
  assert.ok(without.images[0] === null || without.images[0] === undefined, 'without the decoder the picture is lost');
  assert.ok(without.warnings.some((w) => /wasmUrl|JpxError|decode image/i.test(w)), without.warnings.join(' | '));

  const { images, warnings } = await openFirstPage(scannedPdf(), assetFolders);
  assert.equal(images.length, 1);
  const [image] = images;
  assert.ok(image, `image decoded (${warnings.join(' | ')})`);
  assert.deepEqual([image.width, image.height], [48, 32]);
  const step = image.data.length / (image.width * image.height);
  const pixel = (x, y) => [...image.data.subarray((y * image.width + x) * step, (y * image.width + x) * step + 3)];
  const [r, g, b] = pixel(12, 10);
  assert.ok(r > 150 && g < 110 && b < 100, `red block, got ${[r, g, b]}`);
  assert.ok(pixel(2, 16).every((v) => v < 90), `black frame, got ${pixel(2, 16)}`);
  assert.ok(pixel(36, 24).every((v) => v > 200), 'white paper');
  assert.ok(!warnings.some((w) => /wasm|JpxError|decode image/i.test(w)), warnings.join(' | '));
});

test('a PDF that does not embed its standard font loads the vendored font without a warning', async () => {
  const { warnings } = await openFirstPage(unembeddedFontPdf(), assetFolders);
  assert.ok(!warnings.some((w) => /standardFontDataUrl|standard font|Unable to load font/i.test(w)), warnings.join(' | '));
  const without = await openFirstPage(unembeddedFontPdf(), {});
  assert.ok(without.warnings.some((w) => /standardFontDataUrl/.test(w)), without.warnings.join(' | '));
});
