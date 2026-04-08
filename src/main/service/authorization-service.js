const { constants } = require('../util/constants/constants');

class AuthorizationService {
    getRequiredRole = (req) => {
        const path = req.path || req.url || '';
        const method = req.method || 'GET';

        if (path.startsWith('/api/maxine/change-password')) {
            return constants.USER_ROLES.ADMIN.message;
        }

        if (path.startsWith('/api/maxine/control/config')) {
            return method === 'GET'
                ? constants.USER_ROLES.VIEWER.message
                : constants.USER_ROLES.OPERATOR.message;
        }

        if (path.startsWith('/api/maxine/serviceops/servers')) {
            return constants.USER_ROLES.VIEWER.message;
        }

        if (path.startsWith('/api/logs/recent/clear')) {
            return constants.USER_ROLES.OPERATOR.message;
        }

        if (path.startsWith('/api/logs') || path.startsWith('/logs')) {
            return constants.USER_ROLES.VIEWER.message;
        }

        if (path.startsWith('/api/actuator/audit')
            || path.startsWith('/api/actuator/alerts')
            || path.startsWith('/api/actuator/cluster')
            || path.startsWith('/api/actuator/prometheus')
            || path.startsWith('/api/actuator/traces')
            || path.startsWith('/api/actuator/upstreams')) {
            return constants.USER_ROLES.VIEWER.message;
        }

        return constants.USER_ROLES.ADMIN.message;
    }

    requiresLeader = (req) => {
        const path = req.path || req.url || '';
        return req.method !== 'GET' && path.startsWith('/api/maxine/control/config');
    }
}

const authorizationService = new AuthorizationService();

module.exports = {
    authorizationService
};
