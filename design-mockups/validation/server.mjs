import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const validationDir = path.dirname(fileURLToPath(import.meta.url));
const documentRoot = path.resolve(validationDir, '..');
const DEFAULT_PORT = 41739;
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export async function findAvailablePort(startPort = DEFAULT_PORT, host = '127.0.0.1') {
  for (let port = startPort; port < startPort + 100; port += 1) {
    const available = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.unref();
      probe.once('error', () => resolve(false));
      probe.listen(port, host, () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error(`No available validation port in ${startPort}-${startPort + 99}`);
}

function parsePort(args) {
  const index = args.indexOf('--port');
  if (index === -1) return null;
  const parsed = Number(args[index + 1]);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid --port value: ${args[index + 1]}`);
  }
  return parsed;
}

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const resolved = path.resolve(documentRoot, relative);
  const insideRoot = resolved === documentRoot || resolved.startsWith(`${documentRoot}${path.sep}`);
  return insideRoot ? resolved : null;
}

export function createValidationServer() {
  return createServer(async (request, response) => {
    try {
      const filePath = resolveRequestPath(request.url ?? '/');
      if (!filePath) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      });
      if (request.method === 'HEAD') {
        response.end();
      } else {
        createReadStream(filePath).pipe(response);
      }
    } catch (error) {
      const statusCode = error.code === 'ENOENT' ? 404 : 500;
      response.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(statusCode === 404 ? 'Not found' : 'Internal server error');
    }
  });
}

async function main() {
  const requestedPort = parsePort(process.argv.slice(2));
  const port = requestedPort ?? await findAvailablePort();
  const server = createValidationServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`AkaMoney validation server listening at http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
