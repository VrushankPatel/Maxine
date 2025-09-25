const { ROLES, ROLE_PERMISSIONS, PERMISSIONS } = require('../../security/rbac');
const { statusAndMsgs } = require('../../util/constants/constants');

// Demo users with roles (in production, use database)
const demoUsers = {
  admin: { password: 'admin', role: ROLES.ADMIN },
  operator: { password: 'operator', role: ROLES.OPERATOR },
  viewer: { password: 'viewer', role: ROLES.VIEWER },
  service: { password: 'service', role: ROLES.SERVICE },
};

function getRolesController(req, res) {
  res.json({
    roles: Object.values(ROLES),
    permissions: PERMISSIONS,
    rolePermissions: Object.fromEntries(
      Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [role, Array.from(perms)])
    ),
  });
}

function getUserRolesController(req, res) {
  const { username } = req.params;
  if (!username) {
    res.status(statusAndMsgs.STATUS_BAD_REQUEST).json({ message: 'Username required' });
    return;
  }
  const role = demoUsers[username]?.role || 'user';
  res.json({ username, role });
}

function setUserRoleController(req, res) {
  const { username, role } = req.body;
  if (!username || !role) {
    res.status(statusAndMsgs.STATUS_BAD_REQUEST).json({ message: 'Username and role required' });
    return;
  }
  if (!Object.values(ROLES).includes(role)) {
    res.status(statusAndMsgs.STATUS_BAD_REQUEST).json({ message: 'Invalid role' });
    return;
  }
  if (demoUsers[username]) {
    demoUsers[username].role = role;
  } else {
    demoUsers[username] = { password: 'default', role };
  }
  res.json({ message: 'Role updated successfully', username, role });
}

module.exports = {
  getRolesController,
  getUserRolesController,
  setUserRoleController,
};
