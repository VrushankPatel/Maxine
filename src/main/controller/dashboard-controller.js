const { serviceRegistry } = require('../entity/service-registry');
const config = require('../config/config');

const dashboardController = (req, res) => {
  const services = serviceRegistry.getRegServers();
  const serviceCount = Object.keys(services).length;
  let totalNodes = 0;
  let healthyNodes = 0;
  let unhealthyNodes = 0;
  for (const serviceName in services) {
    const nodes = services[serviceName].nodes;
    totalNodes += Object.keys(nodes).length;
    for (const nodeName in nodes) {
      if (nodes[nodeName].healthy) healthyNodes++;
      else unhealthyNodes++;
    }
  }
  const cacheStats = serviceRegistry.discoveryService
    ? {
        cacheHits: serviceRegistry.discoveryService.cacheHits || 0,
        cacheMisses: serviceRegistry.discoveryService.cacheMisses || 0,
        cacheSize: serviceRegistry.discoveryService.cache.size || 0,
      }
    : { cacheHits: 0, cacheMisses: 0, cacheSize: 0 };

  // Get recent events for display
  const recentEvents = serviceRegistry.getRecentEvents ? serviceRegistry.getRecentEvents(10) : [];

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maxine Service Registry Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .stat { background: white; border: 1px solid #ddd; padding: 20px; border-radius: 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat h3 { margin: 0 0 10px 0; color: #333; }
        .stat p { font-size: 2em; margin: 0; font-weight: bold; color: #667eea; }
        .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .chart-container { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .services { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .service { border: 1px solid #eee; margin-bottom: 15px; padding: 15px; border-radius: 8px; background: #fafafa; }
        .node { margin: 5px 0 5px 20px; padding: 5px; border-radius: 4px; }
        .healthy { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .unhealthy { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .maintenance { background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
        .draining { background-color: #cce7ff; color: #004085; border: 1px solid #b3d7ff; }
        .events { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .event { margin-bottom: 10px; padding: 10px; border-left: 4px solid #667eea; background: #f8f9fa; }
        .status-indicator { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 10px; }
        .status-connected { background-color: #28a745; }
        .status-disconnected { background-color: #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Maxine Service Registry Advanced Dashboard</h1>
        <div id="connection-status">
            <span class="status-indicator status-disconnected"></span>
            WebSocket: Disconnected
        </div>
    </div>

    <div class="stats">
        <div class="stat">
            <h3>Total Services</h3>
            <p id="serviceCount">${serviceCount}</p>
        </div>
        <div class="stat">
            <h3>Total Nodes</h3>
            <p id="totalNodes">${totalNodes}</p>
        </div>
        <div class="stat">
            <h3>Healthy Nodes</h3>
            <p id="healthyNodes">${healthyNodes}</p>
        </div>
        <div class="stat">
            <h3>Unhealthy Nodes</h3>
            <p id="unhealthyNodes">${unhealthyNodes}</p>
        </div>
        <div class="stat">
            <h3>Cache Hits</h3>
            <p id="cacheHits">${cacheStats.cacheHits}</p>
        </div>
        <div class="stat">
            <h3>Cache Misses</h3>
            <p id="cacheMisses">${cacheStats.cacheMisses}</p>
        </div>
    </div>

    <div class="charts">
        <div class="chart-container">
            <h3>Node Health Distribution</h3>
            <canvas id="healthChart"></canvas>
        </div>
        <div class="chart-container">
            <h3>Cache Performance</h3>
            <canvas id="cacheChart"></canvas>
        </div>
    </div>

    <div class="services">
        <h2>Services & Nodes</h2>
        <div id="servicesList">
            ${Object.entries(services)
              .map(
                ([serviceName, service]) => `
                <div class="service">
                    <h3>${serviceName}</h3>
                    <div>Nodes:</div>
                     ${Object.entries(service.nodes)
                       .map(([nodeName, node]) => {
                         let status = 'unhealthy';
                         let statusText = 'Unhealthy';
                         if (node.healthy) {
                           if (serviceRegistry.isInMaintenance(serviceName, nodeName)) {
                             status = 'maintenance';
                             statusText = 'Maintenance';
                           } else if (serviceRegistry.isInDraining(serviceName, nodeName)) {
                             status = 'draining';
                             statusText = 'Draining';
                           } else {
                             status = 'healthy';
                             statusText = 'Healthy';
                           }
                         }
                         return `<div class="node ${status}">
                             ${nodeName}: ${node.address} (${statusText})
                         </div>`;
                       })
                       .join('')}
                </div>
            `
              )
              .join('')}
        </div>
    </div>

    <div class="events">
        <h2>Recent Events</h2>
        <div id="eventsList">
            ${recentEvents
              .map(
                (event) => `
                <div class="event">
                    <strong>${event.event}</strong> - ${event.data ? JSON.stringify(event.data) : ''} <small>(${new Date(event.timestamp).toLocaleString()})</small>
                </div>
            `
              )
              .join('')}
        </div>
    </div>

    <script>
        let ws;
        let healthChart, cacheChart;
        const maxDataPoints = 20;
        const healthData = { healthy: [], unhealthy: [], timestamps: [] };
        const cacheData = { hits: [], misses: [], timestamps: [] };

        function initCharts() {
            const healthCtx = document.getElementById('healthChart').getContext('2d');
            healthChart = new Chart(healthCtx, {
                type: 'line',
                data: {
                    labels: healthData.timestamps,
                    datasets: [{
                        label: 'Healthy Nodes',
                        data: healthData.healthy,
                        borderColor: 'rgb(40, 167, 69)',
                        backgroundColor: 'rgba(40, 167, 69, 0.1)',
                        tension: 0.1
                    }, {
                        label: 'Unhealthy Nodes',
                        data: healthData.unhealthy,
                        borderColor: 'rgb(220, 53, 69)',
                        backgroundColor: 'rgba(220, 53, 69, 0.1)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });

            const cacheCtx = document.getElementById('cacheChart').getContext('2d');
            cacheChart = new Chart(cacheCtx, {
                type: 'line',
                data: {
                    labels: cacheData.timestamps,
                    datasets: [{
                        label: 'Cache Hits',
                        data: cacheData.hits,
                        borderColor: 'rgb(0, 123, 255)',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        tension: 0.1
                    }, {
                        label: 'Cache Misses',
                        data: cacheData.misses,
                        borderColor: 'rgb(255, 193, 7)',
                        backgroundColor: 'rgba(255, 193, 7, 0.1)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = \`\${protocol}//\${window.location.host}\`;

            ws = new WebSocket(wsUrl);

            ws.onopen = function(event) {
                document.getElementById('connection-status').innerHTML = '<span class="status-indicator status-connected"></span> WebSocket: Connected';
            };

            ws.onmessage = function(event) {
                const data = JSON.parse(event.data);
                if (data.event === 'stats_update') {
                    updateStats(data.stats);
                    updateCharts(data.stats);
                } else if (data.event === 'service_registered' || data.event === 'service_deregistered' || data.event === 'service_heartbeat' || data.event === 'service_unhealthy') {
                    addEvent(data);
                }
            };

            ws.onclose = function(event) {
                document.getElementById('connection-status').innerHTML = '<span class="status-indicator status-disconnected"></span> WebSocket: Disconnected';
                setTimeout(connectWebSocket, 5000);
            };

            ws.onerror = function(error) {
                console.error('WebSocket error:', error);
            };
        }

        function updateStats(stats) {
            document.getElementById('serviceCount').textContent = stats.serviceCount;
            document.getElementById('totalNodes').textContent = stats.totalNodes;
            document.getElementById('healthyNodes').textContent = stats.healthyNodes;
            document.getElementById('unhealthyNodes').textContent = stats.unhealthyNodes;
            document.getElementById('cacheHits').textContent = stats.cacheHits;
            document.getElementById('cacheMisses').textContent = stats.cacheMisses;
            document.getElementById('servicesList').innerHTML = generateServicesHTML(stats.services);
        }

        function generateServicesHTML(services) {
            return Object.entries(services).map(([serviceName, service]) => \`
                <div class="service">
                    <h3>\${serviceName}</h3>
                    <div>Nodes:</div>
                    \${Object.entries(service.nodes).map(([nodeName, node]) => {
                        let status = 'unhealthy';
                        let statusText = 'Unhealthy';
                        if (node.healthy) {
                            status = 'healthy';
                            statusText = 'Healthy';
                        }
                        return \`<div class="node \${status}">
                            \${nodeName}: \${node.address} (\${statusText})
                        </div>\`;
                    }).join('')}
                </div>
            \`).join('');
        }

        function updateCharts(stats) {
            const now = new Date().toLocaleTimeString();

            healthData.timestamps.push(now);
            healthData.healthy.push(stats.healthyNodes);
            healthData.unhealthy.push(stats.unhealthyNodes);

            cacheData.timestamps.push(now);
            cacheData.hits.push(stats.cacheHits);
            cacheData.misses.push(stats.cacheMisses);

            if (healthData.timestamps.length > maxDataPoints) {
                healthData.timestamps.shift();
                healthData.healthy.shift();
                healthData.unhealthy.shift();
                cacheData.timestamps.shift();
                cacheData.hits.shift();
                cacheData.misses.shift();
            }

            healthChart.update();
            cacheChart.update();
        }

        function addEvent(event) {
            const eventsList = document.getElementById('eventsList');
            const eventDiv = document.createElement('div');
            eventDiv.className = 'event';
            eventDiv.innerHTML = \`<strong>\${event.event}</strong> - \${event.data ? JSON.stringify(event.data) : ''} <small>(\${new Date(event.timestamp).toLocaleString()})</small>\`;
            eventsList.insertBefore(eventDiv, eventsList.firstChild);

            // Keep only last 10 events
            while (eventsList.children.length > 10) {
                eventsList.removeChild(eventsList.lastChild);
            }
        }

        // Initialize
        initCharts();
        connectWebSocket();

        // Fallback polling every 30 seconds if WebSocket fails
        setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                location.reload();
            }
        }, 30000);
    </script>
</body>
</html>
    `;
  res.send(html);
};

module.exports = dashboardController;
