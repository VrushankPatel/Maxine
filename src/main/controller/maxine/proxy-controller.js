const _ = require('lodash');
const { statusAndMsgs } = require('../../util/constants/constants');
const { discoveryService } = require('../../service/discovery-service');
const { proxyService } = require('../../service/proxy-service');
const { observabilityService } = require('../../service/observability-service');
const { auditService } = require('../../service/audit-service');
const { info } = require('../../util/logging/logging-util');

const serviceProxyController = async (req, res, next) => {
    try {
        const serviceName = req.params.serviceName;
        const proxyPath = req.params[0] || '';
        const ip = req.ip
            || req.connection.remoteAddress
            || req.socket.remoteAddress
            || req.connection.socket.remoteAddress;

        if (!serviceName) {
            res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({
                message: statusAndMsgs.MSG_DISCOVER_MISSING_DATA
            });
            return;
        }

        const serviceNode = await discoveryService.getNode(serviceName, ip);
        if (_.isEmpty(serviceNode)) {
            res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
                message: statusAndMsgs.MSG_SERVICE_UNAVAILABLE
            });
            auditService.record('proxy.request', {
                outcome: 'MISS',
                serviceName,
                proxyPath,
                traceId: req.traceId
            });
            return;
        }

        observabilityService.recordDiscovery();
        observabilityService.recordProxyRequest();
        const targetUrl = await proxyService.proxyResolvedRequest(req, res, serviceNode, proxyPath, req.query);

        auditService.record('proxy.request', {
            outcome: 'PROXIED',
            serviceName,
            proxyPath,
            nodeName: serviceNode.nodeName,
            address: targetUrl,
            traceId: req.traceId
        });
        info(`Proxying to ${targetUrl}`);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    serviceProxyController
};
