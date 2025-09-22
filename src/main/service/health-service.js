const { serviceRegistry } = require('../entity/service-registry');
const { discoveryService } = require('../service/discovery-service');
const config = require('../config/config');
const axios = require('axios');
const pLimit = require('p-limit');

class HealthService {
    constructor() {
        this.intervalId = null;
        this.selfPreservationMode = false;
        this.renewalPercentThreshold = 0.85; // 85%
        this.expectedNumberOfRenewsPerMin = 1; // Assuming 1 renewal per minute per service
        this.numberOfRenewsPerMinThreshold = 0.85;
        if (config.healthCheckEnabled) {
            this.startBackgroundChecks();
        }
    }

    startBackgroundChecks() {
        // Run health checks at configurable interval for better performance
        this.intervalId = setInterval(() => {
            this.performHealthChecks();
        }, config.healthCheckInterval);
    }

    stopBackgroundChecks() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async performHealthChecks() {
        const limit = pLimit(config.healthCheckConcurrency); // Configurable concurrency for health checks
        const services = Object.keys(serviceRegistry.registry);
        let totalInstances = 0;
        let unhealthyInstances = 0;
        const allHealthPromises = [];

        for (const serviceName of services) {
            const nodes = serviceRegistry.getNodes(serviceName);
            if (!nodes) continue;

            const healthPromises = Object.entries(nodes).map(([nodeName, node]) => limit(async () => {
                totalInstances++;
                try {
                    const healthUrl = node.address + (node.metadata.healthEndpoint || '');
                    const response = await axios.get(healthUrl, { timeout: 3000 });
                    // Update registry with healthy status
                    const nodeObj = serviceRegistry.registry[serviceName].nodes[nodeName];
                     if (nodeObj) {
                          nodeObj.healthy = true;
                          nodeObj.failureCount = 0;
                          nodeObj.lastFailureTime = null;
                          serviceRegistry.addToHealthyNodes(serviceName, nodeName);
                          serviceRegistry.addToHashRegistry(serviceName, nodeName);
                          serviceRegistry.debounceSave();
                          discoveryService.invalidateServiceCache(serviceName);
                      }
                } catch (error) {
                    unhealthyInstances++;
                    // Update registry with unhealthy status
                    const nodeObj = serviceRegistry.registry[serviceName].nodes[nodeName];
                     if (nodeObj) {
                          nodeObj.failureCount = (nodeObj.failureCount || 0) + 1;
                          nodeObj.lastFailureTime = Date.now();
                          if (nodeObj.failureCount >= config.failureThreshold) {
                              nodeObj.healthy = false;
                              serviceRegistry.removeFromHealthyNodes(serviceName, nodeName);
                              serviceRegistry.removeFromHashRegistry(serviceName, nodeName);
                              serviceRegistry.debounceSave();
                              discoveryService.invalidateServiceCache(serviceName);
                          }
                      }
                 }
            } ) );
            allHealthPromises.push(...healthPromises);
        }

        await Promise.all(allHealthPromises);

        // Check for self-preservation mode
        const renewalPercent = totalInstances > 0 ? (totalInstances - unhealthyInstances) / totalInstances : 1;
        if (renewalPercent < this.renewalPercentThreshold) {
            if (!this.selfPreservationMode) {
                console.log('Entering self-preservation mode');
                this.selfPreservationMode = true;
            }
        } else {
            if (this.selfPreservationMode) {
                console.log('Exiting self-preservation mode');
                this.selfPreservationMode = false;
            }
        }
    }
}

const healthService = new HealthService();

module.exports = {
    healthService
};