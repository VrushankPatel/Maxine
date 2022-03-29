const { authenticateToken } = require("./jwt");

const authenticationFilter = (req, res, next) => {
    authenticateToken(req, res, next);
}

module.exports = authenticationFilter;