const apiKeyService = require('../../service/api-key-service');
const { audit } = require('../../util/logging/logging-util');
const config = require('../../config/config');

const generateApiKey = (req, res) => {
    try {
        const { serviceName, rateLimit } = req.body;
        if (!serviceName) {
            return res.status(400).json({ message: 'serviceName is required' });
        }

        const key = apiKeyService.generateApiKey(serviceName, rateLimit || 1000);
        audit(`API_KEY_GENERATED`, { serviceName, rateLimit: rateLimit || 1000, ip: req.ip, user: req.user?.userName });
        res.json({ apiKey: key, serviceName, rateLimit: rateLimit || 1000 });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

const revokeApiKey = (req, res) => {
    try {
        const { apiKey } = req.body;
        if (!apiKey) {
            return res.status(400).json({ message: 'apiKey is required' });
        }

        const revoked = apiKeyService.revokeApiKey(apiKey);
        if (revoked) {
            audit(`API_KEY_REVOKED`, { apiKey: apiKey.substring(0, 8) + '...', ip: req.ip, user: req.user?.userName });
            res.json({ message: 'API key revoked successfully' });
        } else {
            res.status(404).json({ message: 'API key not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

const listApiKeys = (req, res) => {
    try {
        const keys = apiKeyService.listApiKeys();
        res.json({ apiKeys: keys });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

const validateApiKey = (req, res) => {
    try {
        const { apiKey } = req.body;
        if (!apiKey) {
            return res.status(400).json({ message: 'apiKey is required' });
        }

        const isValid = apiKeyService.validateApiKey(apiKey);
        if (isValid) {
            const data = apiKeyService.getApiKeyData(apiKey);
            audit(`API_KEY_VALIDATED`, { serviceName: data.serviceName, ip: req.ip });
            res.json({ valid: true, serviceName: data.serviceName });
        } else {
            audit(`API_KEY_INVALID`, { apiKey: apiKey.substring(0, 8) + '...', ip: req.ip });
            res.status(429).json({ valid: false, message: 'Rate limit exceeded or invalid key' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    generateApiKey,
    revokeApiKey,
    listApiKeys,
    validateApiKey
};