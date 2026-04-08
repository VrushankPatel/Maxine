const { constants } = require("../util/constants/constants");
const { loadAdminState, persistAdminState } = require("../service/admin-state-service");

class User {
    userName;
    password;
    role;
    credentialVersion;
    managedByEnv;

    static createUserFromObj(obj){
        return new User(obj.userName, obj.password, obj.role, obj.credentialVersion, obj.managedByEnv);
    }

    constructor(userName, password, role, credentialVersion = 0, managedByEnv = false){
        this.userName = userName;
        this.password = password;
        this.role = role || constants.USER_ROLES.ADMIN.message;
        this.credentialVersion = Number.isInteger(credentialVersion) ? credentialVersion : 0;
        this.managedByEnv = managedByEnv;
    }
}

const persistedAdminState = loadAdminState();
const admin = persistedAdminState
    ? new User(
        persistedAdminState.userName,
        persistedAdminState.password,
        constants.USER_ROLES.ADMIN.message,
        persistedAdminState.credentialVersion,
        constants.ADMIN_CREDENTIALS_MANAGED_BY_ENV
    )
    : new User(
        constants.DEFAULT_ADMIN_USERNAME,
        constants.DEFAULT_ADMIN_PASSWORD,
        constants.USER_ROLES.ADMIN.message,
        0,
        constants.ADMIN_CREDENTIALS_MANAGED_BY_ENV
    );

const operator = constants.DEFAULT_OPERATOR_USERNAME && constants.DEFAULT_OPERATOR_PASSWORD
    ? new User(
        constants.DEFAULT_OPERATOR_USERNAME,
        constants.DEFAULT_OPERATOR_PASSWORD,
        constants.USER_ROLES.OPERATOR.message,
        0,
        true
    )
    : null;

const viewer = constants.DEFAULT_VIEWER_USERNAME && constants.DEFAULT_VIEWER_PASSWORD
    ? new User(
        constants.DEFAULT_VIEWER_USERNAME,
        constants.DEFAULT_VIEWER_PASSWORD,
        constants.USER_ROLES.VIEWER.message,
        0,
        true
    )
    : null;

const getSecurityUsers = () => [admin, operator, viewer].filter(Boolean);

const findUserByUserName = (userName) => getSecurityUsers().find((user) => user.userName === userName);

const getRoleOrder = (role) => {
    switch (role) {
        case constants.USER_ROLES.VIEWER.message:
            return 0;
        case constants.USER_ROLES.OPERATOR.message:
            return 1;
        case constants.USER_ROLES.ADMIN.message:
            return 2;
        default:
            return -1;
    }
};

const hasRequiredRole = (userRole, requiredRole) => getRoleOrder(userRole) >= getRoleOrder(requiredRole);

const isValidAdminCredentials = (userName, password) => {
    const user = findUserByUserName(userName);
    if (!user || user.password !== password) {
        return null;
    }

    return user;
};

const updateAdminPassword = (userName, currentPassword, nextPassword) => {
    if (userName !== admin.userName || !isValidAdminCredentials(admin.userName, currentPassword)) {
        return { success: false, reason: 'INVALID_PASSWORD' };
    }

    if (admin.managedByEnv) {
        return { success: false, reason: 'ENV_MANAGED' };
    }

    admin.password = nextPassword;
    admin.credentialVersion += 1;
    persistAdminState(admin);
    return { success: true, user: admin };
};

const isAdminCredentialsManagedByEnv = () => constants.ADMIN_CREDENTIALS_MANAGED_BY_ENV;

module.exports = {
    User,
    admin,
    operator,
    viewer,
    getSecurityUsers,
    findUserByUserName,
    hasRequiredRole,
    isValidAdminCredentials,
    updateAdminPassword,
    isAdminCredentialsManagedByEnv
} 
