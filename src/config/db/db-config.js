const { info } = require("../../util/logging/logging-util")
const { properties } = require("../../util/propertyReader/property-reader")
const { Sequelize } = require("sequelize");

const dbConfig = {
    dialect: properties["sql.dialect"],
    storage: properties["sql.dbLoc"],
    logging: info
}

const sequelize = new Sequelize(dbConfig);

module.exports = {
    sequelize,
    dbConfig
}