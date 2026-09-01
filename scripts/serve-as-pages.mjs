/**
 * Serve dist/ with GitHub Pages semantics, for checking deep links before a deploy.
 *
 *   npm run build && npm run serve:pages
 *   → http://localhost:4330/hr1-dashboard/map
 *
 * `vite preview` cannot be used for this: it has its own SPA fallback, so every
 * deep route works there whether or not the deploy would actually serve it. That
 * is how /hr1-dashboard/map shipped broken. This replicates Pages exactly:
 *
 *   - serve the file if it exists
 *   - otherwise serve 404.html WITH a 404 status and WITHOUT changing the URL
 *   - serve nothing outside the /hr1-dashboard/ base
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../dist/', import.meta.url).pathname;
const BASE = '/hr1-dashboard';
const PORT = Number(process.env.PORT ?? 4330);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
};

const send = (res, code, body, type) => {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);

  if (!path.startsWith(BASE)) return send(res, 404, 'not found', 'text/plain');
  path = path.slice(BASE.length) || '/';
  if (path.endsWith('/')) path += 'index.html';

  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  try {
    if ((await stat(file)).isFile()) {
      return send(res, 200, await readFile(file), TYPES[extname(file)] ?? 'application/octet-stream');
    }
  } catch { /* fall through */ }

  // Pages' behaviour for an unmatched path.
  try {
    return send(res, 404, await readFile(join(ROOT, '404.html')), 'text/html');
  } catch {
    return send(res, 404, 'not found', 'text/plain');
  }
}).listen(PORT, () => {
  console.log(`Serving dist/ with GitHub Pages semantics:`);
  console.log(`  http://localhost:${PORT}${BASE}/`);
  console.log(`  http://localhost:${PORT}${BASE}/map`);
  console.log(`\nDeep links returning 404.html with a 404 status is CORRECT — Pages does`);
  console.log(`the same, and the app renders the route from it.`);
});
