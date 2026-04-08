const _ = require('lodash');
const { findUserByUserName, hasRequiredRole } = require('../../entity/user');
const { statusAndMsgs, constants } = require('../../util/constants/constants');
const { verifyAccessToken } = require('../../security/jwt');
const { authorizationService } = require('../../service/authorization-service');
const { clusterLeaderService } = require('../../service/cluster-leader-service');
const { auditService } = require('../../service/audit-service');
const { observabilityService } = require('../../service/observability-service');

function authenticationController(req, res, next) {
    let authRequired = false;
    constants.API_URLS_WITH_AUTH.forEach(url => {
        if (req.url.startsWith(url)){
            authRequired = true;
        }
    })

    if(!authRequired){
        next();
        return;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (_.isNull(token) || _.isUndefined(token) || _.isEmpty(token)){
        observabilityService.recordAuthFailure();
        res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
        return;
    }

    let user;
    try {
        user = verifyAccessToken(token);
    } catch (err) {
        observabilityService.recordAuthFailure();
        err.message.includes("jwt expired")
            ? res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_JWT_EXPIRED})
            : res.status(statusAndMsgs.STATUS_FORBIDDEN).json({"message" : statusAndMsgs.MSG_FORBIDDEN});
        return;
    }

    const currentUser = findUserByUserName(user.userName);
    if (!currentUser || currentUser.credentialVersion !== user.credentialVersion) {
        observabilityService.recordAuthFailure();
        res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
        return;
    }

    const requiredRole = authorizationService.getRequiredRole(req);
    if (!hasRequiredRole(currentUser.role, requiredRole)) {
        observabilityService.recordAuthFailure();
        auditService.record('authz.denied', {
            outcome: 'FORBIDDEN',
            userName: currentUser.userName,
            role: currentUser.role,
            method: req.method,
            path: req.path,
            traceId: req.traceId
        });
        res.status(statusAndMsgs.STATUS_FORBIDDEN).json({"message" : statusAndMsgs.MSG_FORBIDDEN});
        return;
    }

    if (authorizationService.requiresLeader(req)
        && constants.REGISTRY_STATE_MODE === 'redis'
        && constants.LEADER_ELECTION_ENABLED
        && !clusterLeaderService.isLeader()) {
        res.status(statusAndMsgs.STATUS_CONFLICT).json({
            "message": statusAndMsgs.MSG_NOT_CLUSTER_LEADER
        });
        return;
    }

    req.authUser = {
        userName: currentUser.userName,
        role: currentUser.role,
        credentialVersion: currentUser.credentialVersion
    };
    next();
}

module.exports = {
    authenticationController
}
