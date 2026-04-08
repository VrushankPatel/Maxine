const { constants } = require('../util/constants/constants');
const { registryStateService } = require('./registry-state-service');
const { auditService } = require('./audit-service');
const { alertService } = require('./alert-service');
const { observabilityService } = require('./observability-service');

const RENEW_LEADERSHIP_SCRIPT = [
    'local value = redis.call("get", KEYS[1])',
    'if not value then return 0 end',
    'local payload = cjson.decode(value)',
    'if payload.token ~= ARGV[1] then return 0 end',
    'redis.call("pexpire", KEYS[1], ARGV[2])',
    'return 1'
].join('\n');

const RELEASE_LEADERSHIP_SCRIPT = [
    'local value = redis.call("get", KEYS[1])',
    'if not value then return 0 end',
    'local payload = cjson.decode(value)',
    'if payload.token ~= ARGV[1] then return 0 end',
    'return redis.call("del", KEYS[1])'
].join('\n');

class ClusterLeaderService {
    started = false;
    intervalRef;
    leaderState = {
        enabled: false,
        instanceId: constants.CLUSTER_INSTANCE_ID,
        isLeader: true,
        hasLeader: true,
        fencingToken: 0,
        leaderInstanceId: constants.CLUSTER_INSTANCE_ID,
        observedAt: new Date().toISOString()
    };
    ownershipToken;

    shouldUseRedisLeadership = () => constants.REGISTRY_STATE_MODE === 'redis' && constants.LEADER_ELECTION_ENABLED

    getLeaderKey = () => `${constants.REGISTRY_REDIS_KEY_PREFIX}:cluster:leader`

    getFenceKey = () => `${constants.REGISTRY_REDIS_KEY_PREFIX}:cluster:leader:fence`

    serializeLeadershipValue = (fencingToken) => JSON.stringify({
        instanceId: constants.CLUSTER_INSTANCE_ID,
        token: this.ownershipToken,
        fencingToken,
        acquiredAt: new Date().toISOString()
    })

    markLeadership = async ({ isLeader, fencingToken = 0, leaderInstanceId = null, changed = false, suppressAlert = false }) => {
        this.leaderState = {
            enabled: this.shouldUseRedisLeadership(),
            instanceId: constants.CLUSTER_INSTANCE_ID,
            isLeader,
            hasLeader: Boolean(leaderInstanceId),
            fencingToken,
            leaderInstanceId,
            observedAt: new Date().toISOString()
        };

        if (!changed) {
            return;
        }

        observabilityService.recordLeaderElection({ changed: true });
        auditService.record('cluster.leadership_changed', {
            outcome: isLeader ? 'ACQUIRED' : 'LOST',
            instanceId: constants.CLUSTER_INSTANCE_ID,
            leaderInstanceId,
            fencingToken
        });

        if (!isLeader && !suppressAlert) {
            await alertService.emit({
                severity: 'warning',
                type: 'cluster.leadership_lost',
                message: `Maxine instance ${constants.CLUSTER_INSTANCE_ID} lost leadership.`,
                details: {
                    leaderInstanceId,
                    fencingToken
                }
            });
        }
    }

    getLeaderSnapshot = async () => {
        if (!this.shouldUseRedisLeadership()) {
            return {
                instanceId: constants.CLUSTER_INSTANCE_ID,
                fencingToken: this.leaderState.fencingToken,
                acquiredAt: this.leaderState.observedAt
            };
        }

        const client = await registryStateService.ensureRedisClient();
        const rawValue = await client.get(this.getLeaderKey());
        return rawValue ? JSON.parse(rawValue) : null;
    }

    acquireLeadership = async () => {
        const client = await registryStateService.ensureRedisClient();
        this.ownershipToken = this.ownershipToken || `${constants.CLUSTER_INSTANCE_ID}-${Date.now()}`;
        const fencingToken = await client.incr(this.getFenceKey());
        const payload = this.serializeLeadershipValue(fencingToken);
        const acquired = await client.set(this.getLeaderKey(), payload, {
            NX: true,
            PX: constants.LEADER_ELECTION_LEASE_MS
        });

        if (acquired !== 'OK') {
            return false;
        }

        await this.markLeadership({
            isLeader: true,
            fencingToken,
            leaderInstanceId: constants.CLUSTER_INSTANCE_ID,
            changed: !this.leaderState.isLeader
        });
        return true;
    }

    renewLeadership = async () => {
        const client = await registryStateService.ensureRedisClient();
        const renewed = await client.eval(RENEW_LEADERSHIP_SCRIPT, {
            keys: [this.getLeaderKey()],
            arguments: [this.ownershipToken, String(constants.LEADER_ELECTION_LEASE_MS)]
        });

        if (renewed === 1) {
            await this.markLeadership({
                isLeader: true,
                fencingToken: this.leaderState.fencingToken,
                leaderInstanceId: constants.CLUSTER_INSTANCE_ID
            });
            return true;
        }

        return false;
    }

    observeLeader = async () => {
        const currentLeader = await this.getLeaderSnapshot();
        await this.markLeadership({
            isLeader: false,
            fencingToken: currentLeader ? currentLeader.fencingToken : 0,
            leaderInstanceId: currentLeader ? currentLeader.instanceId : null,
            changed: this.leaderState.isLeader && (!currentLeader || currentLeader.instanceId !== constants.CLUSTER_INSTANCE_ID)
        });
    }

    releaseLeadership = async () => {
        if (!this.shouldUseRedisLeadership() || !this.leaderState.isLeader || !this.ownershipToken) {
            return;
        }

        const client = await registryStateService.ensureRedisClient();
        await client.eval(RELEASE_LEADERSHIP_SCRIPT, {
            keys: [this.getLeaderKey()],
            arguments: [this.ownershipToken]
        });

        await this.markLeadership({
            isLeader: false,
            fencingToken: this.leaderState.fencingToken,
            leaderInstanceId: null,
            changed: true,
            suppressAlert: true
        });
    }

    tick = async () => {
        observabilityService.recordLeaderElection();

        if (!this.shouldUseRedisLeadership()) {
            this.leaderState = {
                enabled: false,
                instanceId: constants.CLUSTER_INSTANCE_ID,
                isLeader: true,
                hasLeader: true,
                fencingToken: 0,
                leaderInstanceId: constants.CLUSTER_INSTANCE_ID,
                observedAt: new Date().toISOString()
            };
            return this.leaderState;
        }

        if (this.leaderState.isLeader) {
            const renewed = await this.renewLeadership();
            if (renewed) {
                return this.leaderState;
            }
        }

        const acquired = await this.acquireLeadership();
        if (!acquired) {
            await this.observeLeader();
        }

        return this.leaderState;
    }

    start = async () => {
        if (this.started) {
            return;
        }

        this.started = true;
        await this.tick();

        if (!this.shouldUseRedisLeadership()) {
            return;
        }

        this.intervalRef = setInterval(() => {
            this.tick().catch(async (err) => {
                auditService.record('cluster.leadership_error', {
                    outcome: 'ERROR',
                    instanceId: constants.CLUSTER_INSTANCE_ID,
                    message: err.message
                });
                await this.observeLeader();
            });
        }, constants.LEADER_ELECTION_RENEW_MS);
    }

    stop = async () => {
        if (this.intervalRef) {
            clearInterval(this.intervalRef);
            this.intervalRef = undefined;
        }
        try {
            await this.releaseLeadership();
        } catch (err) {
            auditService.record('cluster.leadership_release_error', {
                outcome: 'ERROR',
                instanceId: constants.CLUSTER_INSTANCE_ID,
                message: err.message
            });
        }
        this.started = false;
    }

    isLeader = () => this.leaderState.isLeader

    getStatus = () => ({ ...this.leaderState })
}

const clusterLeaderService = new ClusterLeaderService();

module.exports = {
    clusterLeaderService
};
