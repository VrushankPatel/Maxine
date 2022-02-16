const { httpStatus } = require("../../util/constants/constants");

const shutdownController = (req, res) => {    
    res.status(httpStatus.STATUS_SUCCESS).json({"message" : httpStatus.MSG_SUCCESS_SHUTDOWN});
    process.exit();
}

const malformedUrlsController = (req, res) => res.status(httpStatus.STATUS_NOT_FOUND).json({"message": httpStatus.MSG_NOT_FOUND})

module.exports = {
    shutdownController,
    malformedUrlsController
};