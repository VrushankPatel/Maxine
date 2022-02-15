const { httpStatus } = require("../../util/constants/constants");

const controlController = (req, res) => {    
    res.status(httpStatus.STATUS_SUCCESS).json({"message" : httpStatus.MSG_SUCCESS_SHUTDOWN});
    process.exit();
}

module.exports = controlController;