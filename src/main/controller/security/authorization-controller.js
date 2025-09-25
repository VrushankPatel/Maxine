const { statusAndMsgs } = require('../../util/constants/constants');
const { ROLES, requirePermission } = require('../../security/rbac');
const { audit } = require('../../util/logging/logging-util');

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      audit(`AUTHORIZATION_FAILED`, {
        reason: 'no_user',
        requiredRole: role,
        ip: req.ip,
        path: req.path,
      });
      res
        .status(statusAndMsgs.STATUS_UNAUTHORIZED)
        .json({ message: statusAndMsgs.MSG_UNAUTHORIZED });
      return;
    }
    if (req.user.role === ROLES.ADMIN || req.user.role === role) {
      audit(`AUTHORIZATION_SUCCESS`, {
        user: req.user.userName,
        role: req.user.role,
        requiredRole: role,
        ip: req.ip,
        path: req.path,
      });
      next();
    } else {
      audit(`AUTHORIZATION_FAILED`, {
        reason: 'insufficient_permissions',
        user: req.user.userName,
        userRole: req.user.role,
        requiredRole: role,
        ip: req.ip,
        path: req.path,
      });
      res.status(statusAndMsgs.STATUS_FORBIDDEN).json({ message: 'Insufficient permissions' });
    }
  };
}

module.exports = {
  requireRole,
  requirePermission,
};
