const jwt = require('jsonwebtoken');
const { admin, User } = require('../../entity/user');
const { statusAndMsgs, constants } = require('../../util/constants/constants');

function authenticationController(req, res, next) {
    let authRequired = false;
    constants.API_URLS_WITH_AUTH.forEach(url => {
        if (req.url.startsWith(url)){
            authRequired = true;
        }
    })

    if(!authRequired){
        next();
        return;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token){
        res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
        return;
    }

    jwt.verify(token, constants.SECRET, (err, user) => {
        if (user && User.createUserFromObj(user).userName === admin.userName && User.createUserFromObj(user).password === admin.password){
            next();
            return;
        }

        if(err){
            err.message.includes("jwt expired") ?
            res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_JWT_EXPIRED}) :
            res.status(statusAndMsgs.STATUS_FORBIDDEN).json({"message" : statusAndMsgs.MSG_FORBIDDEN});
            return;
        }

        res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
    });
}

module.exports = {
    authenticationController
}