/**
 * ImagineAI — Shared HTTP Request/Response Handlers
 * Unifies validation, CORS, security headers, rate limiting, and error formatting
 * across local Node.js (server.js) and Vercel Serverless Functions (api/*.js).
 */
const {
  ASPECT_RATIOS,
  STYLE_PRESETS,
  getTokens,
  buildFinalPrompt,
  generateResilient,
  upscaleResilient
} = require('./inference');
const { createRateLimiter } = require('./rateLimiter');

const generateLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 15 });
const upscaleLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 6 });

const MAX_GENERATE_BODY_BYTES = 32 * 1024; // 32 KB
const MAX_UPSCALE_BODY_BYTES = 12 * 1024 * 1024; // 12 MB JSON wrapper
const MAX_UPSCALE_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB decoded image
const VALID_BATCH_COUNTS = new Set([1, 2, 4]);

function getAllowedOrigin(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return null;

  // Always allow local development origins
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return origin;
  }

  const configured = (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (process.env.VERCEL_URL) {
    configured.push(`https://${process.env.VERCEL_URL}`);
  }

  if (configured.includes(origin)) {
    return origin;
  }

  // Same-host check if Host header matches Origin host
  const host = req.headers && req.headers.host;
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
    return origin;
  }

  return null;
}

function applySecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const allowedOrigin = getAllowedOrigin(req);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  if (typeof res.status === 'function') {
    return res.status(statusCode).send(body);
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  return res.end(body);
}

function sendBinary(res, statusCode, buffer, headers = {}) {
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }
  if (typeof res.status === 'function') {
    return res.status(statusCode).send(buffer);
  }
  res.writeHead(statusCode, headers);
  return res.end(buffer);
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > maxBytes) {
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
        return;
      }
      try {
        resolve(JSON.parse(req.body));
      } catch (e) {
        const err = new Error('Invalid JSON');
        err.statusCode = 400;
        reject(err);
      }
      return;
    }

    let raw = '';
    let size = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > maxBytes) {
        aborted = true;
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
        if (typeof req.destroy === 'function') req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (aborted) return;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        const err = new Error('Invalid JSON');
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}

function isSupportedImageBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // WEBP: RIFF....WEBP
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return true;
  // GIF: GIF8
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return true;
  return false;
}

const KEYBOARD_MASH_WORDS = new Set(['asdf', 'asdfg', 'qwer', 'qwert', 'qwerty', 'zxcv', 'zxcvb', 'hjkl', 'fdsa', 'rewq', 'vcxz']);

function isMeaningfulPrompt(rawPrompt) {
  if (/^(.)\1+$/i.test(rawPrompt.replace(/\s+/g, ''))) return false;
  const words = rawPrompt.match(/[a-zA-Z\u00C0-\u024F]{2,}/g) || [];
  const validWords = words.filter((w) => {
    const lower = w.toLowerCase();
    if (KEYBOARD_MASH_WORDS.has(lower)) return false;
    if (/^(.)\1+$/i.test(lower)) return false;
    if (/^(.{2})\1+$/i.test(lower)) return false;
    const hasVowel = /[aeiouy\u00C0-\u024F]/i.test(lower);
    const hasConsonant = /[bcdfghjklmnpqrstvwxz]/i.test(lower);
    return hasVowel && hasConsonant && lower.length >= 2;
  });
  return validWords.length >= 1;
}

function validateGeneratePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: { status: 400, code: 'INVALID_BODY', title: 'Invalid Request', message: 'Request body must be a JSON object.' } };
  }

  const rawPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!rawPrompt || rawPrompt.length < 3) {
    return { error: { status: 400, code: 'PROMPT_TOO_SHORT', title: 'Prompt Too Short', message: 'Prompt must be at least 3 characters long.' } };
  }
  if (rawPrompt.length > 500) {
    return { error: { status: 400, code: 'PROMPT_TOO_LONG', title: 'Prompt Too Long', message: 'Prompt cannot exceed 500 characters.' } };
  }
  if (!isMeaningfulPrompt(rawPrompt)) {
    return { error: { status: 400, code: 'INVALID_PROMPT_CONTENT', title: 'Please Enter a Meaningful Prompt', message: 'Please enter a descriptive prompt with real words, not just numbers, repeated letters, or random characters.' } };
  }

  const aspectRatio = body.aspectRatio || '1:1';
  if (!Object.prototype.hasOwnProperty.call(ASPECT_RATIOS, aspectRatio)) {
    return { error: { status: 400, code: 'INVALID_ASPECT_RATIO', title: 'Invalid Aspect Ratio', message: 'Supported aspect ratios are 1:1, 16:9, and 9:16.' } };
  }

  const style = body.style || 'none';
  if (!Object.prototype.hasOwnProperty.call(STYLE_PRESETS, style)) {
    return { error: { status: 400, code: 'INVALID_STYLE', title: 'Invalid Style', message: 'Unsupported style preset selected.' } };
  }

  if (body.batchCount !== undefined) {
    const count = Number(body.batchCount);
    if (!VALID_BATCH_COUNTS.has(count)) {
      return { error: { status: 400, code: 'INVALID_BATCH_COUNT', title: 'Invalid Batch Count', message: 'Batch count must be 1, 2, or 4.' } };
    }
  }

  let seed = null;
  if (body.seed !== undefined && body.seed !== null && body.seed !== '') {
    const parsedSeed = Number(body.seed);
    if (!Number.isInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 2147483647) {
      return { error: { status: 400, code: 'INVALID_SEED', title: 'Invalid Seed', message: 'Seed must be an integer between 0 and 2147483647.' } };
    }
    seed = parsedSeed;
  }

  let steps = 4;
  if (body.steps !== undefined && body.steps !== null && body.steps !== '') {
    const parsedSteps = Number(body.steps);
    if (!Number.isInteger(parsedSteps) || parsedSteps < 1 || parsedSteps > 12) {
      return { error: { status: 400, code: 'INVALID_STEPS', title: 'Invalid Steps', message: 'Inference steps must be an integer between 1 and 12.' } };
    }
    steps = parsedSteps;
  }

  let guidanceScale = null;
  if (body.guidanceScale !== undefined && body.guidanceScale !== null && body.guidanceScale !== '') {
    const parsedGuidance = Number(body.guidanceScale);
    if (Number.isNaN(parsedGuidance) || parsedGuidance < 0 || parsedGuidance > 15) {
      return { error: { status: 400, code: 'INVALID_GUIDANCE', title: 'Invalid Guidance Scale', message: 'Guidance scale must be a number between 0 and 15.' } };
    }
    guidanceScale = parsedGuidance;
  }

  const negativePrompt = typeof body.negativePrompt === 'string' ? body.negativePrompt.trim().slice(0, 300) : '';
  const enhance = Boolean(body.enhance);

  return {
    data: {
      rawPrompt,
      negativePrompt,
      aspectRatio,
      style,
      enhance,
      seed,
      steps,
      guidanceScale,
      dims: ASPECT_RATIOS[aspectRatio]
    }
  };
}

async function handleHealthRequest(req, res) {
  applySecurityHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') return res.status(200).end();
    res.writeHead(200);
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' });
  }
  const configuredTokens = getTokens();
  return sendJson(res, 200, {
    status: 'ok',
    engine: 'FLUX.1-schnell 1024px Resilient Gateway',
    tokenCount: configuredTokens.length,
    tokenConfigured: configuredTokens.length > 0
  });
}

async function handleGenerateRequest(req, res, deps = {}) {
  const genFn = deps.generateResilient || generateResilient;
  const limiter = deps.limiter || generateLimiter;

  applySecurityHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') return res.status(200).end();
    res.writeHead(200);
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' });
  }

  const contentType = (req.headers && req.headers['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    return sendJson(res, 415, { error: 'UNSUPPORTED_MEDIA_TYPE', title: 'Invalid Content-Type', message: 'Content-Type must be application/json.' });
  }

  const limit = limiter.check(req);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    return sendJson(res, 429, {
      error: 'RATE_LIMITED',
      title: 'Too Many Requests',
      message: `Please wait ${limit.retryAfterSeconds} seconds before generating again.`
    });
  }

  let body;
  try {
    body = await readJsonBody(req, MAX_GENERATE_BODY_BYTES);
  } catch (err) {
    const status = err.statusCode || 400;
    return sendJson(res, status, {
      error: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
      title: status === 413 ? 'Payload Too Large' : 'Invalid JSON',
      message: err.message
    });
  }

  const validated = validateGeneratePayload(body);
  if (validated.error) {
    const e = validated.error;
    return sendJson(res, e.status, { error: e.code, title: e.title, message: e.message });
  }

  const { rawPrompt, negativePrompt, style, enhance, seed, steps, guidanceScale, dims } = validated.data;
  const finalPrompt = buildFinalPrompt(rawPrompt, style, enhance);

  try {
    const result = await genFn(finalPrompt, dims, negativePrompt, { seed, steps, guidanceScale });
    const headers = {
      'Content-Type': result.contentType,
      'Content-Length': String(result.buffer.length),
      'X-Model-Used': result.modelUsed,
      'X-Image-Width': String(dims.width),
      'X-Image-Height': String(dims.height),
      'X-Enhanced-Prompt': encodeURIComponent(finalPrompt),
      'X-Reproducibility': result.reproducibility || 'approximate',
      'Cache-Control': 'no-store'
    };
    if (result.seedUsed !== undefined && result.seedUsed !== null) {
      headers['X-Seed-Used'] = String(result.seedUsed);
    }
    if (Array.isArray(result.warnings) && result.warnings.length > 0) {
      headers['X-Warnings'] = encodeURIComponent(result.warnings.join(' | '));
    }
    return sendBinary(res, 200, result.buffer, headers);
  } catch (err) {
    console.error('[Generate Error]', err.message);
    return sendJson(res, 503, {
      error: err.code || 'GENERATION_FAILED',
      title: 'Inference Momentarily Busy',
      message: 'All AI cluster endpoints are currently busy or timed out. Please wait a moment and try again.'
    });
  }
}

async function handleUpscaleRequest(req, res, deps = {}) {
  const upFn = deps.upscaleResilient || upscaleResilient;
  const limiter = deps.limiter || upscaleLimiter;

  applySecurityHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') return res.status(200).end();
    res.writeHead(200);
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' });
  }

  const contentType = (req.headers && req.headers['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    return sendJson(res, 415, { error: 'UNSUPPORTED_MEDIA_TYPE', title: 'Invalid Content-Type', message: 'Content-Type must be application/json.' });
  }

  const limit = limiter.check(req);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    return sendJson(res, 429, {
      error: 'RATE_LIMITED',
      title: 'Too Many Upscale Requests',
      message: `Please wait ${limit.retryAfterSeconds} seconds before upscaling again.`
    });
  }

  let body;
  try {
    body = await readJsonBody(req, MAX_UPSCALE_BODY_BYTES);
  } catch (err) {
    const status = err.statusCode || 400;
    return sendJson(res, status, {
      error: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
      title: status === 413 ? 'Payload Too Large' : 'Invalid JSON',
      message: err.message
    });
  }

  const rawBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.replace(/^data:[^;]+;base64,/, '').trim() : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/png';
  if (!rawBase64) {
    return sendJson(res, 400, {
      error: 'MISSING_IMAGE',
      title: 'Missing Image',
      message: 'No image data provided for upscaling.'
    });
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  if (buffer.length > MAX_UPSCALE_IMAGE_BYTES) {
    return sendJson(res, 413, {
      error: 'IMAGE_TOO_LARGE',
      title: 'Image Too Large',
      message: 'Image exceeds the 8MB maximum size for upscaling.'
    });
  }

  if (!isSupportedImageBuffer(buffer)) {
    return sendJson(res, 400, {
      error: 'INVALID_IMAGE_FORMAT',
      title: 'Invalid Image Format',
      message: 'Only valid PNG, JPEG, WEBP, or GIF images can be upscaled.'
    });
  }

  try {
    const result = await upFn(buffer, mimeType);
    return sendBinary(res, 200, result.buffer, {
      'Content-Type': result.contentType,
      'Content-Length': String(result.buffer.length),
      'X-Upscaler-Used': result.upscalerUsed,
      'Cache-Control': 'no-store'
    });
  } catch (err) {
    console.warn('[Upscale] Remote 2x providers unavailable (client will use local 2x fallback):', err.message);
    return sendJson(res, 503, {
      error: err.code || 'UPSCALE_FAILED',
      title: 'Upscaler Busy',
      message: 'Remote 2x upscaler is currently busy. Please try again in a moment.'
    });
  }
}

module.exports = {
  generateLimiter,
  upscaleLimiter,
  validateGeneratePayload,
  isSupportedImageBuffer,
  getAllowedOrigin,
  applySecurityHeaders,
  handleHealthRequest,
  handleGenerateRequest,
  handleUpscaleRequest
};
