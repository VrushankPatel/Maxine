const { statusAndMsgs } = require("../constants/constants");
const { logExceptions } = require("./logging-util");

const logWebExceptions = (err, req, res, next) => {
    if(err.code === 'ENOENT'){
        logExceptions(req, statusAndMsgs.MSG_FILE_NOT_FOUND);
        res.status(statusAndMsgs.STATUS_NOT_FOUND).json({"message" : statusAndMsgs.MSG_FILE_NOT_FOUND});
        return;
    }
    logExceptions(req, err.toString());
    res.status(statusAndMsgs.STATUS_SERVER_ERROR).json({"message" : statusAndMsgs.MSG_MAXINE_SERVER_ERROR});
}

module.exports = logWebExceptions;