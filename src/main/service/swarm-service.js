const Docker = require('dockerode');
const { serviceRegistry } = require('../entity/service-registry');
const { registryService } = require('./registry-service');
const config = require('../config/config');
const { consoleError } = require('../util/logging/logging-util');

class SwarmService {
  constructor() {
    if (!config.swarmEnabled) return;

    this.docker = new Docker({
      host: config.swarmHost,
      port: config.swarmPort,
      protocol: 'https', // or http, depending on setup
    });
    this.registeredServices = new Map(); // swarm service id -> maxine service name

    this.watchServices();
  }

  async watchServices() {
    // Poll for services every 30 seconds
    setInterval(async () => {
      try {
        await this.updateServices();
      } catch (err) {
        consoleError('Error updating Swarm services:', err);
      }
    }, 30000);
  }

  async updateServices() {
    const services = await this.docker.listServices();
    for (const service of services) {
      await this.registerSwarmService(service);
    }
  }

  async registerSwarmService(swarmService) {
    const serviceId = swarmService.ID;
    const maxineServiceName = `swarm-${swarmService.Spec.Name}`;
    this.registeredServices.set(serviceId, maxineServiceName);

    // Get tasks
    const tasks = await this.docker.listTasks({ filters: { service: [swarmService.Spec.Name] } });
    for (const task of tasks) {
      await this.registerTask(task, maxineServiceName);
    }
  }

  async registerTask(task, maxineServiceName) {
    if (task.Status.State !== 'running') return;

    // Get network attachments
    const networks = task.NetworksAttachments || [];
    for (const network of networks) {
      const addresses = network.Addresses || [];
      for (const addr of addresses) {
        const [ip, subnet] = addr.split('/');
        if (ip) {
          const port = 80; // Default, or get from service spec
          const nodeName = `${ip}:${port}`;
          const fullAddress = `http://${ip}:${port}`;

          registryService.registryService({
            serviceName: maxineServiceName,
            nodeName,
            address: fullAddress,
            timeOut: 30,
            weight: 1,
            metadata: {
              swarm: true,
              serviceId: task.ServiceID,
              taskId: task.ID,
              nodeId: task.NodeID,
            },
            aliases: [],
          });
        }
      }
    }
  }
}

const swarmService = new SwarmService();

module.exports = {
  swarmService,
};
