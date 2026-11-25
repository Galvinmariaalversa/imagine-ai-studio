/**
 * ImagineAI — Shared AI Inference Engine
 * Powers both local development (server.js) and Vercel Serverless Functions (/api/*).
 */

const PRIMARY_MODEL = 'black-forest-labs/FLUX.1-schnell';
const SECONDARY_HF_MODEL = 'stabilityai/stable-diffusion-3.5-large-turbo';

const DEFAULT_BUDGET_MS = 50000; // Leaves headroom under Vercel's 60s maxDuration
const TOKEN_COOLDOWN_MS = 15 * 60 * 1000;

const ASPECT_RATIOS = {
  '1:1': { width: 1024, height: 1024, label: '1024 × 1024 (Square)' },
  '16:9': { width: 1024, height: 576, label: '1024 × 576 (Landscape)' },
  '9:16': { width: 576, height: 1024, label: '576 × 1024 (Portrait)' }
};

const STYLE_PRESETS = {
  'none': '',
  'photorealistic': ', 8k resolution, raw DSLR photograph, 35mm lens, sharp focus, hyper-realistic skin textures, natural volumetric lighting, masterpiece',
  'cinematic': ', blockbuster film still, 8k resolution, anamorphic lens flare, cinematic color grading, moody atmospheric lighting, dramatic composition, masterpiece',
  'anime': ', Makoto Shinkai aesthetic, vibrant luminous color palette, clean detailed lineart, stunning sky, anime masterpiece, high resolution illustration',
  'digital-art': ', trending on ArtStation, epic fantasy concept art, rich textures, dynamic lighting, intricate composition, masterpiece digital painting',
  '3d-render': ', Unreal Engine 5, Octane 3D render, raytracing, global illumination, smooth subsurface scattering, hyper-detailed, 8k resolution'
};

const HF_MODEL_SCHEMAS = {
  [PRIMARY_MODEL]: {
    route: '/infer',
    label: 'FLUX.1-schnell',
    supportsNegativePrompt: false,
    supportsGuidanceScale: false,
    maxSteps: 8,
    buildPayload: (prompt, dims, opts = {}) => ({
      prompt,
      seed: Number.isInteger(opts.seed) ? opts.seed : Math.floor(Math.random() * 2147483647),
      randomize_seed: !Number.isInteger(opts.seed),
      width: dims.width,
      height: dims.height,
      num_inference_steps: Math.min(8, Math.max(1, opts.steps || 4))
    })
  },
  [SECONDARY_HF_MODEL]: {
    route: '/infer',
    label: 'SD-3.5-Large-Turbo',
    supportsNegativePrompt: true,
    supportsGuidanceScale: true,
    maxSteps: 12,
    buildPayload: (prompt, dims, opts = {}) => ({
      prompt,
      negative_prompt: opts.negativePrompt || '',
      seed: Number.isInteger(opts.seed) ? opts.seed : Math.floor(Math.random() * 2147483647),
      randomize_seed: !Number.isInteger(opts.seed),
      width: dims.width,
      height: dims.height,
      guidance_scale: typeof opts.guidanceScale === 'number' ? Math.min(15, Math.max(0, opts.guidanceScale)) : 0,
      num_inference_steps: Math.min(12, Math.max(1, opts.steps || 4))
    })
  }
};

const gradioClients = new Map();
const tokenCooldowns = new Map();

function getTokens() {
  const raw = process.env.HF_TOKENS || process.env.HF_TOKEN || '';
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(t => t && t !== 'your_huggingface_token_here');
}

function isQuotaError(err) {
  const msg = (err && err.message ? err.message : '').toLowerCase();
  return msg.includes('quota') || msg.includes('limit') || msg.includes('exceeded') || msg.includes('429');
}

function buildFinalPrompt(rawPrompt, styleKey = 'none', enhancePrompt = false) {
  let finalPrompt = rawPrompt.trim();
  if (STYLE_PRESETS[styleKey]) {
    finalPrompt += STYLE_PRESETS[styleKey];
  } else if (enhancePrompt) {
    finalPrompt += ', highly detailed, 8k resolution, cinematic lighting, sharp focus, masterpiece visual composition';
  }
  return finalPrompt;
}

function withTimeout(promise, timeoutMs, label) {
  if (timeoutMs <= 0) {
    return Promise.reject(new Error(`${label} skipped (execution budget exhausted)`));
  }
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timerId));
}

async function getGradioClient(token = null, modelName = PRIMARY_MODEL) {
  const { Client } = require('@gradio/client');
  const cacheKey = `${modelName}::${token ? 'AUTH_' + token.slice(-6) : '__ANON__'}`;
  if (gradioClients.has(cacheKey)) {
    return gradioClients.get(cacheKey);
  }
  const client = token ? await Client.connect(modelName, { token }) : await Client.connect(modelName);
  gradioClients.set(cacheKey, client);
  return client;
}

async function fetchImageWithTimeout(url, timeoutMs = 15000) {
  if (timeoutMs <= 0) {
    throw new Error('Execution budget exhausted');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      throw new Error(`Unexpected content-type: ${contentType || 'unknown'}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1000) {
      throw new Error('Received empty or invalid image payload');
    }

    return { buffer, contentType: contentType.split(';')[0] };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateWithGradio(modelName, prompt, dims, token, genOpts = {}, timeoutMs = 20000) {
  const schema = HF_MODEL_SCHEMAS[modelName];
  if (!schema) {
    throw new Error(`Unsupported Gradio model: ${modelName}`);
  }

  const run = async () => {
    const client = await getGradioClient(token, modelName);
    const payload = schema.buildPayload(prompt, dims, genOpts);
    const prediction = await client.predict(schema.route, payload);

    const fileInfo = prediction && prediction.data ? prediction.data[0] : null;
    const imageUrl = fileInfo ? (fileInfo.url || fileInfo) : null;
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error('Model did not return an image URL');
    }

    const img = await fetchImageWithTimeout(imageUrl, Math.min(timeoutMs, 15000));
    return { ...img, seedUsed: payload.seed };
  };

  return withTimeout(run(), timeoutMs, schema.label);
}

async function generateWithAiHorde(prompt, dims, negativePrompt = '', timeoutMs = 20000, genOpts = {}) {
  if (timeoutMs < 5000) {
    throw new Error('AI Horde skipped (insufficient remaining time budget)');
  }

  let width = 512;
  let height = 512;
  if (dims.width > dims.height) {
    width = 576;
    height = 320;
  } else if (dims.height > dims.width) {
    width = 320;
    height = 576;
  }

  const neg = negativePrompt || 'blurry, low quality, distorted, watermark';
  const steps = Math.min(35, Math.max(10, (genOpts.steps || 4) * 5));
  const cfgScale = typeof genOpts.guidanceScale === 'number' && genOpts.guidanceScale > 0
    ? Math.min(15, genOpts.guidanceScale)
    : 7.5;
  const seedStr = Number.isInteger(genOpts.seed) ? String(genOpts.seed) : '';

  const submitController = new AbortController();
  const submitTimer = setTimeout(() => submitController.abort(), 8000);

  let id;
  try {
    const submitRes = await fetch('https://stablehorde.net/api/v2/generate/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': '0000000000',
        'Client-Agent': 'ImagineAI:1.0:studio'
      },
      signal: submitController.signal,
      body: JSON.stringify({
        prompt: `${prompt} ### ${neg}`,
        params: {
          width,
          height,
          steps,
          n: 1,
          cfg_scale: cfgScale,
          sampler_name: 'k_euler_a',
          seed: seedStr
        },
        nsfw: false,
        censor_nsfw: true,
        trusted_workers: false
      })
    });

    if (!submitRes.ok) {
      throw new Error(`AI Horde submit HTTP ${submitRes.status}`);
    }
    const submitJson = await submitRes.json();
    id = submitJson.id;
  } finally {
    clearTimeout(submitTimer);
  }

  if (!id) {
    throw new Error('AI Horde did not return a job ID');
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500));
    if (Date.now() >= deadline) break;

    const checkRes = await fetch(`https://stablehorde.net/api/v2/generate/check/${id}`, {
      headers: { 'Client-Agent': 'ImagineAI:1.0:studio' }
    });
    if (!checkRes.ok) continue;
    const checkData = await checkRes.json();
    if (checkData.faulted) {
      throw new Error('AI Horde job faulted');
    }
    if (checkData.done) {
      const statusRes = await fetch(`https://stablehorde.net/api/v2/generate/status/${id}`, {
        headers: { 'Client-Agent': 'ImagineAI:1.0:studio' }
      });
      if (!statusRes.ok) {
        throw new Error(`AI Horde status HTTP ${statusRes.status}`);
      }
      const statusData = await statusRes.json();
      const gen = statusData.generations && statusData.generations[0];
      if (!gen || !gen.img) {
        throw new Error('AI Horde returned no image');
      }
      if (gen.img.startsWith('http')) {
        const fetched = await fetchImageWithTimeout(gen.img, 10000);
        return { ...fetched, seedUsed: gen.seed || seedStr || null };
      }
      return {
        buffer: Buffer.from(gen.img, 'base64'),
        contentType: 'image/webp',
        seedUsed: gen.seed || seedStr || null
      };
    }
  }

  throw new Error('AI Horde generation timed out');
}

async function generateWithPollinations(prompt, dims, negativePrompt = '', remainingMs = 15000, genOpts = {}) {
  const seed = Number.isInteger(genOpts.seed) ? genOpts.seed : Math.floor(Math.random() * 2147483647);
  const encoded = encodeURIComponent(prompt);
  const negQuery = negativePrompt ? `&negative=${encodeURIComponent(negativePrompt)}` : '';

  const endpoints = [
    `https://gen.pollinations.ai/image/${encoded}?model=flux&width=${dims.width}&height=${dims.height}&seed=${seed}&nologo=true${negQuery}`,
    `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=${dims.width}&height=${dims.height}&seed=${seed}&nologo=true${negQuery}`
  ];

  const perEndpointTimeout = Math.min(8000, Math.floor(remainingMs / endpoints.length));
  let lastError = null;

  for (const url of endpoints) {
    try {
      const result = await fetchImageWithTimeout(url, perEndpointTimeout);
      return { ...result, modelUsed: 'FLUX.1 (Pollinations)', seedUsed: seed, warnings: [] };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError ? lastError.message : 'Pollinations unavailable');
}

function collectModelWarnings(schema, genOpts) {
  const warnings = [];
  if (genOpts.negativePrompt && !schema.supportsNegativePrompt) {
    warnings.push(`${schema.label} does not support negative prompts; negative prompt was not applied.`);
  }
  if (typeof genOpts.guidanceScale === 'number' && genOpts.guidanceScale > 0 && !schema.supportsGuidanceScale) {
    warnings.push(`${schema.label} uses fixed guidance; guidance scale was not applied.`);
  }
  return warnings;
}

/**
 * Time-budgeted 3-tier resilient generation pipeline.
 * Ensures no single provider exhausts the entire serverless timeout budget.
 */
async function generateResilient(prompt, dims, negativePrompt = '', options = {}) {
  const budgetMs = options.budgetMs || DEFAULT_BUDGET_MS;
  const deadline = Date.now() + budgetMs;
  const remaining = () => Math.max(0, deadline - Date.now());
  const cleanNeg = (negativePrompt || '').trim();
  const genOpts = {
    negativePrompt: cleanNeg,
    seed: Number.isInteger(options.seed) ? options.seed : null,
    steps: Number.isInteger(options.steps) ? options.steps : 4,
    guidanceScale: typeof options.guidanceScale === 'number' ? options.guidanceScale : null
  };
  const providerErrors = [];

  // --- TIER 1: Optional Authenticated HF Token Pool ---
  const tokens = getTokens();
  for (let i = 0; i < tokens.length; i++) {
    if (remaining() < 4000) break;
    const token = tokens[i];
    const cooldownUntil = tokenCooldowns.get(token) || 0;
    if (Date.now() < cooldownUntil) continue;

    try {
      const schema = HF_MODEL_SCHEMAS[PRIMARY_MODEL];
      const img = await generateWithGradio(
        PRIMARY_MODEL,
        prompt,
        dims,
        token,
        genOpts,
        Math.min(18000, remaining())
      );
      return {
        buffer: img.buffer,
        contentType: img.contentType || 'image/webp',
        modelUsed: tokens.length > 1 ? `FLUX.1-schnell (Token #${i + 1})` : 'FLUX.1-schnell (HF)',
        seedUsed: img.seedUsed,
        reproducibility: 'deterministic',
        warnings: collectModelWarnings(schema, genOpts)
      };
    } catch (err) {
      gradioClients.delete(`${PRIMARY_MODEL}::AUTH_${token.slice(-6)}`);
      if (isQuotaError(err)) {
        tokenCooldowns.set(token, Date.now() + TOKEN_COOLDOWN_MS);
      }
      providerErrors.push(`Tier1-Token#${i + 1}: ${err.message}`);
    }
  }

  // --- TIER 2: Anonymous HF Space Pool (Model-Specific Schemas) ---
  for (const hfModel of [PRIMARY_MODEL, SECONDARY_HF_MODEL]) {
    if (remaining() < 4000) break;
    const schema = HF_MODEL_SCHEMAS[hfModel];
    try {
      const img = await generateWithGradio(
        hfModel,
        prompt,
        dims,
        null,
        genOpts,
        Math.min(18000, remaining())
      );
      return {
        buffer: img.buffer,
        contentType: img.contentType || 'image/webp',
        modelUsed: `${schema.label} (HF Cloud)`,
        seedUsed: img.seedUsed,
        reproducibility: 'deterministic',
        warnings: collectModelWarnings(schema, genOpts)
      };
    } catch (err) {
      gradioClients.delete(`${hfModel}::__ANON__`);
      providerErrors.push(`Tier2-${schema.label}: ${err.message}`);
    }
  }

  // --- TIER 3a: Pollinations Gateway ---
  if (remaining() >= 4000) {
    try {
      const pol = await generateWithPollinations(prompt, dims, cleanNeg, Math.min(12000, remaining()), genOpts);
      return {
        ...pol,
        reproducibility: 'approximate'
      };
    } catch (err) {
      providerErrors.push(`Tier3-Pollinations: ${err.message}`);
    }
  }

  // --- TIER 3b: AI Horde Decentralized GPU Cluster ---
  if (remaining() >= 5000) {
    try {
      const horde = await generateWithAiHorde(prompt, dims, cleanNeg, remaining(), genOpts);
      return {
        buffer: horde.buffer,
        contentType: horde.contentType,
        modelUsed: 'AI Horde (Stable Diffusion)',
        seedUsed: horde.seedUsed,
        reproducibility: 'approximate',
        warnings: Number.isInteger(genOpts.seed)
          ? ['AI Horde uses heterogeneous community workers; exact seed reproducibility is not guaranteed.']
          : []
      };
    } catch (err) {
      providerErrors.push(`Tier3-AIHorde: ${err.message}`);
    }
  }

  const finalErr = new Error('All image generation providers are currently unavailable or timed out.');
  finalErr.code = 'ALL_PROVIDERS_FAILED';
  finalErr.providerErrors = providerErrors;
  throw finalErr;
}

/**
 * Upscales an image 2x using verified Hugging Face Real-ESRGAN Space schemas.
 */
async function upscaleResilient(imageBuffer, mimeType = 'image/png', options = {}) {
  const { Client, handle_file } = require('@gradio/client');
  const budgetMs = options.budgetMs || DEFAULT_BUDGET_MS;
  const deadline = Date.now() + budgetMs;
  const remaining = () => Math.max(0, deadline - Date.now());
  const blob = new Blob([imageBuffer], { type: mimeType });

  const spaces = [
    {
      id: 'Nick088/Real-ESRGAN_Pytorch',
      route: '/predict',
      buildPayload: () => ({ img: handle_file(blob), size_modifier: '2x' })
    },
    {
      id: 'doevent/Face-Real-ESRGAN',
      route: '/predict',
      buildPayload: () => [handle_file(blob), '2x']
    }
  ];

  const providerErrors = [];
  for (const space of spaces) {
    if (remaining() < 5000) break;
    try {
      const run = async () => {
        const client = await Client.connect(space.id);
        const result = await client.predict(space.route, space.buildPayload());
        const fileInfo = result && result.data ? result.data[0] : null;
        const imageUrl = fileInfo && (fileInfo.url || fileInfo);
        if (!imageUrl || typeof imageUrl !== 'string') {
          throw new Error('Upscaler did not return an image URL');
        }
        return await fetchImageWithTimeout(imageUrl, Math.min(20000, remaining()));
      };
      const fetched = await withTimeout(run(), Math.min(28000, remaining()), space.id);
      return { ...fetched, upscalerUsed: space.id };
    } catch (err) {
      providerErrors.push(`${space.id}: ${err.message}`);
    }
  }

  const err = new Error('All 2x upscale providers are currently unavailable.');
  err.code = 'UPSCALE_UNAVAILABLE';
  err.providerErrors = providerErrors;
  throw err;
}

module.exports = {
  PRIMARY_MODEL,
  SECONDARY_HF_MODEL,
  ASPECT_RATIOS,
  STYLE_PRESETS,
  HF_MODEL_SCHEMAS,
  getTokens,
  isQuotaError,
  buildFinalPrompt,
  fetchImageWithTimeout,
  generateWithPollinations,
  generateWithAiHorde,
  generateResilient,
  upscaleResilient
};
