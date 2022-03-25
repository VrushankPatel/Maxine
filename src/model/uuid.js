const { UUIDV4 } = require("sequelize");
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db/db-config");

const UUIDs = sequelize.define('UUIDs', {
    uuid: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: UUIDV4,
        primaryKey: true
    }
},{
    freezeTableName: true,
    timestamps: false
});

UUIDs.sync();

module.exports = {
    UUIDs
}
