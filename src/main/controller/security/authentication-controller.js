const jwt = require('jsonwebtoken');
const { LRUCache } = require('lru-cache');
const { admin, User } = require('../../entity/user');
const { statusAndMsgs, constants } = require('../../util/constants/constants');
const { audit } = require('../../util/logging/logging-util');

// Cache for verified JWT tokens to improve performance
const tokenCache = new LRUCache({ max: 10000, ttl: 15 * 60 * 1000 }); // 15 minutes TTL

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

    if (!token || token.trim() === ''){
        audit(`AUTHENTICATION_FAILED`, { reason: 'missing_token', ip: req.ip, path: req.path, userAgent: req.get('User-Agent') });
        res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
        return;
    }

    // Check cache first
    const cachedUser = tokenCache.get(token);
    if (cachedUser) {
        req.user = cachedUser;
        next();
        return;
    }

    jwt.verify(token, constants.SECRET, (err, user) => {
        if (err) {
            const reason = err.message.includes("jwt expired") ? 'token_expired' : 'invalid_token';
            audit(`AUTHENTICATION_FAILED`, { reason, ip: req.ip, path: req.path, userAgent: req.get('User-Agent') });
            err.message.includes("jwt expired") ?
            res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_JWT_EXPIRED}) :
            res.status(statusAndMsgs.STATUS_FORBIDDEN).json({"message" : statusAndMsgs.MSG_FORBIDDEN});
            return;
        }

        const userObj = User.createUserFromObj(user);
        if (userObj.userName === admin.userName && userObj.password === admin.password && userObj.role === 'admin') {
            req.user = userObj;
            tokenCache.set(token, userObj);
            audit(`AUTHENTICATION_SUCCESS`, { user: userObj.userName, role: userObj.role, ip: req.ip, path: req.path });
            next();
            return;
        }

        // For other users, check if role allows
        if (userObj.role === 'admin' || userObj.role === 'user') {
            req.user = userObj;
            tokenCache.set(token, userObj);
            audit(`AUTHENTICATION_SUCCESS`, { user: userObj.userName, role: userObj.role, ip: req.ip, path: req.path });
            next();
            return;
        }

        audit(`AUTHENTICATION_FAILED`, { reason: 'insufficient_role', user: userObj.userName, role: userObj.role, ip: req.ip, path: req.path });
        res.status(statusAndMsgs.STATUS_FORBIDDEN).json({"message" : statusAndMsgs.MSG_FORBIDDEN});
    });
}

module.exports = {
    authenticationController
}