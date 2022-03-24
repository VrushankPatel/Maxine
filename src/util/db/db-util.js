const { sequelize } = require('../../config/db/db-config');
const { userRepository } = require('../../repository/user-repository');
const { statusAndMsgs } = require('../constants/constants');
const { info, errorAndClose } = require('../logging/logging-util');


function invokeDbConnection(){
    try {
        sequelize.authenticate();
        info(statusAndMsgs.MSG_DB_CON_SUCCESS);
    } catch (error) {
        errorAndClose(statusAndMsgs.MSG_DB_CON_FAILURE);
    }
}

async function closeConnection(){
    info("Closing DB Connection..");
    await sequelize.close();
}

function initDb() {
    invokeDbConnection();
    userRepository.createAdmin();
}

module.exports = {
    initDb,
    closeConnection,
};