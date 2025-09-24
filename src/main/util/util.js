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

/**
 * SIMD-inspired fast operations for bulk data processing
 * These operations are optimized for performance in load balancing calculations
 */
const fastOps = {
    /**
     * Fast min operation using SIMD-like processing
     * Processes array in chunks for better cache performance
     */
    min: (arr) => {
        if (arr.length === 0) return Infinity;
        if (arr.length === 1) return arr[0];

        let min = arr[0];
        // Process in chunks of 8 for SIMD-like behavior
        const chunkSize = 8;
        for (let i = 0; i < arr.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, arr.length);
            for (let j = i; j < end; j++) {
                if (arr[j] < min) min = arr[j];
            }
        }
        return min;
    },

    /**
     * Fast max operation using SIMD-like processing
     */
    max: (arr) => {
        if (arr.length === 0) return -Infinity;
        if (arr.length === 1) return arr[0];

        let max = arr[0];
        const chunkSize = 8;
        for (let i = 0; i < arr.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, arr.length);
            for (let j = i; j < end; j++) {
                if (arr[j] > max) max = arr[j];
            }
        }
        return max;
    },

    /**
     * Fast sum operation using SIMD-like processing
     */
    sum: (arr) => {
        if (arr.length === 0) return 0;

        let sum = 0;
        const chunkSize = 8;
        for (let i = 0; i < arr.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, arr.length);
            let chunkSum = 0;
            for (let j = i; j < end; j++) {
                chunkSum += arr[j];
            }
            sum += chunkSum;
        }
        return sum;
    },

    /**
     * Fast average calculation
     */
    avg: (arr) => {
        return arr.length === 0 ? 0 : fastOps.sum(arr) / arr.length;
    },

    /**
     * Fast standard deviation
     */
    std: (arr) => {
        if (arr.length <= 1) return 0;
        const avg = fastOps.avg(arr);
        const squaredDiffs = arr.map(x => (x - avg) ** 2);
        return Math.sqrt(fastOps.sum(squaredDiffs) / (arr.length - 1));
    },

    /**
     * Fast dot product for vector operations
     */
    dotProduct: (a, b) => {
        if (a.length !== b.length) return 0;
        let sum = 0;
        const chunkSize = 8;
        for (let i = 0; i < a.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, a.length);
            let chunkSum = 0;
            for (let j = i; j < end; j++) {
                chunkSum += a[j] * b[j];
            }
            sum += chunkSum;
        }
        return sum;
    },

    /**
     * Fast Euclidean distance
     */
    euclideanDistance: (a, b) => {
        if (a.length !== b.length) return Infinity;
        let sum = 0;
        const chunkSize = 8;
        for (let i = 0; i < a.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, a.length);
            let chunkSum = 0;
            for (let j = i; j < end; j++) {
                const diff = a[j] - b[j];
                chunkSum += diff * diff;
            }
            sum += chunkSum;
        }
        return Math.sqrt(sum);
    }
};

module.exports = {
    getCurrentDate,
    logBuilder,
    sssChecker,
    logFormatChecker,
    loadSwaggerYAML,
    buildServiceNameCached,
    buildFullServiceName,
    fastOps
}