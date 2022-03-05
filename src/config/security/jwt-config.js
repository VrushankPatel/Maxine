const secret = require('crypto').randomBytes(64).toString('hex');
const expirationTime = 1800;

module.exports = {
    secret,
    expirationTime
};