const { serviceRegistry } = require("../../entity/service-registry");
const config = require("../../config/config");

const linkerdConfigController = (req, res) => {
    const services = serviceRegistry.getRegServers();
    const serviceProfiles = [];

    for (const [serviceName, serviceData] of Object.entries(services)) {
        const routes = [];

        // Add default route
        routes.push({
            name: "default",
            condition: {
                method: null,
                pathRegex: null,
                all: true
            },
            responseClasses: [{
                condition: {
                    status: {
                        min: 500,
                        max: 599
                    }
                },
                isFailure: true
            }]
        });

        serviceProfiles.push({
            apiVersion: "linkerd.io/v1alpha2",
            kind: "ServiceProfile",
            metadata: {
                name: serviceName,
                namespace: "default"
            },
            spec: {
                routes: routes
            }
        });
    }

    res.json({ serviceProfiles });
}

module.exports = linkerdConfigController