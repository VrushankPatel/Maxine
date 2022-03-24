const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db/db-config");
const { constants } = require("../util/constants/constants");

const User = sequelize.define('User', {
    userName: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM({
            values: constants.ROLES
        }),
        defaultValue: "USER",
        allowNull: false
    }
},{
    freezeTableName: true,
    timestamps: false
});

User.sync();

module.exports = {
    User
}
