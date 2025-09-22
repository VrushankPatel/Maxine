const { statusAndMsgs } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const { metricsService } = require("../../service/metrics-service");
const _ = require('lodash');
const { info } = require("../../util/logging/logging-util");
const httpProxy = require('http-proxy');

const http = require('http');
const https = require('https');
const proxy = httpProxy.createProxyServer({
    agent: new http.Agent({ keepAlive: true, maxSockets: 100 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 100 })
});

proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    if (!res.headersSent) {
        res.status(502).json({ message: 'Bad Gateway' });
    }
});

const discoveryController = (req, res) => {
    const startTime = Date.now();
    // Retrieving the serviceName from query params
    const serviceName = req.query.serviceName;
    const endPoint = req.query.endPoint || "";
    const ip = req.ip
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;

    // if serviceName is not there, responding with error
    if(!serviceName) {
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('missing_service_name');
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
        return;
    }

    // now, retrieving the serviceNode from the registry
    const serviceNode = discoveryService.getNode(serviceName, ip);

    // no service node is there so, service unavailable is our error response.
    if(_.isEmpty(serviceNode)){
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('service_unavailable');
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
            "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
        });
        return;
    }
    const addressToRedirect = serviceNode.address + (endPoint.length > 0 ? (endPoint[0] == "/" ? endPoint : `/${endPoint}`) : "");
    info(`Proxying to ${addressToRedirect}`);

    try {
        proxy.web(req, res, { target: addressToRedirect, changeOrigin: true });
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, true, latency);
    } catch (err) {
        console.error('Proxy setup error:', err);
        const latency = Date.now() - startTime;
        metricsService.recordRequest(serviceName, false, latency);
        metricsService.recordError('proxy_error');
        res.status(500).json({ message: 'Proxy Error' });
    }
}

module.exports = discoveryController