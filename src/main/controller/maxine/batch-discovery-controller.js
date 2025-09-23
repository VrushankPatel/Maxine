const { statusAndMsgs } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const { metricsService } = require("../../service/metrics-service");
const { serviceRegistry } = require("../../entity/service-registry");
const { info } = require("../../util/logging/logging-util");
const config = require("../../config/config");

const batchDiscoveryController = (req, res) => {
    const startTime = Date.now();
    const ip = req.clientIp || (req.clientIp = req.ip
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress);

    const services = req.body.services; // array of {serviceName, version?, namespace?, region?, zone?, endPoint?}

    if (!Array.isArray(services) || services.length === 0) {
        if (config.metricsEnabled && !config.highPerformanceMode) {
            const latency = Date.now() - startTime;
            metricsService.recordRequest('batch_discovery', false, latency);
        }
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message": "Invalid or missing services array"});
        return;
    }

    const results = [];
    let hasErrors = false;

    for (const serviceReq of services) {
        const { serviceName, version, namespace = "default", region = "default", zone = "default", endPoint = "" } = serviceReq;

        if (!serviceName) {
            results.push({ serviceName: serviceReq.serviceName || 'unknown', error: 'Missing serviceName' });
            hasErrors = true;
            continue;
        }

        let fullServiceName = (region !== "default" || zone !== "default") ?
            (version ? `${namespace}:${region}:${zone}:${serviceName}:${version}` : `${namespace}:${region}:${zone}:${serviceName}`) :
            (version ? `${namespace}:${serviceName}:${version}` : `${namespace}:${serviceName}`);

        // Handle traffic splitting if no version specified
        if (!version) {
            const baseServiceName = (region !== "default" || zone !== "default") ?
                `${namespace}:${region}:${zone}:${serviceName}` : `${namespace}:${serviceName}`;
            const split = serviceRegistry.getTrafficSplit(baseServiceName);
            if (split) {
                const versions = Object.keys(split);
                const total = Object.values(split).reduce((a, b) => a + b, 0);
                let rand = Math.random() * total;
                for (const v of versions) {
                    rand -= split[v];
                    if (rand <= 0) {
                        version = v;
                        fullServiceName = (region !== "default" || zone !== "default") ?
                            `${namespace}:${region}:${zone}:${serviceName}:${version}` : `${namespace}:${serviceName}:${version}`;
                        break;
                    }
                }
            }
        }

        const serviceNode = discoveryService.getNode(fullServiceName, ip);

        if (!serviceNode) {
            results.push({ serviceName, error: statusAndMsgs.MSG_SERVICE_UNAVAILABLE });
            hasErrors = true;
        } else {
            const addressToRedirect = serviceNode.address + (endPoint.length > 0 ? (endPoint[0] == "/" ? endPoint : `/${endPoint}`) : "");
            results.push({
                serviceName,
                address: addressToRedirect,
                nodeName: serviceNode.nodeName
            });
        }
    }

    const success = !hasErrors;
    if (config.metricsEnabled && !config.highPerformanceMode) {
        const latency = Date.now() - startTime;
        metricsService.recordRequest('batch_discovery', success, latency);
    }
    res.json({ results });
}

module.exports = batchDiscoveryController