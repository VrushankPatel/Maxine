const { serviceRegistry } = require("../../entity/service-registry");
const config = require("../../config/config");

const kubernetesIngressController = (req, res) => {
    const services = serviceRegistry.getRegServers();
    const ingressRules = [];
    const backendServices = [];

    for (const [serviceName, serviceData] of Object.entries(services)) {
        const nodes = serviceData.nodes || {};
        const healthyNodes = [];

        for (const [nodeName, node] of Object.entries(nodes)) {
            if (node.healthy !== false) {
                healthyNodes.push(node);
            }
        }

        if (healthyNodes.length > 0) {
            // Assume first node for simplicity, or use load balancer
            const node = healthyNodes[0];
            const url = new URL(node.address);

            ingressRules.push({
                host: `${serviceName}.example.com`, // Placeholder, can be customized
                http: {
                    paths: [{
                        path: `/${serviceName}`,
                        pathType: "Prefix",
                        backend: {
                            service: {
                                name: serviceName,
                                port: {
                                    number: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80)
                                }
                            }
                        }
                    }]
                }
            });

            backendServices.push({
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: serviceName,
                    namespace: "default"
                },
                spec: {
                    selector: {
                        app: serviceName // Placeholder selector
                    },
                    ports: [{
                        protocol: "TCP",
                        port: parseInt(url.port) || 80,
                        targetPort: parseInt(url.port) || 80
                    }]
                }
            });
        }
    }

    const ingress = {
        apiVersion: "networking.k8s.io/v1",
        kind: "Ingress",
        metadata: {
            name: "maxine-ingress",
            namespace: "default",
            annotations: {
                "nginx.ingress.kubernetes.io/rewrite-target": "/"
            }
        },
        spec: {
            rules: ingressRules
        }
    };

    res.json({
        ingress: ingress,
        services: backendServices
    });
};

module.exports = kubernetesIngressController;