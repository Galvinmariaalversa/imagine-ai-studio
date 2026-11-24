/**
 * ImagineAI — Shared AI Inference Engine
 * Powers both local development (server.js) and Vercel Serverless Functions (/api/generate).
 */

const PRIMARY_MODEL = 'black-forest-labs/FLUX.1-schnell';

// Aspect Ratio Configurations (Native High-Fidelity Dimensions)
const ASPECT_RATIOS = {
  '1:1':  { width: 1024, height: 1024, label: '1024 × 1024 (Square)' },
  '16:9': { width: 1024, height: 576,  label: '1024 × 576 (Landscape)' },
  '9:16': { width: 576,  height: 1024, label: '576 × 1024 (Portrait)' }
};

// Curated Style Presets to Guarantee Satisfying Visual Quality
const STYLE_PRESETS = {
  'none': '',
  'photorealistic': ', 8k resolution, raw DSLR photograph, 35mm lens, sharp focus, hyper-realistic skin textures, natural volumetric lighting, masterpiece',
  'cinematic': ', blockbuster film still, 8k resolution, anamorphic lens flare, cinematic color grading, moody atmospheric lighting, dramatic composition, masterpiece',
  'anime': ', Makoto Shinkai aesthetic, vibrant luminous color palette, clean detailed lineart, stunning sky, anime masterpiece, high resolution illustration',
  'digital-art': ', trending on ArtStation, epic fantasy concept art, rich textures, dynamic lighting, intricate composition, masterpiece digital painting',
  '3d-render': ', Unreal Engine 5, Octane 3D render, raytracing, global illumination, smooth subsurface scattering, hyper-detailed, 8k resolution'
};

// Gradio Client Pool (Cached per token)
const gradioClients = new Map();

function getTokens() {
  const raw = process.env.HF_TOKENS || process.env.HF_TOKEN || '';
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(t => t && t !== 'your_huggingface_token_here');
}

async function getGradioClient(token = null) {
  const { Client } = require('@gradio/client');
  const cacheKey = token || '__ANON__';
  if (gradioClients.has(cacheKey)) {
    return gradioClients.get(cacheKey);
  }
  const label = token ? `token ${token.slice(0, 7)}...${token.slice(-4)}` : 'anonymous pool';
  console.log(`[Engine] Initializing connection to ${PRIMARY_MODEL} (${label})...`);
  const client = token ? await Client.connect(PRIMARY_MODEL, { token }) : await Client.connect(PRIMARY_MODEL);
  gradioClients.set(cacheKey, client);
  return client;
}

/**
 * Multi-Token & Multi-Tier Resilient Generation Pipeline:
 * - Tier 1: User's Hugging Face Tokens (Iterates across all configured tokens with auto-rotation)
 * - Tier 2: Anonymous Hugging Face ZeroGPU Space Pool
 * - Tier 3: Distributed High-Speed Visual Gateway (Unlimited Failover)
 */
async function generateResilient(prompt, dims) {
  // --- TIER 1: Authenticated HF Spaces with Token Rotation ---
  const tokens = getTokens();
  if (tokens.length > 0) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const masked = `${token.slice(0, 7)}...${token.slice(-4)}`;
      try {
        console.log(`[Tier 1] Dispatching to HF Space via Token #${i + 1} (${masked})...`);
        const buffer = await generateWithGradio(PRIMARY_MODEL, prompt, dims, token);
        return { 
          buffer, 
          contentType: 'image/webp', 
          modelUsed: tokens.length > 1 ? `FLUX.1-schnell (Token #${i + 1})` : 'FLUX.1-schnell (HF)' 
        };
      } catch (err) {
        console.warn(`[Tier 1 Limit] Token #${i + 1} (${masked}) exhausted or busy: ${err.message.slice(0, 80)}...`);
        if (i < tokens.length - 1) {
          console.log(`[Token Rotator] Auto-rotating to Token #${i + 2}...`);
        }
      }
    }
  }

  // --- TIER 2: Anonymous HF Space (bypasses token ZeroGPU limit) ---
  try {
    console.log(`[Tier 2] Dispatching to Anonymous HF Cluster...`);
    const buffer = await generateWithGradio(PRIMARY_MODEL, prompt, dims, null);
    return { buffer, contentType: 'image/webp', modelUsed: 'FLUX.1-schnell (HF Cloud)' };
  } catch (err2) {
    console.warn(`[Tier 2 Limit] Anonymous HF Space unavailable (${err2.message.slice(0, 80)}...). Failing over to Tier 3...`);
  }

  // --- TIER 3: Distributed Unlimited Visual Gateway ---
  try {
    console.log(`[Tier 3] Dispatching to Unlimited Distributed Gateway...`);
    const buffer = await generateWithDistributedGateway(prompt, dims);
    return { buffer, contentType: 'image/jpeg', modelUsed: 'FLUX.1-schnell (Unlimited Gateway)' };
  } catch (err3) {
    console.error(`[Tier 3 Error] Gateway failed: ${err3.message}`);
    throw new Error('All generation tiers are busy.');
  }
}

/**
 * Dispatches inference to Hugging Face Space via @gradio/client.
 */
async function generateWithGradio(modelName, prompt, dims, token) {
  const client = await getGradioClient(token);

  const prediction = await client.predict('/infer', {
    prompt: prompt,
    seed: Math.floor(Math.random() * 2147483647),
    randomize_seed: true,
    width: dims.width,
    height: dims.height,
    num_inference_steps: 4
  });

  const fileInfo = prediction.data ? prediction.data[0] : null;
  const imageUrl = fileInfo ? fileInfo.url : null;

  if (!imageUrl) {
    throw new Error(`Model did not return an image URL.`);
  }

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to retrieve rendered image bytes (${imgRes.status})`);
  }

  const arrayBuffer = await imgRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Dispatches inference to the Distributed Gateway (100% Free, Unlimited).
 */
async function generateWithDistributedGateway(prompt, dims) {
  const seed = Math.floor(Math.random() * 2147483647);
  const encoded = encodeURIComponent(prompt);

  // Try FLUX high-fidelity model first
  const fluxUrl = `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=${dims.width}&height=${dims.height}&seed=${seed}&nologo=true`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(fluxUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  } catch (e) {
    clearTimeout(timeoutId);
  }

  // Fallback to high-speed turbo endpoint
  const turboUrl = `https://image.pollinations.ai/prompt/${encoded}?model=turbo&width=${dims.width}&height=${dims.height}&seed=${seed}&nologo=true`;
  const turboRes = await fetch(turboUrl);
  if (turboRes.ok) {
    const arrayBuffer = await turboRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // Final fallback to default endpoint
  const defaultUrl = `https://image.pollinations.ai/prompt/${encoded}?width=${dims.width}&height=${dims.height}&seed=${seed}&nologo=true`;
  const defaultRes = await fetch(defaultUrl);
  if (!defaultRes.ok) {
    throw new Error(`Distributed gateway returned status ${defaultRes.status}`);
  }

  const arrayBuffer = await defaultRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  PRIMARY_MODEL,
  ASPECT_RATIOS,
  STYLE_PRESETS,
  getTokens,
  generateResilient
};
