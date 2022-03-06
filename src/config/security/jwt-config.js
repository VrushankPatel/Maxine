const { properties } = require('../../util/propertyReader/property-reader');

const secret = require('crypto').randomBytes(64).toString('hex');
const expirationTime = parseInt(properties.expirationTime);

module.exports = {
    secret,
    expirationTime
};