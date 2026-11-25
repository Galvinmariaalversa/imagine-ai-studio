const { handleGenerateRequest } = require('../lib/httpHandlers');

module.exports = async function handler(req, res) {
  try {
    return await handleGenerateRequest(req, res);
  } catch (err) {
    console.error('Unhandled /api/generate error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=UTF-8');
      res.end(JSON.stringify({
        error: 'INTERNAL_SERVER_ERROR',
        title: 'Server Error',
        message: 'Unexpected error while processing image generation.'
      }));
    }
  }
};
