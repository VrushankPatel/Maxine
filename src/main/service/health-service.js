const { serviceRegistry } = require('../entity/service-registry');
const axios = require('axios');

class HealthService {
    constructor() {
        this.intervalId = null;
        this.startBackgroundChecks();
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
        const services = Object.keys(serviceRegistry.registry);
        for (const serviceName of services) {
            const nodes = serviceRegistry.getNodes(serviceName);
            if (!nodes) continue;

            const healthPromises = Object.entries(nodes).map(async ([nodeName, node]) => {
                try {
                    const response = await axios.get(node.address, { timeout: 5000 });
                    // Update registry with healthy status
                    const nodeObj = serviceRegistry.registry[serviceName].nodes[nodeName];
                    if (nodeObj) {
                        nodeObj.healthy = true;
                        nodeObj.failureCount = 0;
                        nodeObj.lastFailureTime = null;
                        serviceRegistry.addToHealthyNodes(serviceName, nodeName);
                    }
                } catch (error) {
                    // Update registry with unhealthy status
                    const nodeObj = serviceRegistry.registry[serviceName].nodes[nodeName];
                    if (nodeObj) {
                        nodeObj.healthy = false;
                        nodeObj.failureCount = (nodeObj.failureCount || 0) + 1;
                        nodeObj.lastFailureTime = Date.now();
                        serviceRegistry.removeFromHealthyNodes(serviceName, nodeName);
                    }
                }
            });
            await Promise.all(healthPromises);
        }
    }
}

const healthService = new HealthService();

module.exports = {
    healthService
};