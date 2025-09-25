const { getServiceRegistry } = require('../../entity/lightning-service-registry-simple');

const setCompatibilityRule = (req, res) => {
  try {
    const { serviceName, version, compatibleVersions } = req.body;

    if (!serviceName || !version || !compatibleVersions) {
      return res.status(400).json({
        error: 'Missing required fields: serviceName, version, compatibleVersions',
      });
    }

    const registry = getServiceRegistry();
    registry.setCompatibilityRule(serviceName, version, compatibleVersions);

    res.json({
      success: true,
      message: `Compatibility rule set for ${serviceName}:${version}`,
    });
  } catch (error) {
    console.error('Error setting compatibility rule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getCompatibilityRule = (req, res) => {
  try {
    const { serviceName, version } = req.query;

    if (!serviceName || !version) {
      return res.status(400).json({
        error: 'Missing required query parameters: serviceName, version',
      });
    }

    const registry = getServiceRegistry();
    const rule = registry.getCompatibilityRule(serviceName, version);

    if (rule) {
      res.json({
        serviceName,
        version,
        compatibleVersions: rule,
      });
    } else {
      res.status(404).json({
        error: `No compatibility rule found for ${serviceName}:${version}`,
      });
    }
  } catch (error) {
    console.error('Error getting compatibility rule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getAllCompatibilityRules = (req, res) => {
  try {
    const { serviceName } = req.query;

    if (!serviceName) {
      return res.status(400).json({
        error: 'Missing required query parameter: serviceName',
      });
    }

    const registry = getServiceRegistry();
    const rules = registry.getAllCompatibilityRules(serviceName);

    const result = {};
    for (const [version, compatibleVersions] of rules) {
      result[version] = compatibleVersions;
    }

    res.json({
      serviceName,
      rules: result,
    });
  } catch (error) {
    console.error('Error getting compatibility rules:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const checkCompatibility = (req, res) => {
  try {
    const { serviceName, version, requiredVersion } = req.body;

    if (!serviceName || !version || !requiredVersion) {
      return res.status(400).json({
        error: 'Missing required fields: serviceName, version, requiredVersion',
      });
    }

    const registry = getServiceRegistry();
    const compatible = registry.checkCompatibility(serviceName, version, requiredVersion);

    res.json({
      serviceName,
      version,
      requiredVersion,
      compatible,
    });
  } catch (error) {
    console.error('Error checking compatibility:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  setCompatibilityRule,
  getCompatibilityRule,
  getAllCompatibilityRules,
  checkCompatibility,
};
