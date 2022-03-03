const { httpStatus } = require("../constants/constants");
const { logExceptions } = require("./logging-util");

const logWebExceptions = (err, req, res, next) => {
    console.log(err);
    if(err.code === 'ENOENT'){
        logExceptions(req, httpStatus.MSG_FILE_NOT_FOUND);
        res.status(httpStatus.STATUS_NOT_FOUND).json({"message" : httpStatus.MSG_FILE_NOT_FOUND});
        return;
    }
    logExceptions(req, err.toString());
    res.status(httpStatus.STATUS_SERVER_ERROR).json({"message" : httpStatus.MSG_MAXINE_SERVER_ERROR});
}

module.exports = logWebExceptions;