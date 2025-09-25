const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { consoleError, consoleLog } = require('../util/logging/logging-util');

class ApiKeyService {
  constructor() {
    this.apiKeys = new Map(); // key -> { serviceName, rateLimit, createdAt, lastUsed, usage: { requests: number, windowStart: timestamp } }
    this.loadApiKeys();
  }

  generateApiKey(serviceName, rateLimit = 1000) {
    const key = crypto.randomBytes(32).toString('hex');
    const apiKeyData = {
      serviceName,
      rateLimit,
      createdAt: Date.now(),
      lastUsed: null,
      usage: {
        requests: 0,
        windowStart: Date.now(),
      },
    };
    this.apiKeys.set(key, apiKeyData);
    this.saveApiKeys();
    return key;
  }

  validateApiKey(key) {
    const apiKeyData = this.apiKeys.get(key);
    if (!apiKeyData) return false;

    // Update last used
    apiKeyData.lastUsed = Date.now();

    // Check rate limit
    const now = Date.now();
    const windowMs = config.rateLimitWindowMs || 900000; // 15 minutes default

    if (now - apiKeyData.usage.windowStart >= windowMs) {
      // Reset window
      apiKeyData.usage.requests = 0;
      apiKeyData.usage.windowStart = now;
    }

    if (apiKeyData.usage.requests >= apiKeyData.rateLimit) {
      return false; // Rate limit exceeded
    }

    apiKeyData.usage.requests++;
    this.saveApiKeys();
    return true;
  }

  getApiKeyData(key) {
    return this.apiKeys.get(key);
  }

  revokeApiKey(key) {
    const deleted = this.apiKeys.delete(key);
    if (deleted) {
      this.saveApiKeys();
    }
    return deleted;
  }

  listApiKeys() {
    return Array.from(this.apiKeys.entries()).map(([key, data]) => ({
      key: key.substring(0, 8) + '...', // Mask the key
      serviceName: data.serviceName,
      rateLimit: data.rateLimit,
      createdAt: data.createdAt,
      lastUsed: data.lastUsed,
      currentUsage: data.usage.requests,
    }));
  }

  loadApiKeys() {
    try {
      const filePath = path.join(__dirname, '../../../data/api-keys.json');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const keys = JSON.parse(data);
        for (const [key, value] of Object.entries(keys)) {
          this.apiKeys.set(key, value);
        }
      }
    } catch (error) {
      consoleError('Error loading API keys:', error);
    }
  }

  saveApiKeys() {
    try {
      const filePath = path.join(__dirname, '../../../data/api-keys.json');
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Object.fromEntries(this.apiKeys);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      consoleError('Error saving API keys:', error);
    }
  }
}

module.exports = new ApiKeyService();
