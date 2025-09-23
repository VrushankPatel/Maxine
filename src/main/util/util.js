// const date = require('date-and-time');
const JsonBuilder = require('../builders/json-builder');
const config = require('../config/config');
const { constants } = require('./constants/constants');
// const YAML = require('yamljs');
const { LRUCache } = require('lru-cache');

const getCurrentDate = () => new Date().toISOString();

/**
 * Below object contains method to check ServerSelectionStrategy.
 */
const sssChecker = {
    isRoundRobin: () => config.serverSelectionStrategy === constants.SSS.RR,
    isConsistentHashing: () => config.serverSelectionStrategy === constants.SSS.CH,
    isRendezvousHashing: () => config.serverSelectionStrategy === constants.SSS.RH
}

const logFormatChecker = {
    isJsonFormat: () => config.logFormat === constants.LOG_FORMATS.JSON,
    isPlainFormat: () => config.logFormat === constants.LOG_FORMATS.PLAIN
}

function jsonLogBuilder(logLevel, logType, statusAndMsgs, req, msg = ""){
    const logObj = {
        LogLevel: logLevel,
        LogType: logType,
        Timestamp: getCurrentDate()
    };
    if (statusAndMsgs !== null && statusAndMsgs !== undefined) {
        logObj.Status = statusAndMsgs;
    }
    if (msg) {
        logObj.Message = msg;
    }
    if (req) {
        logObj.Method = req.method;
        logObj.ClientIp = req.ip;
        logObj.Endpoint = req.originalUrl;
        logObj.HTTPVersion = req.httpVersion;
    }
    return JSON.stringify(logObj);
}

function plainLogBuilder(logLevel, logType, statusAndMsgs, req, msg = ""){
    let log = `【${logLevel}】-`;
    log = log.concat(`【${logType}】`);
    if(statusAndMsgs) log = log.concat(`| ${statusAndMsgs} `);
    if(req){
        log = log
                .concat(`| ${req.method} |`)
                .concat(` ${req.ip} |`)
                .concat(` [ ${req.originalUrl} ] |`)
                .concat(` HTTP/${req.httpVersion} |`);
    }
    if(msg) log = log.concat(` | ${JSON.stringify(msg)} |`);
    log = log.concat(` [ ${new Date().toUTCString()} ] `);
    return log;
}

const logBuilder = (...args) => {
    return logFormatChecker.isJsonFormat() ? jsonLogBuilder(...args) : plainLogBuilder(...args);
};

const loadSwaggerYAML = () => {
    // Swagger not available
    return null;
}

// Cache for service name building
const serviceNameCache = new LRUCache({ max: config.highPerformanceMode ? 1000000 : 200000, ttl: 900000 }); // 15 min TTL, optimized for memory

const buildServiceNameCached = (tenantId, namespace, region, zone, serviceName, version) => {
    const key = `${tenantId}:${namespace}:${region}:${zone}:${serviceName}:${version || ''}`;
    if (serviceNameCache.has(key)) {
        return serviceNameCache.get(key);
    }
    const tenantPrefix = tenantId !== "default" ? `${tenantId}:` : '';
    const fullServiceName = (region !== "default" || zone !== "default") ?
        (version ? `${tenantPrefix}${namespace}:${region}:${zone}:${serviceName}:${version}` : `${tenantPrefix}${namespace}:${region}:${zone}:${serviceName}`) :
        (version ? `${tenantPrefix}${namespace}:${serviceName}:${version}` : `${tenantPrefix}${namespace}:${serviceName}`);
    serviceNameCache.set(key, fullServiceName);
    return fullServiceName;
};

const buildFullServiceName = (serviceName, namespace = "default", datacenter = "default", version) => {
    if (datacenter !== "default") {
        if (version) {
            return `${datacenter}:${namespace}:${serviceName}:${version}`;
        }
        return `${datacenter}:${namespace}:${serviceName}`;
    }
    if (version) {
        return `${namespace}:${serviceName}:${version}`;
    }
    return `${namespace}:${serviceName}`;
};

module.exports = {
    getCurrentDate,
    logBuilder,
    sssChecker,
    logFormatChecker,
    loadSwaggerYAML,
    buildServiceNameCached,
    buildFullServiceName
}