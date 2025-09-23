const { User, admin } = require("../../entity/user");
const { generateAccessToken } = require("../../security/jwt");
const { statusAndMsgs } = require("../../util/constants/constants");
const { error } = require("../../util/logging/logging-util");

const signInController = (req, res) => {
    const {userName, password} = req.body;
    if(!(userName && password)){
        error(statusAndMsgs.MSG_MISSING_UNAME_PWD);
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_MISSING_UNAME_PWD});
        return;
    }
    if (new User(userName, password).userName === admin.userName && new User(userName, password).password === admin.password){
        const userWithRole = { ...req.body, role: admin.role };
        const token = generateAccessToken(userWithRole);
        res.json({"accessToken" : token});
        return;
    }
    res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
}

module.exports = {
    signInController
}