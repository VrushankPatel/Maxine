const { serviceRegistry } = require('../entity/service-registry');
const { discoveryService } = require('../service/discovery-service');
const config = require('../config/config');
const axios = require('axios');
const pLimit = require('p-limit');

class HealthService {
    constructor() {
        this.intervalId = null;
        if (config.healthCheckEnabled) {
            this.startBackgroundChecks();
        }
    }

    startBackgroundChecks() {
        // Run health checks every 30 seconds
        this.intervalId = setInterval(() => {
            this.performHealthChecks();
        }, 30000);
    }

    stopBackgroundChecks() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async performHealthChecks() {
        const limit = pLimit(1000); // Increased concurrency for faster health checks
        const services = Object.keys(serviceRegistry.registry);
        const allHealthPromises = [];

        for (const serviceName of services) {
            const nodes = serviceRegistry.getNodes(serviceName);
            if (!nodes) continue;

            const healthPromises = Object.entries(nodes).map(([nodeName, node]) => limit(async () => {
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
    }
}

const healthService = new HealthService();

module.exports = {
    healthService
};