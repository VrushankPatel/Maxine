const { User, admin } = require('../../entity/user');
const { generateAccessToken } = require('../../security/jwt');
const { statusAndMsgs } = require('../../util/constants/constants');
const { error, audit } = require('../../util/logging/logging-util');
const { ROLES } = require('../../security/rbac');
const ldapService = require('../../service/ldap-service');
const config = require('../../config/config');

// Demo users with roles (in production, use database)
const demoUsers = {
  admin: { password: 'admin', role: ROLES.ADMIN },
  operator: { password: 'operator', role: ROLES.OPERATOR },
  viewer: { password: 'viewer', role: ROLES.VIEWER },
  service: { password: 'service', role: ROLES.SERVICE },
};

const signInController = async (req, res) => {
  const { userName, password } = req.body;
  if (!(userName && password)) {
    error(statusAndMsgs.MSG_MISSING_UNAME_PWD);
    res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: statusAndMsgs.MSG_MISSING_UNAME_PWD });
    return;
  }

  try {
    // Try LDAP authentication if enabled
    if (config.ldapEnabled) {
      try {
        const ldapUser = await ldapService.authenticate(userName, password);
        // Map LDAP groups to roles (simplified - in production, implement proper group mapping)
        let role = ROLES.VIEWER; // default role
        if (ldapUser.groups && ldapUser.groups.some((group) => group.includes('admin'))) {
          role = ROLES.ADMIN;
        } else if (ldapUser.groups && ldapUser.groups.some((group) => group.includes('operator'))) {
          role = ROLES.OPERATOR;
        }

        const userWithRole = {
          userName: ldapUser.username,
          displayName: ldapUser.displayName,
          email: ldapUser.email,
          role: role,
        };
        const token = generateAccessToken(userWithRole);
        audit(`LDAP_LOGIN_SUCCESS`, {
          user: userName,
          role: role,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
        res.json({ accessToken: token });
        return;
      } catch (ldapError) {
        // LDAP failed, continue to local auth
        audit(`LDAP_LOGIN_FAILED`, { user: userName, error: ldapError.message, ip: req.ip });
      }
    }

    // Check demo users
    if (demoUsers[userName] && demoUsers[userName].password === password) {
      const userWithRole = { userName, password, role: demoUsers[userName].role };
      const token = generateAccessToken(userWithRole);
      audit(`LOGIN_SUCCESS`, {
        user: userName,
        role: userWithRole.role,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      res.json({ accessToken: token });
      return;
    }

    // Fallback to old admin check for backward compatibility
    if (
      new User(userName, password).userName === admin.userName &&
      new User(userName, password).password === admin.password
    ) {
      const userWithRole = { ...req.body, role: admin.role };
      const token = generateAccessToken(userWithRole);
      audit(`LOGIN_SUCCESS`, {
        user: userName,
        role: userWithRole.role,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      res.json({ accessToken: token });
      return;
    }

    audit(`LOGIN_FAILED`, { user: userName, ip: req.ip, userAgent: req.get('User-Agent') });
    res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({ message: statusAndMsgs.MSG_UNAUTHORIZED });
  } catch (error) {
    error('Signin error:', error);
    res.status(statusAndMsgs.STATUS_SERVER_ERROR).json({ message: 'Authentication error' });
  }
};

module.exports = {
  signInController,
};
