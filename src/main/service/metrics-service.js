class MetricsService {
    constructor() {
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

    recordRequest(serviceName, success, latency) {
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
}

const metricsService = new MetricsService();

module.exports = {
    metricsService
};