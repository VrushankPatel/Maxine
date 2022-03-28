const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db/db-config");

class User {
    userName;
    password;
}

module.exports = {
    User
}
