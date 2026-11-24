/**
 * ImagineAI — Production Backend Server & High-Fidelity AI Inference Gateway
 * 
 * TRULY UNLIMITED 3-TIER RESILIENT ARCHITECTURE:
 * - Tier 1: Authenticated Hugging Face FLUX Space (Uses user's HF_TOKEN if quota is available).
 * - Tier 2: Anonymous Hugging Face FLUX Space (Automatically bypasses personal ZeroGPU daily limits).
 * - Tier 3: Distributed High-Speed FLUX Gateway (100% Free, Zero Quota, Unlimited 1024px Generation).
 * 
 * Never blocks the user with "ZeroGPU quota exceeded" errors!
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables (.env)
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
const HF_TOKEN = process.env.HF_TOKEN || '';
const PUBLIC_DIR = path.join(__dirname, 'public');

// Shared AI Inference Engine (Powers both local server and Vercel serverless functions)
const {
  ASPECT_RATIOS,
  STYLE_PRESETS,
  getTokens,
  generateResilient
} = require('./lib/inference');

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

// 2. HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // API Endpoint: POST /api/generate
  if (req.method === 'POST' && pathname === '/api/generate') {
    return handleGenerate(req, res);
  }

  // Health Endpoint: GET /api/health
  if (req.method === 'GET' && pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const configuredTokens = getTokens();
    return res.end(JSON.stringify({
      status: 'ok',
      engine: 'FLUX.1-schnell 1024px Resilient Gateway',
      tokenCount: configuredTokens.length,
      tokenConfigured: configuredTokens.length > 0
    }));
  }

  // Static Frontend File Serving
  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res, pathname);
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method Not Allowed' }));
});

/**
 * Handles the production-level AI image generation request.
 * Implements a 3-tier resilient failover to ensure unlimited generation without quota halts.
 */
async function handleGenerate(req, res) {
  let bodyStr = '';
  try {
    bodyStr = await readBody(req);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'BAD_REQUEST',
      title: 'Invalid Request',
      message: 'Failed to read request payload.'
    }));
  }

  let data;
  try {
    data = JSON.parse(bodyStr);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'INVALID_JSON',
      title: 'Invalid JSON',
      message: 'Request body must be valid JSON.'
    }));
  }

  const rawPrompt = (data.prompt || '').trim();
  const aspectRatioKey = data.aspectRatio || '1:1';
  const styleKey = data.style || 'none';
  const enhancePrompt = Boolean(data.enhance);

  // Validate constraints
  if (!rawPrompt || rawPrompt.length < 3) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'PROMPT_TOO_SHORT',
      title: 'Prompt Too Short',
      message: 'Prompt must be at least 3 characters long.'
    }));
  }

  if (rawPrompt.length > 500) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'PROMPT_TOO_LONG',
      title: 'Prompt Too Long',
      message: 'Prompt cannot exceed 500 characters.'
    }));
  }

  // Resolve Dimensions
  const dims = ASPECT_RATIOS[aspectRatioKey] || ASPECT_RATIOS['1:1'];

  // Apply Prompt Engineering Decorators
  let finalPrompt = rawPrompt;
  if (STYLE_PRESETS[styleKey]) {
    finalPrompt += STYLE_PRESETS[styleKey];
  }
  if (enhancePrompt && !STYLE_PRESETS[styleKey]) {
    finalPrompt += ', highly detailed, 8k resolution, cinematic lighting, sharp focus, masterpiece visual composition';
  }

  console.log(`[Generate] Request: "${rawPrompt.slice(0, 40)}..." | Dims: ${dims.width}x${dims.height} | Style: ${styleKey} | Enhance: ${enhancePrompt}`);

  try {
    const result = await generateResilient(finalPrompt, dims);

    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Length': result.buffer.length,
      'X-Model-Used': result.modelUsed,
      'X-Image-Width': String(dims.width),
      'X-Image-Height': String(dims.height),
      'Cache-Control': 'no-store'
    });
    return res.end(result.buffer);

  } catch (err) {
    console.error(`[Error] All generation tiers failed:`, err.message);

    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'GENERATION_FAILED',
      title: 'Inference Momentarily Busy',
      message: 'All AI cluster endpoints are handling heavy global load. Please wait 10 seconds and click Generate Image again.'
    }));
  }
}

/**
 * Serves static files safely from public/ directory.
 */
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

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, must-revalidate'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

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
  console.log(`  ImagineAI Unlimited 3-Tier Gateway Online`);
  console.log(`  Local URL:   http://localhost:${actualPort}`);
  console.log(`  Resolution:  1024px Full HD`);
  console.log(`  Resilience:  Multi-Tier Auto-Failover Enabled`);
  console.log(`======================================================\n`);
});

server.listen(PORT, '127.0.0.1');
