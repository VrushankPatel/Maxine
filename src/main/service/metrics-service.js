class MetricsService {
    constructor() {
        // Initialize Prometheus metrics if enabled
        if (require('../config/config').prometheusEnabled) {
            const promClient = require('prom-client');
            this.register = new promClient.Registry();

            // Add default metrics
            promClient.collectDefaultMetrics({ register: this.register });

            // Custom metrics
            this.requestTotal = new promClient.Counter({
                name: 'maxine_requests_total',
                help: 'Total number of requests',
                labelNames: ['service', 'method', 'status'],
                registers: [this.register]
            });

            this.requestDuration = new promClient.Histogram({
                name: 'maxine_request_duration_seconds',
                help: 'Request duration in seconds',
                labelNames: ['service', 'method'],
                buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
                registers: [this.register]
            });

            this.activeConnections = new promClient.Gauge({
                name: 'maxine_active_connections',
                help: 'Number of active connections',
                labelNames: ['service'],
                registers: [this.register]
            });

            this.serviceInstances = new promClient.Gauge({
                name: 'maxine_service_instances',
                help: 'Number of instances per service',
                labelNames: ['service', 'status'],
                registers: [this.register]
            });
        }

        // Legacy metrics for backward compatibility
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageLatency: 0,
            latencies: new Array(1000),
            latencySum: 0,
            serviceRequests: {},
            errors: {}
        };
        this.latencyCount = 0;
        this.latencyIndex = 0;
    }

    recordRequest(serviceName, success, latency, method = 'GET') {
        // Update Prometheus metrics
        if (this.requestTotal) {
            this.requestTotal.inc({
                service: serviceName,
                method: method,
                status: success ? 'success' : 'error'
            });
        }
        if (this.requestDuration) {
            this.requestDuration.observe({
                service: serviceName,
                method: method
            }, latency / 1000);
        }

        // Legacy metrics for backward compatibility
        this.metrics.totalRequests++;
        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }
        // Update circular buffer for latencies
        if (this.latencyCount < 1000) {
            this.latencyCount++;
        } else {
            this.metrics.latencySum -= this.metrics.latencies[this.latencyIndex];
        }
        this.metrics.latencies[this.latencyIndex] = latency;
        this.metrics.latencySum += latency;
        this.latencyIndex = (this.latencyIndex + 1) % 1000;
        this.metrics.averageLatency = this.metrics.latencySum / this.latencyCount;

        if (!this.metrics.serviceRequests[serviceName]) {
            this.metrics.serviceRequests[serviceName] = 0;
        }
        this.metrics.serviceRequests[serviceName]++;
    }

    recordError(errorType) {
        if (!this.metrics.errors[errorType]) {
            this.metrics.errors[errorType] = 0;
        }
        this.metrics.errors[errorType]++;
    }

    getMetrics() {
        const latenciesToSort = this.metrics.latencies.slice(0, this.latencyCount);
        const sortedLatencies = latenciesToSort.sort((a, b) => a - b);
        const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
        const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;
        return {
            ...this.metrics,
            p95Latency: p95,
            p99Latency: p99,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }

    async getPrometheusMetrics() {
        if (this.register) {
            return await this.register.metrics();
        }
        return '';
    }

    updateActiveConnections(serviceName, count) {
        if (this.activeConnections) {
            this.activeConnections.set({ service: serviceName }, count);
        }
    }

    updateServiceInstances(serviceName, healthyCount, totalCount) {
        if (this.serviceInstances) {
            this.serviceInstances.set({ service: serviceName, status: 'healthy' }, healthyCount);
            this.serviceInstances.set({ service: serviceName, status: 'total' }, totalCount);
        }
    }
}

const metricsService = new MetricsService();

module.exports = {
    metricsService
};