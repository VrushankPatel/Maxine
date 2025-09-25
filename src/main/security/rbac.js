// Role-Based Access Control (RBAC) for Maxine

const ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
  SERVICE: 'service',
};

const PERMISSIONS = {
  // Service operations
  REGISTER_SERVICE: 'register_service',
  DEREGISTER_SERVICE: 'deregister_service',
  HEARTBEAT: 'heartbeat',
  DISCOVER_SERVICE: 'discover_service',

  // Configuration
  SET_CONFIG: 'set_config',
  GET_CONFIG: 'get_config',
  DELETE_CONFIG: 'delete_config',

  // Monitoring
  VIEW_METRICS: 'view_metrics',
  VIEW_HEALTH: 'view_health',
  VIEW_LOGS: 'view_logs',

  // Management
  MANAGE_USERS: 'manage_users',
  MANAGE_ROLES: 'manage_roles',
  BACKUP_RESTORE: 'backup_restore',
  MANAGE_FEDERATION: 'manage_federation',

  // Advanced features
  MANAGE_ACL: 'manage_acl',
  MANAGE_INTENTIONS: 'manage_intentions',
  MANAGE_DEPENDENCIES: 'manage_dependencies',
  MANAGE_BLACKLIST: 'manage_blacklist',
  MANAGE_DEPLOYMENT: 'manage_deployment',
  MANAGE_WEBHOOKS: 'manage_webhooks',
  MANAGE_ALIASES: 'manage_aliases',
  MANAGE_KV: 'manage_kv',
  MANAGE_TEMPLATES: 'manage_templates',
  MANAGE_API_SPEC: 'manage_api_spec',
  MANAGE_PENDING: 'manage_pending',

  // Admin only
  CHANGE_PASSWORD: 'change_password',
  MANAGE_MAINTENANCE: 'manage_maintenance',
};

// Permission matrix: role -> set of permissions
const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: new Set(Object.values(PERMISSIONS)),
  [ROLES.OPERATOR]: new Set([
    PERMISSIONS.REGISTER_SERVICE,
    PERMISSIONS.DEREGISTER_SERVICE,
    PERMISSIONS.HEARTBEAT,
    PERMISSIONS.DISCOVER_SERVICE,
    PERMISSIONS.SET_CONFIG,
    PERMISSIONS.GET_CONFIG,
    PERMISSIONS.DELETE_CONFIG,
    PERMISSIONS.VIEW_METRICS,
    PERMISSIONS.VIEW_HEALTH,
    PERMISSIONS.MANAGE_ACL,
    PERMISSIONS.MANAGE_INTENTIONS,
    PERMISSIONS.MANAGE_DEPENDENCIES,
    PERMISSIONS.MANAGE_BLACKLIST,
    PERMISSIONS.MANAGE_DEPLOYMENT,
    PERMISSIONS.MANAGE_WEBHOOKS,
    PERMISSIONS.MANAGE_ALIASES,
    PERMISSIONS.MANAGE_KV,
    PERMISSIONS.MANAGE_TEMPLATES,
    PERMISSIONS.MANAGE_API_SPEC,
    PERMISSIONS.MANAGE_PENDING,
  ]),
  [ROLES.VIEWER]: new Set([
    PERMISSIONS.DISCOVER_SERVICE,
    PERMISSIONS.GET_CONFIG,
    PERMISSIONS.VIEW_METRICS,
    PERMISSIONS.VIEW_HEALTH,
  ]),
  [ROLES.SERVICE]: new Set([
    PERMISSIONS.REGISTER_SERVICE,
    PERMISSIONS.DEREGISTER_SERVICE,
    PERMISSIONS.HEARTBEAT,
    PERMISSIONS.DISCOVER_SERVICE,
  ]),
};

function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role] && ROLE_PERMISSIONS[role].has(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    if (hasPermission(req.user.role, permission)) {
      next();
    } else {
      res.status(403).json({ message: 'Insufficient permissions' });
    }
  };
}

module.exports = {
  ROLES,
  PERMISSIONS,
  hasPermission,
  requirePermission,
};
