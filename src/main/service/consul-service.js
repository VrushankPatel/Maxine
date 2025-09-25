const consul = require('consul');
const { serviceRegistry } = require('../entity/service-registry');
const { registryService } = require('./registry-service');
const config = require('../config/config');
const { consoleError } = require('../util/logging/logging-util');

class ConsulService {
  constructor() {
    if (!config.consulEnabled) return;

    this.consulClient = consul({
      host: config.consulHost,
      port: config.consulPort,
    });
    this.registeredServices = new Map(); // consul service name -> maxine service name

    this.watchServices();
  }

  watchServices() {
    const watcher = this.consulClient.watch({
      method: this.consulClient.catalog.service.list,
      options: {},
    });

    watcher.on('change', (data) => {
      this.syncServices(data);
    });

    watcher.on('error', (err) => {
      consoleError('Consul watch error:', err);
    });
  }

  async syncServices(serviceList) {
    const currentServices = new Set(Object.keys(serviceList || {}));

    // Remove services no longer in Consul
    for (const [consulName, maxineName] of this.registeredServices) {
      if (!currentServices.has(consulName)) {
        // Deregister from Maxine
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
        this.registeredServices.delete(consulName);
      }
    }

    // Add or update services
    for (const serviceName of currentServices) {
      if (!this.registeredServices.has(serviceName)) {
        this.registeredServices.set(serviceName, `consul-${serviceName}`);
      }
      const maxineServiceName = this.registeredServices.get(serviceName);

      // Get service instances from Consul
      this.consulClient.catalog.service.nodes(serviceName, (err, result) => {
        if (err) {
          consoleError('Consul service nodes error:', err);
          return;
        }

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

        // Register new nodes
        (result || []).forEach((node) => {
          const nodeName = `${node.ServiceName}-${node.Node}-${node.ServicePort}`;
          const address = `http://${node.Address}:${node.ServicePort}`;

          registryService.registryService({
            serviceName: maxineServiceName,
            nodeName,
            address,
            timeOut: 30, // Default timeout
            weight: 1,
            metadata: {
              consul: true,
              service: node.ServiceName,
              tags: node.ServiceTags || [],
            },
            aliases: [],
          });
        });
      });
    }
  }
}

const consulService = new ConsulService();

module.exports = {
  consulService,
};
