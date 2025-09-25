const federationService = require('../../service/federation-service');

class FederationController {
  async addFederatedRegistry(req, res) {
    try {
      const { name, url } = req.body;
      if (!name || !url) {
        return res.status(400).json({ error: 'Name and URL are required' });
      }

      const result = federationService.addFederatedRegistry(name, url);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async removeFederatedRegistry(req, res) {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const result = federationService.removeFederatedRegistry(name);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getFederatedRegistries(req, res) {
    try {
      const registries = federationService.getFederatedRegistries();
      res.json(registries);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getFailoverStatus(req, res) {
    try {
      const status = federationService.getFailoverStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new FederationController();
