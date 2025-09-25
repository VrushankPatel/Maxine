const apiKeyService = require('../../service/api-key-service');
const { audit } = require('../../util/logging/logging-util');

const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({ message: 'API key required' });
  }

  const isValid = apiKeyService.validateApiKey(apiKey);
  if (!isValid) {
    audit(`API_KEY_INVALID`, {
      apiKey: apiKey.substring(0, 8) + '...',
      ip: req.ip,
      path: req.path,
    });
    return res.status(429).json({ message: 'Invalid API key or rate limit exceeded' });
  }

  const keyData = apiKeyService.getApiKeyData(apiKey);
  req.apiKeyData = keyData;
  audit(`API_KEY_USED`, { serviceName: keyData.serviceName, ip: req.ip, path: req.path });
  next();
};

module.exports = {
  requireApiKey,
};
