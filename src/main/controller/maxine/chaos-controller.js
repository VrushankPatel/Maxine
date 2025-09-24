const config = require('../../config/config');
const registry = require('../entity/service-registry');

const injectLatency = (req, res) => {
    const { serviceName, delay } = req.body;
    if (!serviceName || !delay) {
        return res.status(400).json({ error: 'serviceName and delay required' });
    }
    // Inject latency for service discovery
    // This is a simple implementation - in real chaos engineering, you'd use proxies
    registry.injectLatency(serviceName, parseInt(delay));
    res.json({ success: true, message: `Latency ${delay}ms injected for ${serviceName}` });
};

const injectFailure = (req, res) => {
    const { serviceName, rate } = req.body;
    if (!serviceName || rate === undefined) {
        return res.status(400).json({ error: 'serviceName and rate required' });
    }
    registry.injectFailure(serviceName, parseFloat(rate));
    res.json({ success: true, message: `Failure rate ${rate} injected for ${serviceName}` });
};

const resetChaos = (req, res) => {
    const { serviceName } = req.body;
    registry.resetChaos(serviceName);
    res.json({ success: true, message: 'Chaos reset' });
};

const getChaosStatus = (req, res) => {
    const status = registry.getChaosStatus();
    res.json(status);
};

module.exports = {
    injectLatency,
    injectFailure,
    resetChaos,
    getChaosStatus
};