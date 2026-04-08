const axios = require('axios');
const { constants } = require('../util/constants/constants');
const { registryService } = require('./registry-service');
const { clusterLeaderService } = require('./cluster-leader-service');
const { auditService } = require('./audit-service');
const { alertService } = require('./alert-service');
const { observabilityService } = require('./observability-service');

class UpstreamHealthService {
    started = false;
    intervalRef;
    failureCounts = new Map();

    buildFailureKey = (serviceName, parentNode) => `${serviceName}:${parentNode}`

    resetFailure = (serviceName, parentNode) => {
        this.failureCounts.delete(this.buildFailureKey(serviceName, parentNode));
    }

    incrementFailure = (serviceName, parentNode) => {
        const key = this.buildFailureKey(serviceName, parentNode);
        const nextValue = (this.failureCounts.get(key) || 0) + 1;
        this.failureCounts.set(key, nextValue);
        return nextValue;
    }

    buildHealthUrl = (node) => {
        if (!node.healthCheckPath && !constants.ACTIVE_HEALTH_CHECK_PATH) {
            return node.address;
        }

        const base = node.address.endsWith('/') ? node.address : `${node.address}/`;
        const probePath = (node.healthCheckPath || constants.ACTIVE_HEALTH_CHECK_PATH).replace(/^\//, '');
        return new URL(probePath, base).toString();
    }

    getDistinctNodes = async () => {
        const registrySnapshot = await registryService.getRegisteredServers();
        const distinctNodes = [];

        Object.entries(registrySnapshot).forEach(([serviceName, serviceState]) => {
            const parentNodes = new Map();
            Object.values(serviceState.nodes || {}).forEach((node) => {
                const parentNode = node.parentNode || node.nodeName;
                if (!parentNodes.has(parentNode)) {
                    parentNodes.set(parentNode, {
                        ...node,
                        serviceName,
                        parentNode
                    });
                }
            });

            distinctNodes.push(...parentNodes.values());
        });

        return distinctNodes;
    }

    probeNode = async (node) => {
        const healthUrl = this.buildHealthUrl(node);

        try {
            const response = await axios.get(healthUrl, {
                timeout: constants.ACTIVE_HEALTH_CHECK_TIMEOUT_MS,
                maxRedirects: 0,
                validateStatus: () => true
            });

            const healthy = response.status >= 200 && response.status < 400;
            observabilityService.recordHealthCheck({ failed: !healthy });

            if (healthy) {
                this.resetFailure(node.serviceName, node.parentNode);
                return;
            }

            const failureCount = this.incrementFailure(node.serviceName, node.parentNode);
            if (failureCount < constants.ACTIVE_HEALTH_CHECK_FAILURE_THRESHOLD) {
                return;
            }

            await registryService.evictParentNode(node.serviceName, node.parentNode);
            this.resetFailure(node.serviceName, node.parentNode);
            observabilityService.recordHealthCheck({ failed: true, evicted: true });
            auditService.record('upstream.evicted', {
                outcome: 'REMOVED',
                serviceName: node.serviceName,
                parentNode: node.parentNode,
                address: node.address,
                healthUrl,
                statusCode: response.status
            });
            await alertService.emit({
                severity: 'critical',
                type: 'upstream.evicted',
                message: `Evicted upstream ${node.parentNode} from ${node.serviceName} after repeated active health check failures.`,
                details: {
                    serviceName: node.serviceName,
                    parentNode: node.parentNode,
                    address: node.address,
                    healthUrl,
                    statusCode: response.status
                }
            });
        } catch (err) {
            const failureCount = this.incrementFailure(node.serviceName, node.parentNode);
            observabilityService.recordHealthCheck({ failed: true });

            if (failureCount < constants.ACTIVE_HEALTH_CHECK_FAILURE_THRESHOLD) {
                return;
            }

            await registryService.evictParentNode(node.serviceName, node.parentNode);
            this.resetFailure(node.serviceName, node.parentNode);
            observabilityService.recordHealthCheck({ failed: true, evicted: true });
            auditService.record('upstream.evicted', {
                outcome: 'REMOVED',
                serviceName: node.serviceName,
                parentNode: node.parentNode,
                address: node.address,
                healthUrl,
                message: err.message
            });
            await alertService.emit({
                severity: 'critical',
                type: 'upstream.evicted',
                message: `Evicted upstream ${node.parentNode} from ${node.serviceName} after repeated active health check failures.`,
                details: {
                    serviceName: node.serviceName,
                    parentNode: node.parentNode,
                    address: node.address,
                    healthUrl,
                    message: err.message
                }
            });
        }
    }

    runOnce = async () => {
        if (!constants.ACTIVE_HEALTH_CHECKS_ENABLED) {
            return;
        }

        if (constants.REGISTRY_STATE_MODE === 'redis' && constants.LEADER_ELECTION_ENABLED && !clusterLeaderService.isLeader()) {
            return;
        }

        const nodes = await this.getDistinctNodes();
        for (const node of nodes) {
            await this.probeNode(node);
        }
    }

    start = async () => {
        if (this.started || !constants.ACTIVE_HEALTH_CHECKS_ENABLED) {
            return;
        }

        this.started = true;
        await this.runOnce();
        this.intervalRef = setInterval(() => {
            this.runOnce().catch((err) => {
                auditService.record('upstream.health_check_error', {
                    outcome: 'ERROR',
                    message: err.message
                });
            });
        }, constants.ACTIVE_HEALTH_CHECK_INTERVAL_MS);
    }

    stop = async () => {
        if (this.intervalRef) {
            clearInterval(this.intervalRef);
            this.intervalRef = undefined;
        }
        this.started = false;
        this.failureCounts.clear();
    }

    getStatus = () => ({
        started: this.started,
        unhealthyNodes: this.failureCounts.size,
        failureCounts: Object.fromEntries(this.failureCounts.entries())
    })
}

const upstreamHealthService = new UpstreamHealthService();

module.exports = {
    upstreamHealthService
};
