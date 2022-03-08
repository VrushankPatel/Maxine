const { errorAndClose } = require("./logging-util");

const logGenericExceptions = () => {
    process.on('uncaughtException', (err) => {
        const msg = err.message + err.stack.replace(/(\r\n|\n|\r)/gm, "");
        errorAndClose(msg);
    });

    process.on('unhandledRejection', (err) => {
        const msg = err.message + err.stack.replace(/(\r\n|\n|\r)/gm, "");
        errorAndClose(msg);
    });

};


module.exports = logGenericExceptions;

