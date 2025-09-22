const { statusAndMsgs } = require("../../util/constants/constants");
const { discoveryService } = require("../../service/discovery-service");
const _ = require('lodash');
const { info } = require("../../util/logging/logging-util");
const { URL } = require('url');
const http = require('http');
const https = require('https');

const discoveryController = (req, res) => {
    // Retrieving the serviceName from query params
    const serviceName = req.query.serviceName;
    const endPoint = req.query.endPoint || "";
    const ip = req.ip
    || req.connection.remoteAddress
    || req.socket.remoteAddress
    || req.connection.socket.remoteAddress;

    // if serviceName is not there, responding with error
    if(!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_DISCOVER_MISSING_DATA});
        return;
    }

    // now, retrieving the serviceNode from the registry
    const serviceNode = discoveryService.getNode(serviceName, ip);
  
    // no service node is there so, service unavailable is our error response.
    if(_.isEmpty(serviceNode)){
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({
            "message" : statusAndMsgs.MSG_SERVICE_UNAVAILABLE
        });
        return;
    }
    const addressToRedirect = serviceNode.address + (endPoint.length > 0 ? (endPoint[0] == "/" ? endPoint : `/${endPoint}`) : "");
    info(`Proxying to ${addressToRedirect}`);

    try {
        const targetUrl = new URL(addressToRedirect);
        const options = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            method: req.method,
            headers: { ...req.headers, host: targetUrl.host }
        };
        // Remove content-length to let it recalculate
        delete options.headers['content-length'];

        const client = targetUrl.protocol === 'https:' ? https : http;
        const proxyReq = client.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        req.pipe(proxyReq);

        proxyReq.on('error', (err) => {
            console.error('Proxy error:', err);
            res.status(502).json({ message: 'Bad Gateway' });
        });
    } catch (err) {
        console.error('URL parse error:', err);
        res.status(500).json({ message: 'Invalid URL' });
    }
}

module.exports = discoveryController