const { errorAndClose, error } = require("./logging-util");

const logGenericExceptions = () => {
    process.on('uncaughtException', (err) => {
        const msg = err.message + err.stack.replace(/(\r\n|\n|\r)/gm, "");
        errorAndClose(msg);
    });

    process.on('unhandledRejection', (err) => {
        if(err.name === "SequelizeUniqueConstraintError"){
            error(err.name + " | " + err.message + " | " + JSON.stringify(err.original));
            return;
        }
        const msg = err.message + err.stack.replace(/(\r\n|\n|\r)/gm, "");
        errorAndClose(msg);
    });

};


module.exports = logGenericExceptions;

