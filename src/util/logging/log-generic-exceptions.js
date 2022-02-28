const { errorAndClose } = require("./logging-util");

const logGenericExceptions = () => {
    const handleUncaughts = (err) => {
        const msg = err.message + err.stack.replace(/(\r\n|\n|\r)/gm, "");
        errorAndClose(msg);
    };
    process.on('uncaughtException', handleUncaughts);
};


module.exports = logGenericExceptions;

