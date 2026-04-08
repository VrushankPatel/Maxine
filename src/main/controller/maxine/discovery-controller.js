const { statusAndMsgs, constants } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const config = require("../../config/config");
const _ = require('lodash');
const { info } = require("../../util/logging/logging-util");
const { proxyService } = require("../../service/proxy-service");
const { observabilityService } = require("../../service/observability-service");
const { auditService } = require("../../service/audit-service");

const discoveryController = async (req, res, next) => {
    try {
        const serviceName = req.query.serviceName;
        const endPoint = req.query.endPoint || "";
        const ip = req.ip
        || req.connection.remoteAddress
        || req.socket.remoteAddress
        || req.connection.socket.remoteAddress;

        if(!serviceName) {
            res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
            return;
        }

        const serviceNode = await discoveryService.getNode(serviceName, ip);

        if(_.isEmpty(serviceNode)){
            res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
                "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
            });
            auditService.record('discovery.lookup', {
                outcome: 'MISS',
                serviceName,
                method: req.method,
                traceId: req.traceId
            });
            return;
        }

        observabilityService.recordDiscovery();
        auditService.record('discovery.lookup', {
            outcome: 'HIT',
            serviceName,
            nodeName: serviceNode.nodeName,
            address: serviceNode.address,
            mode: req.query.mode || config.discoveryMode.message.toLowerCase(),
            traceId: req.traceId
        });

        if ((req.query.mode || '').toLowerCase() === 'proxy'
            || config.discoveryMode === constants.DISCOVERY_MODES.PROXY) {
            observabilityService.recordProxyRequest();
            const targetUrl = await proxyService.proxyResolvedRequest(req, res, serviceNode, endPoint);
            info(`Proxying to ${targetUrl}`);
            return;
        }

        const addressToRedirect = serviceNode.address + (endPoint.length > 0 ? (endPoint[0] == "/" ? endPoint : `/${endPoint}`) : "");
        info(`Redirecting to ${addressToRedirect}`);
        res.redirect(addressToRedirect);
    } catch (err) {
        next(err);
    }
}

module.exports = discoveryController
