const jwt = require('jsonwebtoken');
const { constants } = require('../util/constants/constants');
const { admin } = require('../entity/user');

function normalizeTokenPayload(payloadObj = {}) {
    return {
        userName: payloadObj.userName || admin.userName,
        credentialVersion: Number.isInteger(payloadObj.credentialVersion) ? payloadObj.credentialVersion : admin.credentialVersion
    };
}

function generateAccessToken(payloadObj) {
    return jwt.sign(normalizeTokenPayload(payloadObj), constants.SECRET, { expiresIn:`${constants.EXPIRATION_TIME}s`});
}

module.exports = {
  generateAccessToken
}
