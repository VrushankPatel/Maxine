const axios = require('axios');
const { serviceRegistry } = require('../entity/service-registry');
const { registryService } = require('./registry-service');
const config = require('../config/config');
const { consoleError } = require('../util/logging/logging-util');

class NomadService {
  constructor() {
    if (!config.nomadEnabled) return;

    this.baseUrl = `http://${config.nomadHost}:${config.nomadPort}/v1`;
    this.registeredServices = new Map(); // nomad job id -> maxine service name

    this.watchServices();
  }

  async watchServices() {
    // Poll for services every 30 seconds
    setInterval(async () => {
      try {
        await this.updateServices();
      } catch (err) {
        consoleError('Error updating Nomad services:', err);
      }
    }, 30000);
  }

  async updateServices() {
    const jobs = await axios.get(`${this.baseUrl}/jobs`);
    for (const job of jobs.data) {
      if (job.Status === 'running') {
        await this.registerNomadService(job);
      }
    }
  }

  async registerNomadService(job) {
    const jobId = job.ID;
    const maxineServiceName = `nomad-${job.Name}`;
    this.registeredServices.set(jobId, maxineServiceName);

    // Get allocations
    const allocations = await axios.get(`${this.baseUrl}/job/${jobId}/allocations`);
    for (const alloc of allocations.data) {
      if (alloc.ClientStatus === 'running') {
        await this.registerAllocation(alloc, maxineServiceName, jobId);
      }
    }
  }

  async registerAllocation(alloc, maxineServiceName, jobId) {
    // Get task states
    const taskStates = alloc.TaskStates;
    for (const [taskName, state] of Object.entries(taskStates)) {
      if (state.State === 'running') {
        // Get network info
        const networks = state.TaskHandle?.DriverNetwork?.PortMap || {};
        const ports = Object.keys(networks);
        if (ports.length > 0) {
          const port = networks[ports[0]]; // Assume first port
          const ip = alloc.NodeName; // Or get IP from node
          // Actually, Nomad allocations have network info
          const network = alloc.Resources.Networks?.[0];
          if (network) {
            const ip = network.IP;
            const port =
              network.DynamicPorts?.[0]?.Value || network.ReservedPorts?.[0]?.Value || 80;
            const nodeName = `${ip}:${port}`;
            const fullAddress = `http://${ip}:${port}`;

            registryService.registryService({
              serviceName: maxineServiceName,
              nodeName,
              address: fullAddress,
              timeOut: 30,
              weight: 1,
              metadata: {
                nomad: true,
                jobId,
                allocId: alloc.ID,
                taskName,
              },
              aliases: [],
            });
          }
        }
      }
    }
  }
}

const nomadService = new NomadService();

module.exports = {
  nomadService,
};
