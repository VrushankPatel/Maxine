const { serviceRegistry } = require('../entity/service-registry');
const { discoveryService } = require('../service/discovery-service');
const config = require('../config/config');
const http = require('http');
const https = require('https');
const net = require('net');
const { default: pLimit } = require('p-limit');
const { consoleLog, consoleError } = require('../util/logging/logging-util');

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

  sendAlert(message) {
    if (config.alertWebhook) {
      const axios = require('axios');
      axios
        .post(
          config.alertWebhook,
          { message, timestamp: new Date().toISOString() },
          { timeout: 5000 }
        )
        .catch((err) => {
          consoleError('Alert webhook failed:', err.message);
        });
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

  async checkHttpHealth(baseUrl, endpoint, method, headers = {}) {
    return new Promise((resolve) => {
      const url = new URL(endpoint, baseUrl);
      const client = url.protocol === 'https:' ? https : http;
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: headers,
        timeout: 3000,
      };
      const req = client.request(options, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 300);
        req.destroy();
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }

  async checkScriptHealth(scriptPath, timeout = 5000) {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const script = spawn('sh', ['-c', scriptPath], { timeout });
      let output = '';
      script.stdout.on('data', (data) => {
        output += data.toString();
      });
      script.stderr.on('data', (data) => {
        output += data.toString();
      });
      script.on('close', (code) => {
        resolve(code === 0 && output.trim() === 'OK');
      });
      script.on('error', () => resolve(false));
    });
  }

  async checkGrpcHealth(host, port, service = '') {
    return new Promise((resolve) => {
      try {
        const grpc = require('@grpc/grpc-js');
        const protoLoader = require('@grpc/proto-loader');
        const packageDefinition = protoLoader.loadSync(
          __dirname + '/../../api-specs/health.proto',
          {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
          }
        );
        const healthProto = grpc.loadPackageDefinition(packageDefinition).grpc.health.v1;
        const client = new healthProto.Health(`${host}:${port}`, grpc.credentials.createInsecure());
        client.check({ service }, (err, response) => {
          client.close();
          if (err) {
            resolve(false);
          } else {
            resolve(response.status === 'SERVING');
          }
        });
        setTimeout(() => {
          client.close();
          resolve(false);
        }, 3000);
      } catch (err) {
        resolve(false);
      }
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

      const healthPromises = Object.entries(nodes).map(([nodeName, node]) =>
        limit(async () => {
          totalInstances++;
          try {
            const healthType = node.metadata.healthType || 'http';
            let isHealthy = false;
            if (healthType === 'tcp') {
              // TCP health check
              const url = new URL(node.address);
              const host = url.hostname;
              const port = node.metadata.healthEndpoint
                ? parseInt(node.metadata.healthEndpoint)
                : url.port || 80;
              isHealthy = await this.checkTcpHealth(host, port);
            } else if (healthType === 'script') {
              // Script health check
              isHealthy = await this.checkScriptHealth(node.metadata.healthScript);
            } else if (healthType === 'grpc') {
              // gRPC health check
              const url = new URL(node.address);
              const host = url.hostname;
              const port = node.metadata.healthEndpoint
                ? parseInt(node.metadata.healthEndpoint)
                : url.port || 80;
              const service = node.metadata.healthService || '';
              isHealthy = await this.checkGrpcHealth(host, port, service);
            } else {
              // HTTP health check
              isHealthy = await this.checkHttpHealth(
                node.address,
                node.metadata.healthEndpoint || '/health',
                node.metadata.healthMethod || 'GET',
                node.metadata.healthHeaders || {}
              );
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
                // Update failure rate for health score calculation
                const key = `${serviceName}:${nodeName}`;
                serviceRegistry.failureRates.set(key, 0);
                serviceRegistry.recordCircuitSuccess(serviceName, nodeName);
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
              // Update failure rate for health score calculation
              const key = `${serviceName}:${nodeName}`;
              const currentFailures = serviceRegistry.failureRates.get(key) || 0;
              serviceRegistry.failureRates.set(key, currentFailures + 1);
              serviceRegistry.recordCircuitFailure(serviceName, nodeName);
              if (nodeObj.failureCount >= config.failureThreshold && !this.selfPreservationMode) {
                nodeObj.healthy = false;
                serviceRegistry.removeFromHealthyNodes(serviceName, nodeName);
                serviceRegistry.removeFromHashRegistry(serviceName, nodeName);
                serviceRegistry.addHealthHistory(serviceName, nodeName, false);
                serviceRegistry.debounceSave();
                discoveryService.invalidateServiceCache(serviceName);
                this.sendAlert(`Service ${serviceName} node ${nodeName} marked as unhealthy`);
              }
            }
          }
        })
      );
      allHealthPromises.push(...healthPromises);
    }

    await Promise.all(allHealthPromises);

    // Check for self-preservation mode
    const renewalPercent =
      totalInstances > 0 ? (totalInstances - unhealthyInstances) / totalInstances : 1;
    if (renewalPercent < this.renewalPercentThreshold) {
      if (!this.selfPreservationMode) {
        consoleLog('Entering self-preservation mode');
        this.selfPreservationMode = true;
      }
    } else {
      if (this.selfPreservationMode) {
        consoleLog('Exiting self-preservation mode');
        this.selfPreservationMode = false;
      }
    }
  }
}

const healthService = new HealthService();

module.exports = {
  healthService,
};
