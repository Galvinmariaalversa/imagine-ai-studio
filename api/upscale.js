const { handleUpscaleRequest } = require('../lib/httpHandlers');

module.exports = async function handler(req, res) {
  try {
    return await handleUpscaleRequest(req, res);
  } catch (err) {
    console.error('Unhandled /api/upscale error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=UTF-8');
      res.end(JSON.stringify({
        error: 'INTERNAL_SERVER_ERROR',
        title: 'Upscale Error',
        message: 'Unexpected error while processing upscale request.'
      }));
    }
  }
};
