const { handleHealthRequest } = require('../lib/httpHandlers');

module.exports = async function handler(req, res) {
  try {
    return await handleHealthRequest(req, res);
  } catch (err) {
    console.error('Unhandled /api/health error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=UTF-8');
      res.end(JSON.stringify({ status: 'error', message: err.message }));
    }
  }
};
