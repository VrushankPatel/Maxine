const fs = require('fs');
const path = require('path');
const { constants } = require('../util/constants/constants');

const isValidAdminState = (state) => state
    && typeof state.userName === 'string'
    && state.userName.length > 0
    && typeof state.password === 'string'
    && state.password.length > 0;

const loadAdminState = () => {
    if (constants.ADMIN_CREDENTIALS_MANAGED_BY_ENV || !fs.existsSync(constants.ADMIN_STATE_FILE)) {
        return null;
    }

    try {
        const file = fs.readFileSync(constants.ADMIN_STATE_FILE, 'utf8');
        const state = JSON.parse(file);
        if (!isValidAdminState(state)) {
            return null;
        }

        return {
            userName: state.userName,
            password: state.password,
            credentialVersion: Number.isInteger(state.credentialVersion) ? state.credentialVersion : 0
        };
    } catch (_err) {
        return null;
    }
};

const persistAdminState = (admin) => {
    if (constants.ADMIN_CREDENTIALS_MANAGED_BY_ENV) {
        return false;
    }

    fs.mkdirSync(path.dirname(constants.ADMIN_STATE_FILE), { recursive: true });
    fs.writeFileSync(constants.ADMIN_STATE_FILE, JSON.stringify({
        userName: admin.userName,
        password: admin.password,
        credentialVersion: admin.credentialVersion
    }, null, 2));
    return true;
};

module.exports = {
    loadAdminState,
    persistAdminState
};
