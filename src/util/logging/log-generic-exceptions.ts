var { logUtil } = require("./logging-util");

const logGenericExceptions = () => {
    process.on('uncaughtException', (err: Error) => {
        console.log(err)
        const msg = err.message + err.stack.replace(/(\r\n|\n|\r)/gm, "");
        logUtil.errorAndClose(msg);
    });

    process.on('unhandledRejection', (err: Error) => {
        console.log(err)
        const msg = err.message + err.stack.replace(/(\r\n|\n|\r)/gm, "");
        logUtil.errorAndClose(msg);
    });

};


module.exports = logGenericExceptions;

