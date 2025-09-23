const { serviceRegistry } = require("../../entity/service-registry");
const config = require("../../config/config");

const opaPolicyController = (req, res) => {
    const services = serviceRegistry.getRegServers();
    const policies = [];

    for (const [serviceName, serviceData] of Object.entries(services)) {
        const nodes = serviceData.nodes || {};

        // Generate OPA policy for service access control
        const policy = {
            id: `maxine-${serviceName}-policy`,
            name: `Maxine ${serviceName} Access Policy`,
            description: `Policy for controlling access to ${serviceName} service`,
            rego: `
package maxine.${serviceName}

default allow = false

# Allow access if user has required role
allow {
    input.method = "GET"
    input.path = ["api", "maxine", "serviceops", "discover"]
    input.query.serviceName = "${serviceName}"
}

allow {
    input.method = "POST"
    input.path = ["api", "maxine", "serviceops", "register"]
    input.body.serviceName = "${serviceName}"
    input.user.roles[_] = "admin"
}

allow {
    input.method = "DELETE"
    input.path = ["api", "maxine", "serviceops", "deregister"]
    input.body.serviceName = "${serviceName}"
    input.user.roles[_] = "admin"
}

# Rate limiting based on user tier
max_requests_per_minute := 100 {
    input.user.tier = "basic"
}

max_requests_per_minute := 1000 {
    input.user.tier = "premium"
}

max_requests_per_minute := 10000 {
    input.user.tier = "enterprise"
}

# Service-specific rules
allow {
    input.serviceName = "${serviceName}"
    input.user.allowedServices[_] = "${serviceName}"
}

# Health check access
allow {
    input.method = "GET"
    input.path = ["api", "maxine", "serviceops", "health"]
    input.query.serviceName = "${serviceName}"
}

# Metrics access for monitoring
allow {
    input.method = "GET"
    input.path = ["api", "maxine", "serviceops", "metrics"]
    input.user.roles[_] = "monitor"
}
`,
            data: {
                serviceName: serviceName,
                nodes: Object.keys(nodes).length,
                healthyNodes: Object.values(nodes).filter(node => node.healthy !== false).length
            }
        };

        policies.push(policy);
    }

    res.json({
        policies: policies,
        globalPolicy: {
            id: "maxine-global-policy",
            name: "Maxine Global Access Policy",
            description: "Global policy for Maxine service registry",
            rego: `
package maxine.global

default allow = false

# Authentication required for all requests
allow {
    input.user.authenticated = true
}

# Admin operations require admin role
allow {
    input.user.roles[_] = "admin"
    admin_operations := {"POST", "PUT", "DELETE"}
    admin_operations[_] = input.method
}

# Read operations allowed for authenticated users
allow {
    input.method = "GET"
    input.user.authenticated = true
}

# Health and metrics endpoints publicly accessible
allow {
    input.path[0] = "api"
    input.path[1] = "actuator"
}

allow {
    input.path = ["api", "maxine", "serviceops", "health"]
}

allow {
    input.path = ["api", "maxine", "serviceops", "metrics"]
    input.user.roles[_] = "monitor"
}
`
        }
    });
};

module.exports = opaPolicyController;