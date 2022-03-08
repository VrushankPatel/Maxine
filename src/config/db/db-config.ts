const { info } = require("../../util/logging/logging-util")
var properties = require("../../util/propertyReader/property-reader")
const { Sequelize } = require("sequelize");

export const dbConfig = {
    dialect: properties["sql.dialect"],
    storage: properties["sql.dbLoc"],
    logging: info
}

export const sequelize = new Sequelize(dbConfig);