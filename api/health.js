const { getTokens } = require('../lib/inference');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const configuredTokens = getTokens();
  return res.status(200).json({
    status: 'ok',
    engine: 'FLUX.1-schnell 1024px Resilient Gateway (Vercel Serverless)',
    tokenCount: configuredTokens.length,
    tokenConfigured: configuredTokens.length > 0
  });
};
