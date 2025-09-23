const { serviceRegistry } = require('../entity/service-registry');
const { discoveryService } = require('../service/discovery-service');
const config = require('../config/config');
const axios = require('axios');
const net = require('net');
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

    async checkTcpHealth(host, port) {
        return new Promise((resolve) => {
            const socket = net.createConnection({ host, port, timeout: 3000 });
            socket.on('connect', () => {
                socket.end();
                resolve(true);
            });
            socket.on('error', () => resolve(false));
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
        });
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
                    const healthType = node.metadata.healthType || 'http';
                    let isHealthy = false;
                     if (healthType === 'tcp') {
                         // TCP health check
                         const url = new URL(node.address);
                         const host = url.hostname;
                         const port = node.metadata.healthEndpoint ? parseInt(node.metadata.healthEndpoint) : url.port || 80;
                         isHealthy = await this.checkTcpHealth(host, port);
                    } else {
                        // HTTP health check
                        const healthUrl = node.address + (node.metadata.healthEndpoint || '/health');
                        const response = await axios.get(healthUrl, { timeout: 3000 });
                        isHealthy = response.status >= 200 && response.status < 300;
                    }
                    if (isHealthy) {
                        // Update registry with healthy status
                        const service = serviceRegistry.registry.get(serviceName);
                        const nodeObj = service ? service.nodes[nodeName] : null;
                         if (nodeObj) {
                               nodeObj.healthy = true;
                               nodeObj.failureCount = 0;
                               nodeObj.lastFailureTime = null;
                                serviceRegistry.addToHealthyNodes(serviceName, nodeName);
                                serviceRegistry.addToHashRegistry(serviceName, nodeName);
                                serviceRegistry.addHealthHistory(serviceName, nodeName, true);
                                serviceRegistry.debounceSave();
                                discoveryService.invalidateServiceCache(serviceName);
                           }
                    } else {
                        throw new Error('Health check failed');
                    }
                } catch (error) {
                    unhealthyInstances++;
                    // Update registry with unhealthy status
                    const service = serviceRegistry.registry.get(serviceName);
                    const nodeObj = service ? service.nodes[nodeName] : null;
                     if (nodeObj) {
                           nodeObj.failureCount = (nodeObj.failureCount || 0) + 1;
                           nodeObj.lastFailureTime = Date.now();
                           if (nodeObj.failureCount >= config.failureThreshold) {
                               nodeObj.healthy = false;
                                serviceRegistry.removeFromHealthyNodes(serviceName, nodeName);
                                serviceRegistry.removeFromHashRegistry(serviceName, nodeName);
                                serviceRegistry.addHealthHistory(serviceName, nodeName, false);
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