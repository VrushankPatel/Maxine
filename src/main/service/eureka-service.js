const axios = require('axios');
const { serviceRegistry } = require('../entity/service-registry');
const { registryService } = require('./registry-service');
const config = require('../config/config');
const { consoleError } = require('../util/logging/logging-util');

class EurekaService {
  constructor() {
    if (!config.eurekaEnabled) return;

    this.registeredServices = new Map(); // eureka app name -> maxine service name
    this.syncInterval = setInterval(() => this.syncServices(), 30000); // Sync every 30 seconds
    this.syncServices(); // Initial sync
  }

  async syncServices() {
    try {
      const response = await axios.get(
        `http://${config.eurekaHost}:${config.eurekaPort}/eureka/apps`
      );
      const applications = response.data.applications.application || [];

      const currentApps = new Set(applications.map((app) => app.name));

      // Remove services no longer in Eureka
      for (const [eurekaName, maxineName] of this.registeredServices) {
        if (!currentApps.has(eurekaName)) {
          const nodes = serviceRegistry.getNodes(maxineName);
          Object.keys(nodes || {}).forEach((nodeName) => {
            registryService.deregisterService(
              maxineName,
              nodes[nodeName].parentNode,
              'default',
              'default',
              'default'
            );
          });
          this.registeredServices.delete(eurekaName);
        }
      }

      // Add or update services
      for (const app of applications) {
        const eurekaName = app.name;
        if (!this.registeredServices.has(eurekaName)) {
          this.registeredServices.set(eurekaName, `eureka-${eurekaName}`);
        }
        const maxineServiceName = this.registeredServices.get(eurekaName);

        // Deregister existing nodes
        const existingNodes = serviceRegistry.getNodes(maxineServiceName);
        Object.keys(existingNodes || {}).forEach((nodeName) => {
          registryService.deregisterService(
            maxineServiceName,
            existingNodes[nodeName].parentNode,
            'default',
            'default',
            'default'
          );
        });

        // Register new instances
        const instances = app.instance || [];
        for (const instance of instances) {
          if (instance.status === 'UP') {
            const nodeName = `${eurekaName}-${instance.hostName}-${instance.port.$}`;
            const address = `http://${instance.hostName}:${instance.port.$}`;

            registryService.registryService({
              serviceName: maxineServiceName,
              nodeName,
              address,
              timeOut: 30,
              weight: instance.metadata ? parseInt(instance.metadata.weight) || 1 : 1,
              metadata: {
                eureka: true,
                app: eurekaName,
                ...instance.metadata,
              },
              aliases: [],
            });
          }
        }
      }
    } catch (err) {
      consoleError('Eureka sync error:', err.message);
    }
  }
}

const eurekaService = new EurekaService();

module.exports = {
  eurekaService,
};
