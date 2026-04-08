const crypto = require('crypto');
const { constants } = require('../constants/constants');

const randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex');

const buildTraceParent = () => `00-${randomHex(16)}-${randomHex(8)}-01`;

const traceContext = (req, res, next) => {
    const incomingTraceId = req.headers[constants.TRACE_HEADER_NAME];
    const incomingTraceParent = req.headers.traceparent;

    req.traceId = incomingTraceId || randomHex(16);
    req.traceparent = incomingTraceParent || buildTraceParent();
    req.startedAt = process.hrtime.bigint();

    res.setHeader(constants.TRACE_HEADER_NAME, req.traceId);
    res.setHeader('traceparent', req.traceparent);

    next();
};

module.exports = traceContext;
