const jwt = require('jsonwebtoken');
const _ = require('lodash');
const { admin, User } = require('../entity/user');
const { statusAndMsgs, constants } = require('../util/constants/constants');

function generateAccessToken(payloadObj) {
    return jwt.sign(payloadObj, constants.SECRET, { expiresIn:`${constants.EXPIRATION_TIME}s`});
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, constants.SECRET, (err, user) => {
        if (user){
            user = User.createUserFromObj(user);
            if(_.isEqual(user, admin)){
                next();
                return;
            }
            res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
            return;
        }

        if(err){
            if(err.message.includes("jwt expired")){
                res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_JWT_EXPIRED});
                return;
            }
            res.sendStatus(statusAndMsgs.STATUS_FORBIDDEN);
        }
    });
}

module.exports = {
  generateAccessToken,
  authenticateToken
}