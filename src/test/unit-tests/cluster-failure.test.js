const chai = require('chai');
const { registryStateService } = require('../../main/service/registry-state-service');
const { clusterLeaderService } = require('../../main/service/cluster-leader-service');
const { constants } = require('../../main/util/constants/constants');

const should = chai.should();

class FakeRedisClientForFailures {
    constructor(sharedState) {
        this.sharedState = sharedState;
        this.handlers = {};
        this.isOpen = false;
        this.shouldThrow = false;
    }

    on = (eventName, handler) => {
        this.handlers[eventName] = handler;
    }

    connect = async () => {
        if (this.shouldThrow) throw new Error('Connection failed');
        this.isOpen = true;
    }

    quit = async () => {
        this.isOpen = false;
    }

    get = async (key) => {
        if (this.shouldThrow) throw new Error('Redis command failed');
        return this.sharedState.store.get(key) || null;
    }

    set = async (key, value, options = {}) => {
        if (this.shouldThrow) throw new Error('Redis command failed');
        const existing = this.sharedState.store.get(key);
        if (options.NX && existing) {
            return null;
        }
        this.sharedState.store.set(key, value);
        return 'OK';
    }

    incr = async (key) => {
        if (this.shouldThrow) throw new Error('Redis command failed');
        const val = (this.sharedState.store.get(key) || 0) + 1;
        this.sharedState.store.set(key, val);
        return val;
    }

    del = async (key) => {
        if (this.shouldThrow) throw new Error('Redis command failed');
        this.sharedState.store.delete(key);
        return 1;
    }

    eval = async (script, options = {}) => {
        if (this.shouldThrow) throw new Error('Redis command failed');
        const [key] = options.keys || [];
        const [token] = options.arguments || [];
        const val = this.sharedState.store.get(key);
        if (!val) return 0;
        const parsed = JSON.parse(val);
        if (parsed.token !== token) return 0;
        
        if (script.includes('pexpire')) {
            return 1; // renew success
        }
        this.sharedState.store.delete(key);
        return 1; // release success
    }
}

describe('Cluster Leader Service Failure Simulations', () => {
    const sharedRedisState = {
        store: new Map()
    };
    let originalMode;
    let originalElection;
    let originalRedisUrl;
    let fakeClient;

    before(() => {
        originalMode = constants.REGISTRY_STATE_MODE;
        originalElection = constants.LEADER_ELECTION_ENABLED;
        originalRedisUrl = constants.REGISTRY_REDIS_URL;

        process.env.MAXINE_REGISTRY_STATE_MODE = 'redis';
        process.env.MAXINE_LEADER_ELECTION_ENABLED = 'true';
        process.env.MAXINE_REGISTRY_REDIS_URL = 'redis://fake-redis:6379';

        // Update constants from env values
        constants.REGISTRY_STATE_MODE = 'redis';
        constants.LEADER_ELECTION_ENABLED = true;
        constants.REGISTRY_REDIS_URL = 'redis://fake-redis:6379';
    });

    after(async () => {
        constants.REGISTRY_STATE_MODE = originalMode;
        constants.LEADER_ELECTION_ENABLED = originalElection;
        constants.REGISTRY_REDIS_URL = originalRedisUrl;

        await clusterLeaderService.stop();
        await registryStateService.close();
    });

    beforeEach(async () => {
        sharedRedisState.store.clear();
        await registryStateService.close();
        fakeClient = new FakeRedisClientForFailures(sharedRedisState);
        registryStateService.setRedisClientFactory(() => fakeClient);
    });

    it('should successfully acquire leadership when Redis is healthy', async () => {
        const state = await clusterLeaderService.tick();
        state.isLeader.should.be.true;
        state.hasLeader.should.be.true;
    });

    it('should lose leadership/fail renew when Redis connection drops', async () => {
        // 1. Acquire leadership first
        let state = await clusterLeaderService.tick();
        state.isLeader.should.be.true;

        // 2. Simulate Redis connection drop
        fakeClient.shouldThrow = true;

        // 3. Try to tick (renew) - should catch error and transition to not leader
        try {
            await clusterLeaderService.tick();
        } catch (err) {
            // tick handles the error internally in interval loop, but direct tick call might propagate depending on connection drop
        }

        // We simulate what the ticker does on error: call observeLeader
        await clusterLeaderService.observeLeader();
        
        const finalState = clusterLeaderService.getStatus();
        finalState.isLeader.should.be.false;
    });

    it('should allow another node to claim leadership after leader crash/lease expiration', async () => {
        // 1. Leader A (this instance) acquires leadership
        await clusterLeaderService.tick();
        clusterLeaderService.isLeader().should.be.true;

        // 2. Simulate Leader A crashing (stopping tick and its lease expiring in Redis store)
        await clusterLeaderService.stop();
        sharedRedisState.store.clear(); // Lease expired/removed

        // 3. Leader B (represented by resetting and starting again) starts and ticks
        await registryStateService.close();
        const fakeClientB = new FakeRedisClientForFailures(sharedRedisState);
        registryStateService.setRedisClientFactory(() => fakeClientB);

        await clusterLeaderService.start();
        const stateB = clusterLeaderService.getStatus();
        stateB.isLeader.should.be.true;
    });
});
