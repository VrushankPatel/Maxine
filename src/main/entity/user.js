const { constants } = require("../util/constants/constants");
const { loadAdminState, persistAdminState } = require("../service/admin-state-service");

class User {
    userName;
    password;
    credentialVersion;

    static createUserFromObj(obj){
        return new User(obj.userName, obj.password, obj.credentialVersion);
    }

    constructor(userName, password, credentialVersion = 0){
        this.userName = userName;
        this.password = password;
        this.credentialVersion = Number.isInteger(credentialVersion) ? credentialVersion : 0;
    }
}

const persistedAdminState = loadAdminState();
const admin = persistedAdminState
    ? new User(persistedAdminState.userName, persistedAdminState.password, persistedAdminState.credentialVersion)
    : new User(constants.DEFAULT_ADMIN_USERNAME, constants.DEFAULT_ADMIN_PASSWORD, 0);

const isValidAdminCredentials = (userName, password) => admin.userName === userName && admin.password === password;

const updateAdminPassword = (currentPassword, nextPassword) => {
    if (!isValidAdminCredentials(admin.userName, currentPassword)) {
        return false;
    }

    admin.password = nextPassword;
    admin.credentialVersion += 1;
    persistAdminState(admin);
    return true;
};

const isAdminCredentialsManagedByEnv = () => constants.ADMIN_CREDENTIALS_MANAGED_BY_ENV;

module.exports = {
    User,
    admin,
    isValidAdminCredentials,
    updateAdminPassword,
    isAdminCredentialsManagedByEnv
} 
