const Joi = require('joi');

/**
 * Service registration validation schema
 */
const serviceRegistrationSchema = Joi.object({
  serviceName: Joi.string()
    .min(1)
    .max(255)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'serviceName must contain only alphanumeric characters, hyphens, and underscores',
      'any.required': 'serviceName is required'
    }),

  host: Joi.string()
    .min(1)
    .max(255)
    .optional(),

  hostName: Joi.string()
    .min(1)
    .max(255)
    .optional(),

  nodeName: Joi.string()
    .min(1)
    .max(255)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'nodeName must contain only alphanumeric characters, hyphens, and underscores',
      'any.required': 'nodeName is required'
    }),

  port: Joi.number()
    .integer()
    .min(1)
    .max(65535)
    .optional(),

  version: Joi.string()
    .min(1)
    .max(50)
    .optional(),

  namespace: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .messages({
      'string.pattern.base': 'namespace must contain only alphanumeric characters, hyphens, and underscores'
    }),

  region: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .messages({
      'string.pattern.base': 'region must contain only alphanumeric characters, hyphens, and underscores'
    }),

  zone: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .messages({
      'string.pattern.base': 'zone must contain only alphanumeric characters, hyphens, and underscores'
    }),

  datacenter: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .messages({
      'string.pattern.base': 'datacenter must contain only alphanumeric characters, hyphens, and underscores'
    }),

  tenantId: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .messages({
      'string.pattern.base': 'tenantId must contain only alphanumeric characters, hyphens, and underscores'
    }),

  timeOut: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .optional(),

  weight: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .optional(),

  ssl: Joi.boolean()
    .optional(),

  path: Joi.string()
    .max(500)
    .optional(),

  metadata: Joi.object({
    version: Joi.string()
      .pattern(/^\d+\.\d+\.\d+(-[\w\.\-]+)?(\+[\w\.\-]+)?$/)
      .optional()
      .messages({
        'string.pattern.base': 'metadata.version must be a valid semver string'
      }),

    weight: Joi.number()
      .integer()
      .min(1)
      .max(10)
      .optional(),

    tags: Joi.array()
      .items(Joi.string().min(1).max(50))
      .max(20)
      .optional(),

    healthCheck: Joi.object({
      url: Joi.string()
        .uri()
        .required(),
      interval: Joi.number()
        .integer()
        .min(1000)
        .max(300000)
        .optional(),
      timeout: Joi.number()
        .integer()
        .min(100)
        .max(30000)
        .optional()
    }).optional(),

    description: Joi.string()
      .max(500)
      .optional(),

    environment: Joi.string()
      .valid('development', 'staging', 'production', 'test')
      .optional(),

    owner: Joi.string()
      .min(1)
      .max(100)
      .optional(),

    team: Joi.string()
      .min(1)
      .max(100)
      .optional()
  }).optional(),

  aliases: Joi.array()
    .items(Joi.string().min(1).max(255))
    .max(10)
    .optional(),

  apiSpec: Joi.object()
    .optional()
}).or('host', 'hostName').messages({
  'object.missing': 'Either host or hostName must be provided'
});

/**
 * Service discovery validation schema
 */
const serviceDiscoverySchema = Joi.object({
  serviceName: Joi.string()
    .min(1)
    .max(255)
    .required(),

  loadBalancing: Joi.string()
    .valid(
      'round-robin',
      'random',
      'weighted-random',
      'least-connections',
      'weighted-least-connections',
      'consistent-hash',
      'ip-hash',
      'geo-aware',
      'least-response-time',
      'health-score',
      'predictive',
      'ai-driven',
      'advanced-ml',
      'cost-aware',
      'power-of-two-choices'
    )
    .optional(),

  version: Joi.string()
    .min(1)
    .max(50)
    .optional(),

  tags: Joi.alternatives()
    .try(
      Joi.string().min(1).max(100),
      Joi.array().items(Joi.string().min(1).max(100)).max(10)
    )
    .optional(),

  namespace: Joi.string()
    .min(1)
    .max(100)
    .optional(),

  region: Joi.string()
    .min(1)
    .max(100)
    .optional(),

  zone: Joi.string()
    .min(1)
    .max(100)
    .optional()
});

/**
 * Heartbeat validation schema
 */
const heartbeatSchema = Joi.object({
  nodeId: Joi.string()
    .min(1)
    .max(500)
    .required()
});

/**
 * Deregister validation schema
 */
const deregisterSchema = Joi.object({
  nodeId: Joi.string()
    .min(1)
    .max(500)
    .required()
});

/**
 * API key generation validation schema
 */
const apiKeyGenerationSchema = Joi.object({
  serviceName: Joi.string()
    .min(1)
    .max(255)
    .required(),

  rateLimit: Joi.number()
    .integer()
    .min(1)
    .max(10000)
    .optional(),

  description: Joi.string()
    .max(500)
    .optional()
});

/**
 * Validation middleware factory
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body || req.query || req.params, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace request data with validated/sanitized data
    if (req.body && Object.keys(req.body).length > 0) {
      req.body = value;
    } else if (req.query && Object.keys(req.query).length > 0) {
      req.query = value;
    } else if (req.params && Object.keys(req.params).length > 0) {
      req.params = value;
    }

    next();
  };
};

/**
 * Sanitize string input to prevent XSS
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>]/g, '');
};

/**
 * Rate limiting validation for API keys
 */
const validateApiKeyRateLimit = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  // Basic API key format validation
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key format' });
  }

  req.apiKey = apiKey;
  next();
};

module.exports = {
  serviceRegistrationSchema,
  serviceDiscoverySchema,
  heartbeatSchema,
  deregisterSchema,
  apiKeyGenerationSchema,
  validate,
  sanitizeString,
  validateApiKeyRateLimit
};