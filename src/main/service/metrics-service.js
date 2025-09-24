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

            this.websocketConnections = new promClient.Gauge({
                name: 'maxine_websocket_connections',
                help: 'Number of active WebSocket connections',
                registers: [this.register]
            });

            this.eventRate = new promClient.Counter({
                name: 'maxine_events_total',
                help: 'Total number of events emitted',
                labelNames: ['event_type'],
                registers: [this.register]
            });

            this.circuitBreakerState = new promClient.Gauge({
                name: 'maxine_circuit_breaker_state',
                help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
                labelNames: ['service', 'node'],
                registers: [this.register]
            });

            this.serviceHealthScore = new promClient.Gauge({
                name: 'maxine_service_health_score',
                help: 'Health score of service instances (0-100)',
                labelNames: ['service', 'node'],
                registers: [this.register]
            });

            // Enhanced error metrics
            this.errorTotal = new promClient.Counter({
                name: 'maxine_errors_total',
                help: 'Total number of errors',
                labelNames: ['service', 'error_type'],
                registers: [this.register]
            });

            this.errorRate = new promClient.Gauge({
                name: 'maxine_error_rate',
                help: 'Current error rate (errors per second)',
                labelNames: ['service'],
                registers: [this.register]
            });

            // Enhanced latency histogram with more detailed buckets
            this.detailedLatencyHistogram = new promClient.Histogram({
                name: 'maxine_detailed_request_duration_seconds',
                help: 'Detailed request duration in seconds with finer buckets',
                labelNames: ['service', 'method', 'status'],
                buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25],
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
        if (this.detailedLatencyHistogram) {
            this.detailedLatencyHistogram.observe({
                service: serviceName,
                method: method,
                status: success ? 'success' : 'error'
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

    recordError(errorType, serviceName = 'unknown') {
        // Update Prometheus metrics
        if (this.errorTotal) {
            this.errorTotal.inc({
                service: serviceName,
                error_type: errorType
            });
        }

        // Legacy metrics for backward compatibility
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

    updateWebsocketConnections(count) {
        if (this.websocketConnections) {
            this.websocketConnections.set(count);
        }
    }

    recordEvent(eventType) {
        if (this.eventRate) {
            this.eventRate.inc({ event_type: eventType });
        }
    }

    updateCircuitBreakerState(serviceName, nodeId, state) {
        if (this.circuitBreakerState) {
            const stateNum = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
            this.circuitBreakerState.set({ service: serviceName, node: nodeId }, stateNum);
        }
    }

    updateHealthScore(serviceName, nodeId, score) {
        if (this.serviceHealthScore) {
            this.serviceHealthScore.set({ service: serviceName, node: nodeId }, score);
        }
    }
}

const metricsService = new MetricsService();

module.exports = {
    metricsService
};