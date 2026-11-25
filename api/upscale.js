const { handleUpscaleRequest } = require('../lib/httpHandlers');

module.exports = async function handler(req, res) {
  return handleUpscaleRequest(req, res);
};
