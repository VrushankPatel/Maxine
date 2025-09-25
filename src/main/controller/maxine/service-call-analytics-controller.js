const { serviceRegistry } = require('../../entity/service-registry');

// Service Call Analytics Dashboard
const getServiceCallAnalytics = (req, res) => {
  try {
    const { serviceName, timeRange = 3600000 } = req.query; // Default 1 hour
    const now = Date.now();
    const cutoff = now - parseInt(timeRange);

    const callLogs = serviceRegistry.getCallLogs ? serviceRegistry.getCallLogs() : {};
    const analytics = {};

    // Process call logs
    for (const [caller, calls] of Object.entries(callLogs)) {
      if (serviceName && caller !== serviceName) continue;

      analytics[caller] = {
        totalCalls: 0,
        uniqueServices: new Set(),
        callFrequency: {},
        recentCalls: [],
        topCalledServices: [],
      };

      for (const [called, data] of calls) {
        if (data.lastSeen >= cutoff) {
          analytics[caller].totalCalls += data.count;
          analytics[caller].uniqueServices.add(called);

          // Call frequency (calls per minute)
          const minutesAgo = Math.floor((now - data.lastSeen) / 60000);
          if (!analytics[caller].callFrequency[minutesAgo]) {
            analytics[caller].callFrequency[minutesAgo] = 0;
          }
          analytics[caller].callFrequency[minutesAgo] += data.count;

          analytics[caller].recentCalls.push({
            calledService: called,
            count: data.count,
            lastSeen: data.lastSeen,
          });
        }
      }

      // Sort top called services
      analytics[caller].topCalledServices = analytics[caller].recentCalls
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      analytics[caller].uniqueServices = Array.from(analytics[caller].uniqueServices);
    }

    // Generate HTML dashboard
    const html = generateAnalyticsDashboardHTML(analytics, serviceName, timeRange);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error generating service call analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const generateAnalyticsDashboardHTML = (analytics, serviceName, timeRange) => {
  const services = Object.keys(analytics);
  const totalCalls = services.reduce((sum, svc) => sum + analytics[svc].totalCalls, 0);
  const totalServices = services.length;

  return `
<!DOCTYPE html>
<html>
<head>
    <title>Maxine Service Call Analytics</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stats { display: flex; gap: 20px; margin: 20px 0; }
        .stat-card { background: white; padding: 15px; border-radius: 8px; flex: 1; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .service-card { background: white; margin: 10px 0; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .chart { margin: 20px 0; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .call-graph { width: 100%; height: 400px; }
        .top-services { margin: 20px 0; }
        .service-link { stroke: #999; stroke-opacity: 0.6; }
        .service-node { fill: #69b3a2; }
        .service-node:hover { fill: #4a8b7a; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Maxine Service Call Analytics Dashboard</h1>
        <p>Real-time service communication analysis${serviceName ? ` for ${serviceName}` : ''}</p>
    </div>

    <div class="stats">
        <div class="stat-card">
            <h3>${totalServices}</h3>
            <p>Active Services</p>
        </div>
        <div class="stat-card">
            <h3>${totalCalls}</h3>
            <p>Total Calls (${timeRange / 3600000}h)</p>
        </div>
        <div class="stat-card">
            <h3>${(totalCalls / Math.max(timeRange / 3600000, 1)).toFixed(1)}</h3>
            <p>Calls per Hour</p>
        </div>
    </div>

    <div class="chart">
        <h2>Service Call Graph</h2>
        <svg class="call-graph" id="callGraph"></svg>
    </div>

    <div class="top-services">
        <h2>Service Details</h2>
        ${services
          .map(
            (service) => `
            <div class="service-card">
                <h3>${service}</h3>
                <div style="display: flex; gap: 20px; margin: 10px 0;">
                    <div><strong>Total Calls:</strong> ${analytics[service].totalCalls}</div>
                    <div><strong>Unique Services:</strong> ${analytics[service].uniqueServices.length}</div>
                </div>
                <div style="margin: 10px 0;">
                    <strong>Top Called Services:</strong>
                    <ul>
                        ${analytics[service].topCalledServices
                          .slice(0, 5)
                          .map(
                            (call) => `
                            <li>${call.calledService}: ${call.count} calls</li>
                        `
                          )
                          .join('')}
                    </ul>
                </div>
            </div>
        `
          )
          .join('')}
    </div>

    <script>
        const analytics = ${JSON.stringify(analytics)};

        // Create service call graph
        function createCallGraph() {
            const svg = d3.select('#callGraph');
            const width = svg.node().getBoundingClientRect().width;
            const height = 400;

            svg.attr('viewBox', [0, 0, width, height]);

            // Prepare data
            const nodes = [];
            const links = [];
            const serviceIndex = {};

            Object.keys(analytics).forEach((service, i) => {
                if (!serviceIndex[service]) {
                    serviceIndex[service] = nodes.length;
                    nodes.push({ id: service, group: 1 });
                }

                analytics[service].recentCalls.forEach(call => {
                    if (!serviceIndex[call.calledService]) {
                        serviceIndex[call.calledService] = nodes.length;
                        nodes.push({ id: call.calledService, group: 2 });
                    }

                    links.push({
                        source: serviceIndex[service],
                        target: serviceIndex[call.calledService],
                        value: Math.log(call.count + 1) * 2 // Log scale for better visualization
                    });
                });
            });

            // Create force simulation
            const simulation = d3.forceSimulation(nodes)
                .force('link', d3.forceLink(links).id(d => d.id).distance(100))
                .force('charge', d3.forceManyBody().strength(-300))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('x', d3.forceX(width / 2).strength(0.1))
                .force('y', d3.forceY(height / 2).strength(0.1));

            // Draw links
            const link = svg.append('g')
                .selectAll('line')
                .data(links)
                .enter().append('line')
                .attr('class', 'service-link')
                .attr('stroke-width', d => Math.sqrt(d.value));

            // Draw nodes
            const node = svg.append('g')
                .selectAll('circle')
                .data(nodes)
                .enter().append('circle')
                .attr('class', 'service-node')
                .attr('r', 8)
                .call(d3.drag()
                    .on('start', dragstarted)
                    .on('drag', dragged)
                    .on('end', dragended));

            // Add labels
            const label = svg.append('g')
                .selectAll('text')
                .data(nodes)
                .enter().append('text')
                .text(d => d.id)
                .attr('font-size', 10)
                .attr('dx', 12)
                .attr('dy', 4);

            simulation.on('tick', () => {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);

                node
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y);

                label
                    .attr('x', d => d.x)
                    .attr('y', d => d.y);
            });

            function dragstarted(event, d) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            }

            function dragged(event, d) {
                d.fx = event.x;
                d.fy = event.y;
            }

            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }
        }

        // Initialize
        if (Object.keys(analytics).length > 0) {
            createCallGraph();
        }
    </script>
</body>
</html>`;
};

module.exports = {
  getServiceCallAnalytics,
};
