const { constants } = require('../util/constants/constants');

const counterKeys = [
    'requests_total',
    'auth_failures_total',
    'auth_success_total',
    'registrations_total',
    'discoveries_total',
    'proxied_requests_total',
    'health_checks_total',
    'health_check_failures_total',
    'health_evictions_total',
    'leader_elections_total',
    'leader_changes_total',
    'alerts_total'
];

class ObservabilityService {
    counters = Object.fromEntries(counterKeys.map((key) => [key, 0]));
    recentTraces = [];

    incrementCounter = (counterName, amount = 1) => {
        this.counters[counterName] = (this.counters[counterName] || 0) + amount;
    }

    recordRequest = (req, res, durationMs) => {
        this.incrementCounter('requests_total');

        const trace = {
            traceId: req.traceId,
            traceparent: req.traceparent,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs,
            timestamp: new Date().toISOString()
        };

        if (this.recentTraces.length >= constants.RECENT_TRACE_LIMIT) {
            this.recentTraces.shift();
        }

        this.recentTraces.push(trace);
        return trace;
    }

    getRecentTraces = () => this.recentTraces.slice().reverse();

    recordAuthFailure = () => this.incrementCounter('auth_failures_total')

    recordAuthSuccess = () => this.incrementCounter('auth_success_total')

    recordRegistration = () => this.incrementCounter('registrations_total')

    recordDiscovery = () => this.incrementCounter('discoveries_total')

    recordProxyRequest = () => this.incrementCounter('proxied_requests_total')

    recordHealthCheck = ({ failed = false, evicted = false } = {}) => {
        this.incrementCounter('health_checks_total');
        if (failed) {
            this.incrementCounter('health_check_failures_total');
        }
        if (evicted) {
            this.incrementCounter('health_evictions_total');
        }
    }

    recordLeaderElection = ({ changed = false } = {}) => {
        this.incrementCounter('leader_elections_total');
        if (changed) {
            this.incrementCounter('leader_changes_total');
        }
    }

    recordAlert = () => this.incrementCounter('alerts_total')

    getCounter = (counterName) => this.counters[counterName] || 0

    getMetricsSnapshot = ({ registrySnapshot = {}, clusterStatus = {}, upstreamStatus = {} } = {}) => {
        const serviceNames = Object.keys(registrySnapshot);
        const parentNodes = new Set();
        let virtualNodeCount = 0;

        serviceNames.forEach((serviceName) => {
            Object.values((registrySnapshot[serviceName] || {}).nodes || {}).forEach((node) => {
                virtualNodeCount += 1;
                parentNodes.add(`${serviceName}:${node.parentNode || node.nodeName}`);
            });
        });

        return {
            counters: { ...this.counters },
            gauges: {
                registered_services: serviceNames.length,
                registered_parent_nodes: parentNodes.size,
                registered_virtual_nodes: virtualNodeCount,
                cluster_is_leader: clusterStatus.isLeader ? 1 : 0,
                cluster_has_leader: clusterStatus.hasLeader ? 1 : 0,
                unhealthy_upstreams: upstreamStatus.unhealthyNodes || 0
            }
        };
    }

    renderPrometheus = ({ registrySnapshot = {}, clusterStatus = {}, upstreamStatus = {} } = {}) => {
        const snapshot = this.getMetricsSnapshot({
            registrySnapshot,
            clusterStatus,
            upstreamStatus
        });

        const lines = [
            '# HELP maxine_requests_total Total HTTP requests handled by Maxine.',
            '# TYPE maxine_requests_total counter',
            `maxine_requests_total ${snapshot.counters.requests_total}`,
            '# HELP maxine_auth_failures_total Total failed authentication attempts.',
            '# TYPE maxine_auth_failures_total counter',
            `maxine_auth_failures_total ${snapshot.counters.auth_failures_total}`,
            '# HELP maxine_auth_success_total Total successful sign-in events.',
            '# TYPE maxine_auth_success_total counter',
            `maxine_auth_success_total ${snapshot.counters.auth_success_total}`,
            '# HELP maxine_registrations_total Total successful service registrations.',
            '# TYPE maxine_registrations_total counter',
            `maxine_registrations_total ${snapshot.counters.registrations_total}`,
            '# HELP maxine_discoveries_total Total successful discovery lookups.',
            '# TYPE maxine_discoveries_total counter',
            `maxine_discoveries_total ${snapshot.counters.discoveries_total}`,
            '# HELP maxine_proxied_requests_total Total proxied discovery requests.',
            '# TYPE maxine_proxied_requests_total counter',
            `maxine_proxied_requests_total ${snapshot.counters.proxied_requests_total}`,
            '# HELP maxine_health_checks_total Total upstream health checks executed.',
            '# TYPE maxine_health_checks_total counter',
            `maxine_health_checks_total ${snapshot.counters.health_checks_total}`,
            '# HELP maxine_health_check_failures_total Total upstream health check failures.',
            '# TYPE maxine_health_check_failures_total counter',
            `maxine_health_check_failures_total ${snapshot.counters.health_check_failures_total}`,
            '# HELP maxine_health_evictions_total Total nodes evicted after active health failures.',
            '# TYPE maxine_health_evictions_total counter',
            `maxine_health_evictions_total ${snapshot.counters.health_evictions_total}`,
            '# HELP maxine_alerts_total Total alerts emitted.',
            '# TYPE maxine_alerts_total counter',
            `maxine_alerts_total ${snapshot.counters.alerts_total}`,
            '# HELP maxine_registered_services Current number of registered services.',
            '# TYPE maxine_registered_services gauge',
            `maxine_registered_services ${snapshot.gauges.registered_services}`,
            '# HELP maxine_registered_parent_nodes Current number of parent nodes.',
            '# TYPE maxine_registered_parent_nodes gauge',
            `maxine_registered_parent_nodes ${snapshot.gauges.registered_parent_nodes}`,
            '# HELP maxine_registered_virtual_nodes Current number of weighted virtual nodes.',
            '# TYPE maxine_registered_virtual_nodes gauge',
            `maxine_registered_virtual_nodes ${snapshot.gauges.registered_virtual_nodes}`,
            '# HELP maxine_cluster_is_leader Whether this instance currently holds the leadership lease.',
            '# TYPE maxine_cluster_is_leader gauge',
            `maxine_cluster_is_leader ${snapshot.gauges.cluster_is_leader}`,
            '# HELP maxine_cluster_has_leader Whether a cluster leader is currently known.',
            '# TYPE maxine_cluster_has_leader gauge',
            `maxine_cluster_has_leader ${snapshot.gauges.cluster_has_leader}`,
            '# HELP maxine_unhealthy_upstreams Current number of upstreams with recorded health failures.',
            '# TYPE maxine_unhealthy_upstreams gauge',
            `maxine_unhealthy_upstreams ${snapshot.gauges.unhealthy_upstreams}`
        ];

        return `${lines.join('\n')}\n`;
    }
}

const observabilityService = new ObservabilityService();

module.exports = {
    observabilityService
};
