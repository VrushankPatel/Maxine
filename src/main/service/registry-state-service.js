const fs = require('fs');
const path = require('path');
const { constants } = require('../util/constants/constants');
const { info, error } = require('../util/logging/logging-util');
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

class RegistryStateService {
    getLockPath = () => `${constants.REGISTRY_STATE_FILE}.lock`

    isSharedFileMode = () => constants.REGISTRY_STATE_MODE === 'shared-file'

    sleepSync = (ms) => Atomics.wait(sleepBuffer, 0, 0, ms)

    withStateLock = (callback) => {
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
            return callback();
        } finally {
            fs.rmSync(this.getLockPath(), { recursive: true, force: true });
        }
    }

    readRegistrySnapshot = () => {
        if (!constants.REGISTRY_PERSISTENCE_ENABLED || !fs.existsSync(constants.REGISTRY_STATE_FILE)) {
            return null;
        }

        const state = JSON.parse(fs.readFileSync(constants.REGISTRY_STATE_FILE, 'utf8'));
        return state.registry || {};
    }

    writeRegistrySnapshot = (registrySnapshot) => {
        if (!constants.REGISTRY_PERSISTENCE_ENABLED) {
            return;
        }

        fs.mkdirSync(path.dirname(constants.REGISTRY_STATE_FILE), { recursive: true });
        fs.writeFileSync(constants.REGISTRY_STATE_FILE, JSON.stringify({
            savedAt: Date.now(),
            registry: registrySnapshot
        }, null, 2));
    }

    save = (registrySnapshot) => {
        if (!constants.REGISTRY_PERSISTENCE_ENABLED) {
            return;
        }

        try {
            this.withStateLock(() => {
                this.writeRegistrySnapshot(registrySnapshot);
            });
        } catch (err) {
            error(`Unable to persist registry state: ${err.message}`);
        }
    }

    load = () => {
        try {
            return this.withStateLock(() => this.readRegistrySnapshot());
        } catch (err) {
            error(`Unable to load registry state: ${err.message}`);
            return null;
        }
    }

    mutate = (mutator) => {
        try {
            return this.withStateLock(() => {
                const registrySnapshot = this.readRegistrySnapshot() || {};
                const mutationResult = mutator(registrySnapshot);
                const shouldUseExplicitRegistry = mutationResult
                    && typeof mutationResult === 'object'
                    && Object.prototype.hasOwnProperty.call(mutationResult, 'registry');

                const nextRegistry = shouldUseExplicitRegistry ? mutationResult.registry : registrySnapshot;
                this.writeRegistrySnapshot(nextRegistry);

                if (mutationResult && typeof mutationResult === 'object' && Object.prototype.hasOwnProperty.call(mutationResult, 'result')) {
                    return mutationResult.result;
                }

                return mutationResult;
            });
        } catch (err) {
            error(`Unable to mutate registry state: ${err.message}`);
            return undefined;
        }
    }

    clear = () => {
        if (!fs.existsSync(constants.REGISTRY_STATE_FILE)) {
            return;
        }

        try {
            fs.rmSync(constants.REGISTRY_STATE_FILE, { force: true });
        } catch (err) {
            error(`Unable to clear registry state: ${err.message}`);
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
