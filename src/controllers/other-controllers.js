const { httpStatus } = require("../util/constants/constants");
const { closeApp } = require("../util/util");

const malformedUrlsController = (req, res) => res.status(httpStatus.STATUS_NOT_FOUND).json({"message": httpStatus.MSG_NOT_FOUND})

module.exports = {
    shutdownController,
    malformedUrlsController
};