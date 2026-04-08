const axios = require('axios');
const { constants } = require('../util/constants/constants');

const hopByHopHeaders = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
    'content-length'
]);

class ProxyService {
    buildTargetUrl = (serviceNode, pathSuffix = "", query = {}) => {
        const upstreamUrl = new URL(serviceNode.address);
        const basePath = upstreamUrl.pathname.replace(/\/$/, '');
        const suffix = pathSuffix ? `/${pathSuffix.replace(/^\//, '')}` : '';
        upstreamUrl.pathname = `${basePath}${suffix}` || '/';

        const searchParams = new URLSearchParams(upstreamUrl.search);
        Object.entries(query).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                value.forEach((entry) => searchParams.append(key, entry));
                return;
            }

            if (typeof value !== 'undefined' && value !== null) {
                searchParams.set(key, value);
            }
        });

        upstreamUrl.search = searchParams.toString();
        return upstreamUrl.toString();
    }

    sanitizeHeaders = (headers = {}, traceContext = {}) => {
        const nextHeaders = {};
        Object.entries(headers).forEach(([headerName, value]) => {
            if (!hopByHopHeaders.has(headerName.toLowerCase())) {
                nextHeaders[headerName] = value;
            }
        });

        nextHeaders[constants.TRACE_HEADER_NAME] = traceContext.traceId;
        nextHeaders.traceparent = traceContext.traceparent;

        return nextHeaders;
    }

    copyResponseHeaders = (sourceHeaders = {}, res) => {
        Object.entries(sourceHeaders).forEach(([headerName, value]) => {
            if (!hopByHopHeaders.has(headerName.toLowerCase())) {
                res.setHeader(headerName, value);
            }
        });
    }

    proxyResolvedRequest = async (req, res, serviceNode, pathSuffix = "", query = {}) => {
        const targetUrl = this.buildTargetUrl(serviceNode, pathSuffix, query);
        const upstreamResponse = await axios({
            method: req.method,
            url: targetUrl,
            headers: this.sanitizeHeaders(req.headers, {
                traceId: req.traceId,
                traceparent: req.traceparent
            }),
            data: req.body && req.body.length ? req.body : undefined,
            responseType: 'stream',
            maxRedirects: 0,
            validateStatus: () => true
        });

        res.status(upstreamResponse.status);
        this.copyResponseHeaders(upstreamResponse.headers, res);
        upstreamResponse.data.pipe(res);
        return targetUrl;
    }
}

const proxyService = new ProxyService();

module.exports = {
    proxyService
};
