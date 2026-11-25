const { handleHealthRequest } = require('../lib/httpHandlers');

module.exports = async function handler(req, res) {
  return handleHealthRequest(req, res);
};
