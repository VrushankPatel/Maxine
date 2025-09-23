const { serviceRegistry } = require("../../entity/service-registry");
const { buildServiceNameCached } = require("../../util/util");

const dnsController = (req, res) => {
    const serviceName = req.query.serviceName;
    const version = req.query.version;
    const namespace = req.query.namespace || "default";
    const region = req.query.region || "default";
    const zone = req.query.zone || "default";

    if (!serviceName) {
        res.status(400).json({ message: "Missing serviceName" });
        return;
    }

    const fullServiceName = buildServiceNameCached(namespace, region, zone, serviceName, version);

    const nodes = serviceRegistry.getNodes(fullServiceName);
    if (!nodes) {
        res.status(404).json({ message: "Service not found" });
        return;
    }

    const srvRecords = Object.values(nodes)
        .filter(node => node.healthy)
        .map(node => {
            const url = new URL(node.address);
            return {
                name: serviceName,
                host: url.hostname,
                port: parseInt(url.port) || 80,
                priority: node.metadata.priority || 0,
                weight: node.weight || 1
            };
        });

    res.json({ srvRecords });
};

module.exports = dnsController;