const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HF_MODEL_SCHEMAS,
  PRIMARY_MODEL,
  SECONDARY_HF_MODEL,
  buildFinalPrompt,
  isQuotaError
} = require('../lib/inference');
const { createRateLimiter } = require('../lib/rateLimiter');

test('HF_MODEL_SCHEMAS defines distinct schemas for FLUX and SD3.5', () => {
  const fluxPayload = HF_MODEL_SCHEMAS[PRIMARY_MODEL].buildPayload('a cat', { width: 1024, height: 1024 }, { negativePrompt: 'blurry', seed: 12345, steps: 6 });
  assert.equal(fluxPayload.prompt, 'a cat');
  assert.equal(fluxPayload.seed, 12345);
  assert.equal(fluxPayload.randomize_seed, false);
  assert.equal(fluxPayload.num_inference_steps, 6);
  assert.equal(fluxPayload.negative_prompt, undefined);

  const sdPayload = HF_MODEL_SCHEMAS[SECONDARY_HF_MODEL].buildPayload('a cat', { width: 1024, height: 576 }, { negativePrompt: 'blurry', guidanceScale: 3.5, steps: 8 });
  assert.equal(sdPayload.prompt, 'a cat');
  assert.equal(sdPayload.negative_prompt, 'blurry');
  assert.equal(sdPayload.guidance_scale, 3.5);
  assert.equal(sdPayload.num_inference_steps, 8);
  assert.equal(sdPayload.width, 1024);
  assert.equal(sdPayload.height, 576);
});

test('buildFinalPrompt applies style preset or explicit enhance', () => {
  assert.equal(buildFinalPrompt('hello', 'none', false), 'hello');
  assert.ok(buildFinalPrompt('hello', 'none', true).includes('8k resolution'));
  assert.ok(buildFinalPrompt('hello', 'anime', false).includes('Makoto Shinkai'));
});

test('isQuotaError detects quota and 429 errors', () => {
  assert.equal(isQuotaError(new Error('ZeroGPU quota exceeded')), true);
  assert.equal(isQuotaError(new Error('HTTP 429 Too Many Requests')), true);
  assert.equal(isQuotaError(new Error('Network timeout')), false);
});

test('createRateLimiter enforces sliding window per IP', () => {
  const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
  const req = { headers: { 'x-forwarded-for': '203.0.113.10' }, socket: {} };

  assert.equal(limiter.check(req).allowed, true);
  assert.equal(limiter.check(req).allowed, true);
  const blocked = limiter.check(req);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);

  const otherReq = { headers: { 'x-forwarded-for': '203.0.113.11' }, socket: {} };
  assert.equal(limiter.check(otherReq).allowed, true);
});
