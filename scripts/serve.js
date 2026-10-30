// Servidor local para visualizar o painel: node scripts/serve.js  → http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tipos = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.jsonl': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.js': 'text/javascript' };
const porta = Number(process.env.PORT || 8080);
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(root, p === '/' ? 'index.html' : p);
  if (!f.startsWith(root) || f.includes(`${path.sep}data${path.sep}manual`)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream' });
    res.end(b);
  });
}).listen(porta, () => console.log(`Painel em http://localhost:${porta}`));
