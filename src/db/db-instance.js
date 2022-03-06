const { Sequelize } = require('sequelize');
const { dbConfig } = require('../config/db/db-config');
const { info, errorAndClose } = require('../util/logging/logging-util');

const sequelize = new Sequelize(dbConfig);

function invokeDbConnection(){
    try {
        sequelize.authenticate();
        info("DB Connection Successful");
    } catch (error) {
        errorAndClose("Unable to connect to DB, closing App..");
    }
}

async function closeConnection(){
    await sequelize.close();
}

module.exports = {
    sequelize,
    invokeDbConnection,
    closeConnection
};