const { User, admin } = require("../../entity/user");
const { statusAndMsgs, constants } = require("../../util/constants/constants");
const { error, info } = require("../../util/logging/logging-util");
const _ = require('lodash');
const user = require("../../entity/user");

const changePwdController = (req, res) => {
    const {password, newPassword} = req.body;
    info(JSON.stringify(user.admin));
    if(!password || !newPassword){
        error(statusAndMsgs.MSG_MISSING_UNAME_PWD);
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_MISSING_PWD});
        return;
    }
    if (_.isEqual(new User(constants.DEFAULT_ADMIN_USERNAME_PWD, password), admin)){
        admin.password = newPassword;
        res.json({"accessToken" : "success"});
        return;
    }
    res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
}

module.exports = {
    changePwdController
}