class MetricsService {
    constructor() {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageLatency: 0,
            latencies: [],
            latencySum: 0,
            serviceRequests: {},
            errors: {}
        };
    }

    recordRequest(serviceName, success, latency) {
        this.metrics.totalRequests++;
        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }
        this.metrics.latencies.push(latency);
        this.metrics.latencySum += latency;
        if (this.metrics.latencies.length > 1000) {
            this.metrics.latencySum -= this.metrics.latencies.shift(); // keep last 1000
        }
        this.metrics.averageLatency = this.metrics.latencySum / this.metrics.latencies.length;

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
        const sortedLatencies = [...this.metrics.latencies].sort((a, b) => a - b);
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
}

const metricsService = new MetricsService();

module.exports = {
    metricsService
};