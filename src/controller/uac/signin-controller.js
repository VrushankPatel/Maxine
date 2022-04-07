const { User, admin } = require("../../entity/user");
const { generateAccessToken, authenticateToken } = require("../../security/jwt");
const { statusAndMsgs } = require("../../util/constants/constants");
const { error } = require("../../util/logging/logging-util");
const _ = require('lodash');

const signInController = (req, res) => {
    const {userName, password} = req.body;
    if(!(userName && password)){
        error(statusAndMsgs.MSG_MISSING_UNAME_PWD);
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_MISSING_UNAME_PWD});
        return;
    }
    if (_.isEqual(new User(userName, password), admin)){
        const token = generateAccessToken(req.body);
        res.json({"accessToken" : token});
        return;
    }
    res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
}

module.exports = {
    signInController
}