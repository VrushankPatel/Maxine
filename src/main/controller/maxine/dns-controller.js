const { serviceRegistry } = require("../../entity/service-registry");
const { buildServiceNameCached } = require("../../util/util");
const { Packet } = require('dns2');

let dnsServer = null;

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

// DNS Server implementation
const startDNSServer = (port = 53) => {
    if (dnsServer) {
        return;
    }

    const { UDPClient, UDPServer } = require('dns2');

    dnsServer = new UDPServer((request, send, client) => {
        const response = Packet.createResponseFromRequest(request);
        const [question] = request.questions;
        const domain = question.name;

        // Handle SRV records for service discovery
        // Format: _service._tcp.namespace.region.zone
        const srvMatch = domain.match(/^_([^.]+)\._tcp\.([^.]+)\.([^.]+)\.([^.]+)$/);
        if (srvMatch) {
            const [, serviceName, namespace, region, zone] = srvMatch;
            const fullServiceName = buildServiceNameCached(namespace, region, zone, serviceName);

            const nodes = serviceRegistry.getNodes(fullServiceName);
            if (nodes) {
                const healthyNodes = Object.values(nodes).filter(node => node.healthy);
                healthyNodes.forEach((node, index) => {
                    const url = new URL(node.address);
                    response.answers.push({
                        name: domain,
                        type: Packet.TYPE.SRV,
                        class: Packet.CLASS.IN,
                        ttl: 300,
                        priority: node.metadata.priority || 0,
                        weight: node.weight || 1,
                        port: parseInt(url.port) || 80,
                        target: url.hostname
                    });
                });
            }
        }

        // Handle A records for direct IP resolution
        const aMatch = domain.match(/^([^.]+)\.([^.]+)\.([^.]+)\.([^.]+)$/);
        if (aMatch) {
            const [, serviceName, namespace, region, zone] = aMatch;
            const fullServiceName = buildServiceNameCached(namespace, region, zone, serviceName);

            const nodes = serviceRegistry.getNodes(fullServiceName);
            if (nodes) {
                const healthyNodes = Object.values(nodes).filter(node => node.healthy);
                if (healthyNodes.length > 0) {
                    // Return the first healthy node's IP
                    const node = healthyNodes[0];
                    const url = new URL(node.address);
                    response.answers.push({
                        name: domain,
                        type: Packet.TYPE.A,
                        class: Packet.CLASS.IN,
                        ttl: 300,
                        address: url.hostname
                    });
                }
            }
        }

        send(response);
    });

    dnsServer.listen(port);

    dnsServer.on('error', (err) => {
        console.error('DNS server error:', err);
    });
};

const stopDNSServer = () => {
    if (dnsServer) {
        dnsServer.close();
        dnsServer = null;
    }
};

module.exports = {
    dnsController,
    startDNSServer,
    stopDNSServer
};