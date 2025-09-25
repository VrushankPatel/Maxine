const { statusAndMsgs } = require('../constants/constants');
const { logExceptions } = require('./logging-util');

const logWebExceptions = (err, req, res, _) => {
  if (err && err.code === 'ENOENT') {
    logExceptions(req, statusAndMsgs.MSG_FILE_NOT_FOUND);
    if (!res.headersSent) {
      res
        .status(statusAndMsgs.STATUS_NOT_FOUND)
        .json({ message: statusAndMsgs.MSG_FILE_NOT_FOUND });
    }
    return;
  }
  if (err) {
    logExceptions(req, err.toString());
  }
  if (!res.headersSent) {
    res
      .status(statusAndMsgs.STATUS_SERVER_ERROR)
      .json({ message: statusAndMsgs.MSG_MAXINE_SERVER_ERROR });
  }
};

module.exports = logWebExceptions;
