const { statusAndMsgs } = require('../../util/constants/constants');

function requireRole(role) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message": statusAndMsgs.MSG_UNAUTHORIZED});
            return;
        }
        if (req.user.role === 'admin' || req.user.role === role) {
            next();
        } else {
            res.status(statusAndMsgs.STATUS_FORBIDDEN).json({"message": "Insufficient permissions"});
        }
    };
}

module.exports = {
    requireRole
};