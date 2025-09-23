const { serviceRegistry } = require("../../entity/service-registry");
const { consoleError } = require("../../util/logging/logging-util");

const getDependencyGraph = (req, res) => {
    try {
        const graph = {};
        for (const [service, deps] of serviceRegistry.serviceDependencies) {
            graph[service] = Array.from(deps);
        }
        res.json(graph);
    } catch (err) {
        consoleError('Error getting dependency graph:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getImpactAnalysis = (req, res) => {
    const { serviceName } = req.query;
    if (!serviceName) {
        return res.status(400).json({ message: 'Missing serviceName' });
    }
    try {
        const dependents = serviceRegistry.getDependentServices(serviceName);
        res.json({ serviceName, impactedServices: dependents });
    } catch (err) {
        consoleError('Error getting impact analysis:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    getDependencyGraph,
    getImpactAnalysis
};