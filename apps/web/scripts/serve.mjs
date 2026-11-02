/**
 * Local preview server for the built site (run `pnpm build` first).
 *   node apps/web/scripts/serve.mjs     # http://127.0.0.1:4320
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'dist');
const requestedPort = Number.parseInt(process.env.PORT ?? '', 10);
const PORT = Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : 4320;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = path.join(dir, pathname);
  if (!file.startsWith(dir)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const info = await stat(file);
    const target = info.isDirectory() ? path.join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p><a href="/">Only Inbox</a></p>');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`site on http://127.0.0.1:${PORT}/`);
});
