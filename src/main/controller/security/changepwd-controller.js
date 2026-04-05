const { isAdminCredentialsManagedByEnv, updateAdminPassword } = require("../../entity/user");
const { statusAndMsgs } = require("../../util/constants/constants");
const { error } = require("../../util/logging/logging-util");

const changePwdController = (req, res) => {
    const {password, newPassword} = req.body;
    if(!password || !newPassword){
        error(statusAndMsgs.MSG_MISSING_UNAME_PWD);
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_MISSING_PWD});
        return;
    }

    if (isAdminCredentialsManagedByEnv()) {
        res.status(statusAndMsgs.STATUS_CONFLICT).json({"message" : statusAndMsgs.MSG_ADMIN_CREDENTIALS_MANAGED_BY_ENV});
        return;
    }

    if (updateAdminPassword(password, newPassword)){
        res.status(200).json({"message" : "successfully updated password"});
        return;
    }
    res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_MISSING_PWD});
}

module.exports = {
    changePwdController
}
