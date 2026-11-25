/**
 * ImagineAI — Production Backend Server & High-Fidelity AI Inference Gateway
 * Uses shared handlers from lib/httpHandlers.js for parity with Vercel serverless functions.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      } else {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            const key = match[1];
            let value = match[2] || '';
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            process.env[key] = value.trim();
          }
        });
      }
    } catch (e) {
      console.warn('Warning: Could not parse .env file:', e.message);
    }
  }
}

loadEnv();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const {
  applySecurityHeaders,
  handleHealthRequest,
  handleGenerateRequest,
  handleUpscaleRequest
} = require('./lib/httpHandlers');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/generate') {
    return handleGenerateRequest(req, res);
  }
  if (pathname === '/api/upscale') {
    return handleUpscaleRequest(req, res);
  }
  if (pathname === '/api/health') {
    return handleHealthRequest(req, res);
  }

  applySecurityHeaders(req, res);

  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res, pathname);
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' }));
});

function serveStatic(req, res, pathname) {
  let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, must-revalidate'
    };

    if (ext === '.html') {
      headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' blob:";
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

if (require.main === module) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = PORT + 1;
      console.warn(`Port ${PORT} is busy, retrying on http://localhost:${nextPort}...`);
      server.listen(nextPort, '127.0.0.1');
    } else {
      console.error('Server error:', err);
    }
  });

  server.on('listening', () => {
    const actualPort = server.address().port;
    console.log(`\n======================================================`);
    console.log(`  ImagineAI Studio Gateway Online`);
    console.log(`  Local URL:   http://localhost:${actualPort}`);
    console.log(`======================================================\n`);
  });

  server.listen(PORT, '127.0.0.1');
}

module.exports = { server };
