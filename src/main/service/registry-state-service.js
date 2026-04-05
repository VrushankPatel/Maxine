const fs = require('fs');
const path = require('path');
const { constants } = require('../util/constants/constants');
const { info, error } = require('../util/logging/logging-util');

class RegistryStateService {
    save = (registrySnapshot) => {
        if (!constants.REGISTRY_PERSISTENCE_ENABLED) {
            return;
        }

        try {
            fs.mkdirSync(path.dirname(constants.REGISTRY_STATE_FILE), { recursive: true });
            fs.writeFileSync(constants.REGISTRY_STATE_FILE, JSON.stringify({
                savedAt: Date.now(),
                registry: registrySnapshot
            }, null, 2));
        } catch (err) {
            error(`Unable to persist registry state: ${err.message}`);
        }
    }

    load = () => {
        if (!constants.REGISTRY_PERSISTENCE_ENABLED || !fs.existsSync(constants.REGISTRY_STATE_FILE)) {
            return null;
        }

        try {
            const state = JSON.parse(fs.readFileSync(constants.REGISTRY_STATE_FILE, 'utf8'));
            return state.registry || {};
        } catch (err) {
            error(`Unable to load registry state: ${err.message}`);
            return null;
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
