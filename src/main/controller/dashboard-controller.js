const { serviceRegistry } = require('../entity/service-registry');
const config = require('../config/config');

const dashboardController = (req, res) => {
    const services = serviceRegistry.getRegServers();
    const serviceCount = Object.keys(services).length;
    let totalNodes = 0;
    let healthyNodes = 0;
    for (const serviceName in services) {
        const nodes = services[serviceName].nodes;
        totalNodes += Object.keys(nodes).length;
        for (const nodeName in nodes) {
            if (nodes[nodeName].healthy) healthyNodes++;
        }
    }
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maxine Service Registry Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .stats { display: flex; gap: 20px; margin-bottom: 20px; }
        .stat { border: 1px solid #ccc; padding: 10px; border-radius: 5px; }
        .services { margin-top: 20px; }
        .service { border: 1px solid #ccc; margin-bottom: 10px; padding: 10px; border-radius: 5px; }
        .node { margin-left: 20px; }
        .healthy { color: green; }
        .unhealthy { color: red; }
    </style>
</head>
<body>
    <h1>Maxine Service Registry Dashboard</h1>
    <div class="stats">
        <div class="stat">
            <h3>Total Services</h3>
            <p>${serviceCount}</p>
        </div>
        <div class="stat">
            <h3>Total Nodes</h3>
            <p>${totalNodes}</p>
        </div>
        <div class="stat">
            <h3>Healthy Nodes</h3>
            <p>${healthyNodes}</p>
        </div>
        <div class="stat">
            <h3>High Performance Mode</h3>
            <p>${config.highPerformanceMode ? 'Enabled' : 'Disabled'}</p>
        </div>
    </div>
    <div class="services">
        <h2>Services</h2>
        ${Object.entries(services).map(([serviceName, service]) => `
            <div class="service">
                <h3>${serviceName}</h3>
                <div>Nodes:</div>
                ${Object.entries(service.nodes).map(([nodeName, node]) => `
                    <div class="node ${node.healthy ? 'healthy' : 'unhealthy'}">
                        ${nodeName}: ${node.address} (${node.healthy ? 'Healthy' : 'Unhealthy'})
                    </div>
                `).join('')}
            </div>
        `).join('')}
    </div>
    <script>
        setInterval(() => {
            location.reload();
        }, 30000); // Refresh every 30 seconds
    </script>
</body>
</html>
    `;
    res.send(html);
};

module.exports = dashboardController;