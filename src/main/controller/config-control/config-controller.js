const { configService } = require("../../service/config-service");
const { statusAndMsgs } = require("../../util/constants/constants");

const setConfig = (req, res) => {
    const { serviceName, key, value, namespace, region, zone } = req.body;
    if (!serviceName || !key) {
        return res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "serviceName and key are required" });
    }
    configService.setConfig(serviceName, key, value, namespace, region, zone);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Config set successfully" });
};

const getConfig = (req, res) => {
    const { serviceName, key, namespace, region, zone } = req.query;
    if (!serviceName || !key) {
        return res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "serviceName and key are required" });
    }
    const value = configService.getConfig(serviceName, key, namespace, region, zone);
    if (value === null) {
        return res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: "Config not found" });
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ value });
};

const getAllConfig = (req, res) => {
    const { serviceName, namespace, region, zone } = req.query;
    if (!serviceName) {
        return res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "serviceName is required" });
    }
    const configs = configService.getAllConfig(serviceName, namespace, region, zone);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ configs });
};

const deleteConfig = (req, res) => {
    const { serviceName, key, namespace, region, zone } = req.body;
    if (!serviceName || !key) {
        return res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "serviceName and key are required" });
    }
    const deleted = configService.deleteConfig(serviceName, key, namespace, region, zone);
    if (!deleted) {
        return res.status(statusAndMsgs.STATUS_NOT_FOUND).json({ message: "Config not found" });
    }
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Config deleted successfully" });
};

module.exports = {
    setConfig,
    getConfig,
    getAllConfig,
    deleteConfig
};