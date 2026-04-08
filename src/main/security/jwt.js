const jwt = require('jsonwebtoken');
const { constants } = require('../util/constants/constants');
const { admin } = require('../entity/user');

function normalizeTokenPayload(payloadObj = {}) {
    return {
        userName: payloadObj.userName || admin.userName,
        role: payloadObj.role || admin.role,
        credentialVersion: Number.isInteger(payloadObj.credentialVersion) ? payloadObj.credentialVersion : admin.credentialVersion
    };
}

function generateAccessToken(payloadObj) {
    return jwt.sign(normalizeTokenPayload(payloadObj), constants.SECRET, {
        expiresIn:`${constants.EXPIRATION_TIME}s`,
        keyid: constants.JWT_SECRET_KEY_ID
    });
}

function verifyAccessToken(token) {
    const verificationSecrets = [constants.SECRET].concat(constants.JWT_PREVIOUS_SECRETS);
    let lastError;

    for (const secret of verificationSecrets) {
        try {
            return jwt.verify(token, secret);
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError;
}

module.exports = {
  generateAccessToken,
  verifyAccessToken
}
