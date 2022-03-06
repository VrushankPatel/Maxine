const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../db/db-instance");

const User = sequelize.define('User', {
    userName: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    }
},{
    freezeTableName: true,
    timestamps: false
});

console.log(User === sequelize.models.User); // true

User.sync();
console.log("The table for the User model was just (re)created!");

module.exports = {
    temp : "vrushank"
}
