const { sequelize } = require('../config/db/db-config');
const { User, createUserTable } = require('../model/user');
const { statusAndMsgs, constants } = require('../util/constants/constants');
const { info, errorAndClose } = require('../util/logging/logging-util');


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

async function createAdmin(){
    const [user, created] = await User.findOrCreate({
        where: { role: constants.ADMIN.toUpperCase() },
        defaults: {
            userName: constants.ADMIN,
            password: constants.ADMIN
        }
      });
      info(`Admin user ${!created ? "found" : "not found, created one with default id-pwd as admin:admin"}`);
}

function initDb() {
    invokeDbConnection();
    createUserTable();
    createAdmin();
}

module.exports = {
    initDb,
    closeConnection,
};