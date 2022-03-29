const jwt = require('jsonwebtoken');
const _ = require('lodash');
const { admin, User } = require('../../entity/user');
const { statusAndMsgs, constants } = require('../../util/constants/constants');

function authenticationController(req, res, next) {
    if(!constants.API_URLS_WITH_AUTH.includes(req.url)){
        next();
        return;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, constants.SECRET, (err, user) => {
        if (user && _.isEqual(User.createUserFromObj(user), admin)){
            next();
            return;
        }

        if(err){
            err.message.includes("jwt expired") ? 
            res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_JWT_EXPIRED}) : 
            res.sendStatus(statusAndMsgs.STATUS_FORBIDDEN);
            return;
        }

        res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
    });
}

module.exports = {
    authenticationController
}