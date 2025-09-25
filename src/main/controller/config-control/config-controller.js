const { configService } = require('../../service/config-service');
const { statusAndMsgs } = require('../../util/constants/constants');
const { audit } = require('../../util/logging/logging-util');

const setConfig = (req, res) => {
  const { serviceName, key, value, namespace, region, zone } = req.body;
  if (!serviceName || !key) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName and key are required' });
  }
  configService.setConfig(serviceName, key, value, namespace, region, zone);
  audit(
    `CONFIG_SET: service ${serviceName} key ${key} value ${JSON.stringify(value)} namespace ${namespace} region ${region} zone ${zone}`
  );
  res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: 'Config set successfully' });
};

const getConfig = (req, res) => {
  const { serviceName, key, namespace, region, zone } = req.query;
  if (!serviceName || !key) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName and key are required' });
  }
  const value = configService.getConfig(serviceName, key, namespace, region, zone);
  if (value === null) {
    return res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: 'Config not found' });
  }
  res.status(statusAndMsgs.STATUS_SUCCESS).json({ value });
};

const getAllConfig = (req, res) => {
  const { serviceName, namespace, region, zone } = req.query;
  if (!serviceName) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName is required' });
  }
  const configs = configService.getAllConfig(serviceName, namespace, region, zone);
  res.status(statusAndMsgs.STATUS_SUCCESS).json({ configs });
};

const deleteConfig = (req, res) => {
  const { serviceName, key, namespace, region, zone } = req.body;
  if (!serviceName || !key) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName and key are required' });
  }
  const deleted = configService.deleteConfig(serviceName, key, namespace, region, zone);
  if (!deleted) {
    return res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: 'Config not found' });
  }
  audit(
    `CONFIG_DELETE: service ${serviceName} key ${key} namespace ${namespace} region ${region} zone ${zone}`
  );
  res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: 'Config deleted successfully' });
};

const watchConfig = (req, res) => {
  const { serviceName, namespace, region, zone } = req.query;
  if (!serviceName) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName is required' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  const listener = (event, data) => {
    if (
      data.serviceName === serviceName &&
      (namespace ? data.namespace === namespace : true) &&
      (region ? data.region === region : true) &&
      (zone ? data.zone === zone : true)
    ) {
      res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
    }
  };

  if (global.eventEmitter) {
    global.eventEmitter.on('config_changed', listener);
    global.eventEmitter.on('config_deleted', listener);
  }

  req.on('close', () => {
    if (global.eventEmitter) {
      global.eventEmitter.off('config_changed', listener);
      global.eventEmitter.off('config_deleted', listener);
    }
    res.end();
  });
};

module.exports = {
  setConfig,
  getConfig,
  getAllConfig,
  deleteConfig,
  watchConfig,
};
