const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateGeneratePayload,
  isSupportedImageBuffer,
  handleGenerateRequest,
  handleUpscaleRequest,
  handleHealthRequest
} = require('../lib/httpHandlers');
const { createRateLimiter } = require('../lib/rateLimiter');

function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  return {
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    writeHead(code, h = {}) {
      statusCode = code;
      for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
    },
    end(data) { body = data; },
    status(code) {
      statusCode = code;
      return {
        send(data) { body = data; },
        end(data) { body = data; }
      };
    },
    get result() {
      return { statusCode, headers, body };
    }
  };
}

test('validateGeneratePayload rejects invalid prompt, ratio, style, batchCount, seed, steps, and guidance', () => {
  assert.equal(validateGeneratePayload({ prompt: 'hi' }).error.code, 'PROMPT_TOO_SHORT');
  assert.equal(validateGeneratePayload({ prompt: '1,2,3,45' }).error.code, 'INVALID_PROMPT_CONTENT');
  assert.equal(validateGeneratePayload({ prompt: '3435##########' }).error.code, 'INVALID_PROMPT_CONTENT');
  assert.equal(validateGeneratePayload({ prompt: 'aaa bbbb' }).error.code, 'INVALID_PROMPT_CONTENT');
  assert.equal(validateGeneratePayload({ prompt: 'asdf qwer' }).error.code, 'INVALID_PROMPT_CONTENT');
  assert.equal(validateGeneratePayload({ prompt: 'bcdfg hjkl' }).error.code, 'INVALID_PROMPT_CONTENT');
  assert.equal(validateGeneratePayload({ prompt: 'a'.repeat(501) }).error.code, 'PROMPT_TOO_LONG');
  assert.equal(validateGeneratePayload({ prompt: 'valid prompt', aspectRatio: '4:3' }).error.code, 'INVALID_ASPECT_RATIO');
  assert.equal(validateGeneratePayload({ prompt: 'valid prompt', style: 'unknown' }).error.code, 'INVALID_STYLE');
  assert.equal(validateGeneratePayload({ prompt: 'valid prompt', batchCount: 9 }).error.code, 'INVALID_BATCH_COUNT');
  assert.equal(validateGeneratePayload({ prompt: 'valid prompt', seed: -1 }).error.code, 'INVALID_SEED');
  assert.equal(validateGeneratePayload({ prompt: 'valid prompt', steps: 99 }).error.code, 'INVALID_STEPS');
  assert.equal(validateGeneratePayload({ prompt: 'valid prompt', guidanceScale: 25 }).error.code, 'INVALID_GUIDANCE');

  const ok = validateGeneratePayload({
    prompt: 'valid prompt',
    aspectRatio: '16:9',
    style: 'cinematic',
    batchCount: 2,
    seed: 42,
    steps: 6,
    guidanceScale: 2.5
  });
  assert.equal(ok.error, undefined);
  assert.equal(ok.data.dims.width, 1024);
  assert.equal(ok.data.dims.height, 576);
  assert.equal(ok.data.seed, 42);
  assert.equal(ok.data.steps, 6);
  assert.equal(ok.data.guidanceScale, 2.5);
});

test('isSupportedImageBuffer checks magic bytes', () => {
  assert.equal(isSupportedImageBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), true);
  assert.equal(isSupportedImageBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), true);
  assert.equal(isSupportedImageBuffer(Buffer.from('not-an-image-at-all')), false);
});

test('handleHealthRequest returns 200 with security headers', async () => {
  const req = { method: 'GET', headers: { origin: 'http://localhost:3000' }, socket: {} };
  const res = createMockRes();
  await handleHealthRequest(req, res);
  assert.equal(res.result.statusCode, 200);
  const parsed = JSON.parse(res.result.body);
  assert.equal(parsed.status, 'ok');
  assert.equal(res.result.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.result.headers['access-control-allow-origin'], 'http://localhost:3000');
});

test('handleGenerateRequest enforces content-type, rate limit, and returns 503 when all providers fail', async () => {
  const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });

  // Wrong content-type -> 415
  const badTypeReq = {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    socket: { remoteAddress: '10.0.0.1' },
    body: {}
  };
  const badTypeRes = createMockRes();
  await handleGenerateRequest(badTypeReq, badTypeRes, { limiter });
  assert.equal(badTypeRes.result.statusCode, 415);

  // Provider failure -> 503 structured error
  const failReq = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    socket: { remoteAddress: '10.0.0.1' },
    body: { prompt: 'a neon city at night' }
  };
  const failRes = createMockRes();
  await handleGenerateRequest(failReq, failRes, {
    limiter,
    generateResilient: async () => {
      const err = new Error('All providers timed out');
      err.code = 'ALL_PROVIDERS_FAILED';
      throw err;
    }
  });
  assert.equal(failRes.result.statusCode, 503);
  assert.equal(JSON.parse(failRes.result.body).error, 'ALL_PROVIDERS_FAILED');

  // Success -> 200 binary image with seed & warning headers
  const okRes = createMockRes();
  await handleGenerateRequest(failReq, okRes, {
    limiter,
    generateResilient: async () => ({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]),
      contentType: 'image/png',
      modelUsed: 'FLUX.1-schnell (HF Cloud)',
      seedUsed: 42,
      reproducibility: 'deterministic',
      warnings: ['FLUX.1-schnell does not support negative prompts; negative prompt was not applied.']
    })
  });
  assert.equal(okRes.result.statusCode, 200);
  assert.equal(okRes.result.headers['x-model-used'], 'FLUX.1-schnell (HF Cloud)');
  assert.equal(okRes.result.headers['x-seed-used'], '42');
  assert.equal(okRes.result.headers['x-reproducibility'], 'deterministic');
  assert.ok(decodeURIComponent(okRes.result.headers['x-warnings']).includes('does not support negative prompts'));

  // 3rd request hits rate limit -> 429
  const limitedRes = createMockRes();
  await handleGenerateRequest(failReq, limitedRes, { limiter });
  assert.equal(limitedRes.result.statusCode, 429);
});

test('handleUpscaleRequest validates image format', async () => {
  const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 5 });
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    socket: { remoteAddress: '10.0.0.2' },
    body: { imageBase64: Buffer.from('not-an-image-bytes').toString('base64') }
  };
  const res = createMockRes();
  await handleUpscaleRequest(req, res, { limiter });
  assert.equal(res.result.statusCode, 400);
  assert.equal(JSON.parse(res.result.body).error, 'INVALID_IMAGE_FORMAT');
});
