const { statusAndMsgs } = require("../constants/constants");
const { logUtil } = require("./logging-util");

export const logWebExceptions = (err, req, res, next) => {
    if(err.code === 'ENOENT'){
        logUtil.logExceptions(req, statusAndMsgs.MSG_FILE_NOT_FOUND);
        res.status(statusAndMsgs.STATUS_NOT_FOUND).json({"message" : statusAndMsgs.MSG_FILE_NOT_FOUND});
        return;
    }
    const msg = err.message + err.stack.replace(/(\r\n|\n|\r)/gm, "");
    logUtil.logExceptions(req, msg);
    res.status(statusAndMsgs.STATUS_SERVER_ERROR).json({"message" : statusAndMsgs.MSG_MAXINE_SERVER_ERROR});
}