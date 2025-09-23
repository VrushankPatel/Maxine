const { serviceRegistry } = require('../../entity/service-registry');
const { statusAndMsgs } = require('../../util/constants/constants');
const { buildServiceNameCached } = require('../../util/util');

const databaseDiscoveryController = (req, res) => {
    const serviceName = req.query.serviceName;
    const namespace = req.query.namespace || 'default';
    const version = req.query.version;

    if (!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: 'Missing serviceName' });
        return;
    }

    const fullServiceName = buildServiceNameCached(namespace, 'default', 'default', serviceName, version);
    const nodes = serviceRegistry.getNodes(fullServiceName);

    if (!nodes || Object.keys(nodes).length === 0) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: 'Database service not found' });
        return;
    }

    // Filter nodes that are databases
    const databaseNodes = Object.values(nodes).filter(node => node.metadata && node.metadata.type === 'database');

    if (databaseNodes.length === 0) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: 'No database nodes found for this service' });
        return;
    }

    // Simple round-robin for databases
    const service = serviceRegistry.registry.get(fullServiceName);
    if (!service) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: 'Service not found' });
        return;
    }
    const offset = service.databaseOffset || 0;
    service.databaseOffset = (offset + 1) % databaseNodes.length;
    const selectedNode = databaseNodes[offset];

    res.status(statusAndMsgs.STATUS_SUCCESS).json({
        serviceName,
        namespace,
        database: {
            host: selectedNode.metadata.host || selectedNode.address,
            port: selectedNode.metadata.port || 3306,
            database: selectedNode.metadata.database || 'default',
            username: selectedNode.metadata.username,
            password: selectedNode.metadata.password,
            type: selectedNode.metadata.dbType || 'mysql'
        }
    });
};

module.exports = databaseDiscoveryController;