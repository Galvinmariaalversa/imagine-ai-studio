const { handleGenerateRequest } = require('../lib/httpHandlers');

module.exports = async function handler(req, res) {
  return handleGenerateRequest(req, res);
};
