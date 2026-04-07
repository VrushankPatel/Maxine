const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { constants } = require('../util/constants/constants');
const { info, error } = require('../util/logging/logging-util');
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
let createRedisClient;

try {
    ({ createClient: createRedisClient } = require('redis'));
} catch (_err) {
    createRedisClient = undefined;
}

const sleepAsync = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REDIS_RELEASE_LOCK_SCRIPT = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

class RegistryStateService {
    redisClient;
    redisConnectionPromise;
    redisClientFactory;

    getLockPath = () => `${constants.REGISTRY_STATE_FILE}.lock`

    isSharedFileMode = () => constants.REGISTRY_STATE_MODE === 'shared-file'

    isRedisMode = () => constants.REGISTRY_STATE_MODE === 'redis'

    isSharedStateMode = () => this.isSharedFileMode() || this.isRedisMode()

    isStateStoreEnabled = () => constants.REGISTRY_PERSISTENCE_ENABLED || this.isSharedStateMode()

    getRedisKey = (suffix) => `${constants.REGISTRY_REDIS_KEY_PREFIX}:${suffix}`

    sleepSync = (ms) => Atomics.wait(sleepBuffer, 0, 0, ms)

    initialize = async () => {
        if (this.isRedisMode()) {
            await this.ensureRedisClient();
        }
    }

    setRedisClientFactory = (factory) => {
        this.redisClientFactory = factory;
        this.redisClient = undefined;
        this.redisConnectionPromise = undefined;
    }

    buildRedisClient = () => {
        if (!this.isRedisMode()) {
            return undefined;
        }

        if (this.redisClientFactory) {
            return this.redisClientFactory();
        }

        if (!createRedisClient) {
            throw new Error('MAXINE_REGISTRY_STATE_MODE=redis requires the "redis" package to be installed.');
        }

        if (!constants.REGISTRY_REDIS_URL) {
            throw new Error('MAXINE_REGISTRY_REDIS_URL is required when MAXINE_REGISTRY_STATE_MODE=redis.');
        }

        const client = createRedisClient({
            url: constants.REGISTRY_REDIS_URL,
            socket: {
                connectTimeout: constants.REGISTRY_REDIS_CONNECT_TIMEOUT_MS
            }
        });

        client.on('error', (err) => {
            error(`Redis registry backend error: ${err.message}`);
        });

        return client;
    }

    ensureRedisClient = async () => {
        if (!this.isRedisMode()) {
            return undefined;
        }

        if (this.redisClient) {
            return this.redisClient;
        }

        if (this.redisConnectionPromise) {
            return this.redisConnectionPromise;
        }

        this.redisConnectionPromise = (async () => {
            const client = this.buildRedisClient();
            if (client && typeof client.connect === 'function' && !client.isOpen) {
                await client.connect();
            }

            this.redisClient = client;
            info('Connected to Redis-backed registry state store.');
            return client;
        })().catch((err) => {
            this.redisClient = undefined;
            throw err;
        }).finally(() => {
            this.redisConnectionPromise = undefined;
        });

        return this.redisConnectionPromise;
    }

    withFileStateLock = async (callback) => {
        if (!this.isSharedFileMode()) {
            return callback();
        }

        const startedAt = Date.now();
        while (true) {
            try {
                fs.mkdirSync(this.getLockPath());
                break;
            } catch (err) {
                if (err.code !== 'EEXIST') {
                    throw err;
                }

                if ((Date.now() - startedAt) >= constants.REGISTRY_STATE_LOCK_TIMEOUT_MS) {
                    throw new Error(`Timed out acquiring registry state lock at ${this.getLockPath()}`);
                }

                this.sleepSync(constants.REGISTRY_STATE_LOCK_RETRY_MS);
            }
        }

        try {
            return await callback();
        } finally {
            fs.rmSync(this.getLockPath(), { recursive: true, force: true });
        }
    }

    withRedisStateLock = async (callback) => {
        const client = await this.ensureRedisClient();
        const lockToken = crypto.randomBytes(16).toString('hex');
        const startedAt = Date.now();
        const lockKey = this.getRedisKey('lock');

        while (true) {
            const lockResponse = await client.set(lockKey, lockToken, {
                NX: true,
                PX: constants.REGISTRY_STATE_LOCK_TIMEOUT_MS
            });

            if (lockResponse === 'OK') {
                break;
            }

            if ((Date.now() - startedAt) >= constants.REGISTRY_STATE_LOCK_TIMEOUT_MS) {
                throw new Error(`Timed out acquiring Redis registry state lock for ${lockKey}`);
            }

            await sleepAsync(constants.REGISTRY_STATE_LOCK_RETRY_MS);
        }

        try {
            return await callback(client);
        } finally {
            try {
                await client.eval(REDIS_RELEASE_LOCK_SCRIPT, {
                    keys: [lockKey],
                    arguments: [lockToken]
                });
            } catch (err) {
                error(`Unable to release Redis registry lock: ${err.message}`);
            }
        }
    }

    withStateLock = async (callback) => {
        if (this.isRedisMode()) {
            return this.withRedisStateLock(callback);
        }

        if (this.isSharedFileMode()) {
            return this.withFileStateLock(callback);
        }

        return callback();
    }

    readRegistrySnapshot = async () => {
        if (!this.isStateStoreEnabled()) {
            return null;
        }

        if (this.isRedisMode()) {
            const client = await this.ensureRedisClient();
            const state = await client.get(this.getRedisKey('snapshot'));
            if (!state) {
                return null;
            }
            return JSON.parse(state).registry || {};
        }

        if (!fs.existsSync(constants.REGISTRY_STATE_FILE)) {
            return null;
        }

        const state = JSON.parse(fs.readFileSync(constants.REGISTRY_STATE_FILE, 'utf8'));
        return state.registry || {};
    }

    writeRegistrySnapshot = async (registrySnapshot) => {
        if (!this.isStateStoreEnabled()) {
            return;
        }

        const nextState = JSON.stringify({
            savedAt: Date.now(),
            registry: registrySnapshot
        }, null, 2);

        if (this.isRedisMode()) {
            const client = await this.ensureRedisClient();
            await client.set(this.getRedisKey('snapshot'), nextState);
            return;
        }

        fs.mkdirSync(path.dirname(constants.REGISTRY_STATE_FILE), { recursive: true });
        fs.writeFileSync(constants.REGISTRY_STATE_FILE, nextState);
    }

    save = async (registrySnapshot) => {
        if (!this.isStateStoreEnabled()) {
            return;
        }

        try {
            await this.withStateLock(async () => {
                await this.writeRegistrySnapshot(registrySnapshot);
            });
        } catch (err) {
            error(`Unable to persist registry state: ${err.message}`);
            throw err;
        }
    }

    load = async () => {
        try {
            if (this.isRedisMode()) {
                return await this.readRegistrySnapshot();
            }

            return await this.withStateLock(async () => this.readRegistrySnapshot());
        } catch (err) {
            error(`Unable to load registry state: ${err.message}`);
            throw err;
        }
    }

    mutate = async (mutator) => {
        try {
            return await this.withStateLock(async () => {
                const registrySnapshot = await this.readRegistrySnapshot() || {};
                const mutationResult = await mutator(registrySnapshot);
                const shouldUseExplicitRegistry = mutationResult
                    && typeof mutationResult === 'object'
                    && Object.prototype.hasOwnProperty.call(mutationResult, 'registry');

                const nextRegistry = shouldUseExplicitRegistry ? mutationResult.registry : registrySnapshot;
                await this.writeRegistrySnapshot(nextRegistry);

                if (mutationResult && typeof mutationResult === 'object' && Object.prototype.hasOwnProperty.call(mutationResult, 'result')) {
                    return mutationResult.result;
                }

                return mutationResult;
            });
        } catch (err) {
            error(`Unable to mutate registry state: ${err.message}`);
            throw err;
        }
    }

    clear = async () => {
        if (this.isRedisMode()) {
            try {
                const client = await this.ensureRedisClient();
                await client.del(this.getRedisKey('snapshot'));
                await client.del(this.getRedisKey('lock'));
            } catch (err) {
                error(`Unable to clear registry state: ${err.message}`);
            }
            return;
        }

        try {
            if (!fs.existsSync(constants.REGISTRY_STATE_FILE)) {
                return;
            }

            fs.rmSync(constants.REGISTRY_STATE_FILE, { force: true });
        } catch (err) {
            error(`Unable to clear registry state: ${err.message}`);
        }
    }

    close = async () => {
        if (!this.redisClient) {
            return;
        }

        try {
            if (typeof this.redisClient.quit === 'function') {
                await this.redisClient.quit();
            }
        } catch (err) {
            error(`Unable to close Redis registry backend connection: ${err.message}`);
        } finally {
            this.redisClient = undefined;
            this.redisConnectionPromise = undefined;
        }
    }

    logRestoreSummary = (restoredNodeCount) => {
        if (restoredNodeCount > 0) {
            info(`Recovered ${restoredNodeCount} registry node(s) from persisted state.`);
        }
    }
}

const registryStateService = new RegistryStateService();

module.exports = {
    registryStateService
};
