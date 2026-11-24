const { ASPECT_RATIOS, STYLE_PRESETS, generateResilient } = require('../lib/inference');

module.exports = async function handler(req, res) {
  // Set CORS and security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Parse body safely whether pre-parsed by Vercel or raw stream
  let body = req.body;
  if (!body || typeof body !== 'object') {
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    } else {
      body = await new Promise((resolve) => {
        let raw = '';
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            resolve({});
          }
        });
        req.on('error', () => resolve({}));
      });
    }
  }
  body = body || {};

  const rawPrompt = (body.prompt || '').trim();
  const aspectRatioKey = body.aspectRatio || '1:1';
  const styleKey = body.style || 'none';
  const enhancePrompt = Boolean(body.enhance);

  if (!rawPrompt || rawPrompt.length < 3) {
    return res.status(400).json({
      error: 'PROMPT_TOO_SHORT',
      title: 'Prompt Too Short',
      message: 'Prompt must be at least 3 characters long.'
    });
  }

  if (rawPrompt.length > 500) {
    return res.status(400).json({
      error: 'PROMPT_TOO_LONG',
      title: 'Prompt Too Long',
      message: 'Prompt cannot exceed 500 characters.'
    });
  }

  const dims = ASPECT_RATIOS[aspectRatioKey] || ASPECT_RATIOS['1:1'];

  let finalPrompt = rawPrompt;
  if (STYLE_PRESETS[styleKey]) {
    finalPrompt += STYLE_PRESETS[styleKey];
  }
  if (enhancePrompt && !STYLE_PRESETS[styleKey]) {
    finalPrompt += ', highly detailed, 8k resolution, cinematic lighting, sharp focus, masterpiece visual composition';
  }

  try {
    const result = await generateResilient(finalPrompt, dims);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader('X-Model-Used', result.modelUsed);
    res.setHeader('X-Image-Width', String(dims.width));
    res.setHeader('X-Image-Height', String(dims.height));
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).send(result.buffer);
  } catch (err) {
    console.error('Serverless generation error:', err.message);
    return res.status(503).json({
      error: 'GENERATION_FAILED',
      title: 'Inference Momentarily Busy',
      message: 'All AI cluster endpoints are handling heavy global load. Please wait 10 seconds and click Generate Image again.'
    });
  }
};
