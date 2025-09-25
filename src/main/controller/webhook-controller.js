const { serviceRegistry } = require('../entity/service-registry');
const { statusAndMsgs } = require('../util/constants/constants');

const addWebhook = (req, res) => {
  const { serviceName, url } = req.body;
  if (!serviceName || !url) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName and url are required' });
  }
  serviceRegistry.addWebhook(serviceName, url);
  res.status(200).json({ message: 'Webhook added successfully' });
};

const removeWebhook = (req, res) => {
  const { serviceName, url } = req.body;
  if (!serviceName || !url) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName and url are required' });
  }
  serviceRegistry.removeWebhook(serviceName, url);
  res.status(200).json({ message: 'Webhook removed successfully' });
};

const getWebhooks = (req, res) => {
  const serviceName = req.query.serviceName;
  if (!serviceName) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName is required' });
  }
  const webhooks = serviceRegistry.getWebhooks(serviceName);
  res.status(200).json({ webhooks });
};

module.exports = {
  addWebhook,
  removeWebhook,
  getWebhooks,
};
