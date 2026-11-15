import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, createZip } from '../../tools/sample-drawings/zip.mjs';

/** Reads a stored (uncompressed) zip back through its central directory. */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50, 'end of central directory');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = [];
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(p, true), 0x02014b50, 'central directory entry');
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    assert.equal(view.getUint32(offset, true), 0x04034b50, 'local header');
    const localName = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localName + localExtra;
    files.push({ name, method, crc, data: bytes.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('createZip stores files that read back byte for byte', () => {
  const dxf = '0\r\nSECTION\r\n0\r\nEOF\r\n';
  const binary = new Uint8Array([0, 255, 37, 80, 68, 70]);
  const zip = createZip([{ name: 'drawings/01.dxf', data: dxf }, { name: 'README.txt', data: 'Sample – set' }, { name: 'a.pdf', data: binary }]);
  const files = readZip(zip);
  assert.deepEqual(files.map((f) => f.name), ['drawings/01.dxf', 'README.txt', 'a.pdf']);
  assert.equal(new TextDecoder().decode(files[0].data), dxf);
  assert.equal(new TextDecoder().decode(files[1].data), 'Sample – set');
  assert.deepEqual([...files[2].data], [...binary]);
  for (const f of files) {
    assert.equal(f.method, 0, 'stored');
    assert.equal(f.crc, crc32(f.data));
  }
});
