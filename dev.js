// Локальный сервер без Vercel: npm run dev → http://localhost:3000
// Отдаёт статику и направляет POST /api/turn в тот же обработчик, что работает на Vercel.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/turn.js';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
// Наружу отдаём только файлы интерфейса и движка, не .env и не скрипты.
const PUBLIC = /^(index\.html|src\/.+|lib\/engine\.js)$/;

// Обработчик написан под Vercel и ждёт res.status().json() — добавляем эти два метода.
const withVercelHelpers = (res) => {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };
  return res;
};

const serveStatic = async (url, res) => {
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '') || 'index.html';
  if (!PUBLIC.test(path.replaceAll('\\', '/'))) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
};

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/turn') return handler(req, withVercelHelpers(res));
  return serveStatic(url, res);
}).listen(PORT, () => {
  const key = process.env.OPENROUTER_API_KEY ? 'ключ найден' : 'нет OPENROUTER_API_KEY в .env, ответы будут ошибкой';
  console.log(`Лес: http://localhost:${PORT}   (${key})`);
  console.log(`Лог хода: http://localhost:${PORT}/?debug`);
});
