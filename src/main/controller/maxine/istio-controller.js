const { serviceRegistry } = require("../../entity/service-registry");
const config = require("../../config/config");

const istioConfigController = (req, res) => {
    const services = serviceRegistry.getRegServers();
    const serviceEntries = [];

    for (const [serviceName, serviceData] of Object.entries(services)) {
        const nodes = serviceData.nodes || {};
        const endpoints = [];

        for (const [nodeName, node] of Object.entries(nodes)) {
            if (node.healthy !== false) {
                const url = new URL(node.address);
                endpoints.push({
                    address: url.hostname,
                    ports: {
                        http: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80)
                    }
                });
            }
        }

        if (endpoints.length > 0) {
            serviceEntries.push({
                apiVersion: "networking.istio.io/v1beta1",
                kind: "ServiceEntry",
                metadata: {
                    name: serviceName,
                    namespace: "default"
                },
                spec: {
                    hosts: [`${serviceName}.local`],
                    ports: [{
                        number: 80,
                        name: "http",
                        protocol: "HTTP"
                    }],
                    resolution: "STATIC",
                    endpoints: endpoints
                }
            });
        }
    }

    res.json({ serviceEntries });
}

module.exports = istioConfigController