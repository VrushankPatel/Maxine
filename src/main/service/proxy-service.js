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
    circuitBreakers = new Map();

    getCircuitBreaker = (nodeAddress) => {
        if (!this.circuitBreakers.has(nodeAddress)) {
            this.circuitBreakers.set(nodeAddress, {
                state: 'CLOSED',
                failureCount: 0,
                lastFailureTime: 0
            });
        }
        return this.circuitBreakers.get(nodeAddress);
    }

    checkCircuit = (nodeAddress) => {
        const cb = this.getCircuitBreaker(nodeAddress);
        const cooloff = constants.CIRCUIT_BREAKER_COOLOFF_MS || 10000;

        if (cb.state === 'OPEN') {
            if (Date.now() - cb.lastFailureTime > cooloff) {
                cb.state = 'HALF-OPEN';
                return true;
            }
            return false;
        }
        return true;
    }

    recordSuccess = (nodeAddress) => {
        const cb = this.getCircuitBreaker(nodeAddress);
        cb.state = 'CLOSED';
        cb.failureCount = 0;
    }

    recordFailure = (nodeAddress) => {
        const cb = this.getCircuitBreaker(nodeAddress);
        cb.failureCount++;
        cb.lastFailureTime = Date.now();
        const threshold = constants.CIRCUIT_BREAKER_FAILURE_THRESHOLD || 3;
        if (cb.failureCount >= threshold) {
            cb.state = 'OPEN';
        }
    }

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
        const nodeAddress = serviceNode.address;

        if (!this.checkCircuit(nodeAddress)) {
            res.status(503).json({
                message: "Service Unavailable: Circuit breaker is OPEN for this node."
            });
            return targetUrl;
        }

        let attempts = 0;
        const maxAttempts = constants.PROXY_RETRIES || 3;
        let lastError;
        let upstreamResponse;

        while (attempts < maxAttempts) {
            if (attempts > 0) {
                const delay = (constants.PROXY_RETRY_BACKOFF_MS || 100) * Math.pow(2, attempts - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            attempts++;

            try {
                upstreamResponse = await axios({
                    method: req.method,
                    url: targetUrl,
                    headers: this.sanitizeHeaders(req.headers, {
                        traceId: req.traceId,
                        traceparent: req.traceparent
                    }),
                    data: req.body && req.body.length ? req.body : undefined,
                    responseType: 'stream',
                    maxRedirects: 0,
                    timeout: constants.PROXY_TIMEOUT_MS || 5000,
                    validateStatus: () => true
                });

                if (upstreamResponse.status < 500) {
                    this.recordSuccess(nodeAddress);
                    res.status(upstreamResponse.status);
                    this.copyResponseHeaders(upstreamResponse.headers, res);
                    upstreamResponse.data.pipe(res);
                    return targetUrl;
                }

                this.recordFailure(nodeAddress);
                lastError = new Error(`Upstream returned status code: ${upstreamResponse.status}`);
            } catch (err) {
                this.recordFailure(nodeAddress);
                lastError = err;
            }
        }

        if (upstreamResponse && upstreamResponse.status >= 500) {
            res.status(upstreamResponse.status);
            this.copyResponseHeaders(upstreamResponse.headers, res);
            upstreamResponse.data.pipe(res);
            return targetUrl;
        }

        res.status(502).json({
            message: `Bad Gateway: ${lastError.message}`
        });
        return targetUrl;
    }
}

const proxyService = new ProxyService();

module.exports = {
    proxyService
};
