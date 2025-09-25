const { User, admin } = require('../../entity/user');
const { statusAndMsgs, constants } = require('../../util/constants/constants');
const { error, info } = require('../../util/logging/logging-util');
const user = require('../../entity/user');

const changePwdController = (req, res) => {
  const { password, newPassword } = req.body;
  info(JSON.stringify(user.admin));
  if (!password || !newPassword) {
    error(statusAndMsgs.MSG_MISSING_UNAME_PWD);
    res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: statusAndMsgs.MSG_MISSING_PWD });
    return;
  }
  if (
    new User(constants.DEFAULT_ADMIN_USERNAME_PWD, password).userName === admin.userName &&
    new User(constants.DEFAULT_ADMIN_USERNAME_PWD, password).password === admin.password
  ) {
    admin.password = newPassword;
    res.status(200).json({ message: 'successfully updated password' });
    return;
  }
  res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: statusAndMsgs.MSG_MISSING_PWD });
};

module.exports = {
  changePwdController,
};
