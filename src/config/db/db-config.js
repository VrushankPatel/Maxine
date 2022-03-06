const { info } = require("../../util/logging/logging-util")
const { properties } = require("../../util/propertyReader/property-reader")

const dbConfig = {
    dialect: properties["sql.dialect"],
    storage: properties["sql.dbLoc"],
    logging: info
}

module.exports = {
    dbConfig
}