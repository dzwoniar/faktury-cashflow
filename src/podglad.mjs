// Local preview of one generated report directory, never the repository root.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const START = process.argv[2] ?? 'output/demo-remonty/dashboard.html';
const inside = (base, file) => { const rel = path.relative(base, file); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
export function createPreviewServer(root = ROOT, start = START) {
  const entry = path.resolve(root, start);
  if (!inside(root, entry)) throw new Error('Preview must stay inside the project.');
  const directory = path.dirname(entry);
  return createServer(async (req, res) => {
    try {
      const address = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (address.split(/[\\/]/).some(part => part.startsWith('.'))) {
        res.writeHead(403).end(); return;
      }
      const filename = address === '/' ? entry : path.resolve(directory, '.' + address);
      if (!inside(directory, filename)) { res.writeHead(403).end(); return; }
      const resolved = await realpath(filename);
      const actualDirectory = await realpath(directory);
      if (!inside(actualDirectory, resolved)) { res.writeHead(403).end(); return; }
      const data = await readFile(resolved);
      const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8' };
      res.writeHead(200, { 'content-type': types[path.extname(resolved)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
      res.end(data);
    } catch { res.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[3] ?? 4321);
  createPreviewServer().listen(port, '127.0.0.1', () => console.log(`Podgląd: http://127.0.0.1:${port}`));
}
