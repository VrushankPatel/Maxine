const jwt = require('jsonwebtoken');
const { constants } = require('../util/constants/constants');

function generateAccessToken(payloadObj) {
    return jwt.sign(payloadObj, constants.SECRET, { expiresIn:`${constants.EXPIRATION_TIME}s`});
}

module.exports = {
  generateAccessToken
}