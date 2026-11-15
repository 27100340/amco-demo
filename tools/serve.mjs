// Local static server for development and the screenshot/render tools.
// Serves the repo root so both /website/... and /tools/dev/... work.
// Usage: node tools/serve.mjs [port=8765]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2]) || 8765;
const HOST = '127.0.0.1';
const BACKLOG = 511;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.dxf': 'application/dxf'
};

/**
 * Map a request URL to a file inside ROOT, or null when it points outside it.
 * @param {string} url request URL (path and query)
 * @returns {string|null} absolute file path
 */
function resolvePath(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const file = resolve(join(ROOT, pathname));
  return file === ROOT || file.startsWith(ROOT + sep) ? file : null;
}

const server = createServer(async (req, res) => {
  try {
    const path = resolvePath(req.url);
    if (!path) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(path);
    const file = info.isDirectory() ? join(path, 'index.html') : path;
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(PORT, HOST, BACKLOG, () => {
  process.stdout.write(`Serving ${ROOT}\nOpen http://${HOST}:${PORT}/website/\n`);
});
