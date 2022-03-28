const secret = require('crypto').randomBytes(64).toString('hex');
const expirationTime = parseInt(properties.expirationTime);

module.exports = {
    secret,
    expirationTime
};