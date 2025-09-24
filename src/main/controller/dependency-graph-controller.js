const { serviceRegistry } = require('../entity/service-registry');

const dependencyGraphController = (req, res) => {
    const graph = {};
    for (const [service, deps] of serviceRegistry.serviceDependencies) {
        graph[service] = Array.from(deps);
    }

    // Create reverse graph for dependents
    const dependents = {};
    for (const [service, deps] of serviceRegistry.serviceDependencies) {
        for (const dep of deps) {
            if (!dependents[dep]) dependents[dep] = new Set();
            dependents[dep].add(service);
        }
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Maxine Service Dependency Graph</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; text-align: center; }
        .container { max-width: 1200px; margin: 0 auto; }
        .controls { background: white; padding: 15px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 15px; }
        .stat { text-align: center; padding: 10px; background: #f8f9fa; border-radius: 5px; }
        .stat strong { display: block; font-size: 1.5em; color: #667eea; }
        svg { background: white; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .node { cursor: pointer; }
        .node circle { stroke: #fff; stroke-width: 2px; }
        .node text { font-size: 12px; text-anchor: middle; }
        .link { fill: none; stroke: #999; stroke-opacity: 0.6; stroke-width: 2px; }
        .info-panel { background: white; padding: 15px; border-radius: 10px; margin-top: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .cycle-alert { background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
        .impact-info { background: #d1ecf1; color: #0c5460; padding: 10px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Maxine Service Dependency Graph</h1>
            <p>Interactive visualization of service dependencies</p>
        </div>

        <div class="controls">
            <div class="stats">
                <div class="stat">
                    <strong>${Object.keys(graph).length}</strong>
                    Services with Dependencies
                </div>
                <div class="stat">
                    <strong>${Object.values(graph).reduce((sum, deps) => sum + deps.length, 0)}</strong>
                    Total Dependencies
                </div>
                <div class="stat">
                    <strong>${Object.keys(dependents).length}</strong>
                    Services with Dependents
                </div>
            </div>
            <button onclick="resetZoom()">Reset Zoom</button>
            <button onclick="detectCycles()">Detect Cycles</button>
            <button onclick="exportJSON()">Export JSON</button>
        </div>

        <svg id="graph" width="1000" height="600"></svg>

        <div id="info-panel" class="info-panel" style="display: none;"></div>
    </div>

    <script>
        const graphData = ${JSON.stringify(graph)};
        const dependentsData = ${JSON.stringify(Object.fromEntries(Object.entries(dependents).map(([k, v]) => [k, Array.from(v)])))};

        // Detect cycles in dependency graph
        function detectCycles() {
            const visited = new Set();
            const recStack = new Set();
            const cycles = [];

            function dfs(node, path = []) {
                if (recStack.has(node)) {
                    const cycleStart = path.indexOf(node);
                    cycles.push(path.slice(cycleStart).concat(node));
                    return;
                }

                if (visited.has(node)) return;

                visited.add(node);
                recStack.add(node);
                path.push(node);

                const deps = graphData[node] || [];
                for (const dep of deps) {
                    dfs(dep, [...path]);
                }

                recStack.delete(node);
                path.pop();
            }

            for (const node in graphData) {
                if (!visited.has(node)) {
                    dfs(node);
                }
            }

            const infoPanel = document.getElementById('info-panel');
            if (cycles.length > 0) {
                infoPanel.innerHTML = '<div class="cycle-alert"><strong>Circular Dependencies Detected:</strong><br>' +
                    cycles.map(cycle => cycle.join(' → ')).join('<br>') + '</div>';
            } else {
                infoPanel.innerHTML = '<div class="impact-info">No circular dependencies detected.</div>';
            }
            infoPanel.style.display = 'block';
        }

        // Create the graph
        const svg = d3.select('#graph');
        const width = 1000;
        const height = 600;

        const simulation = d3.forceSimulation()
            .force('link', d3.forceLink().id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2));

        // Prepare data
        const nodes = [];
        const links = [];
        const nodeMap = new Map();

        // Add nodes
        for (const service in graphData) {
            if (!nodeMap.has(service)) {
                nodeMap.set(service, { id: service, label: service });
                nodes.push(nodeMap.get(service));
            }
            const deps = graphData[service];
            for (const dep of deps) {
                if (!nodeMap.has(dep)) {
                    nodeMap.set(dep, { id: dep, label: dep });
                    nodes.push(nodeMap.get(dep));
                }
                links.push({ source: service, target: dep });
            }
        }

        // Add isolated nodes (services with dependents but no dependencies)
        for (const service in dependentsData) {
            if (!nodeMap.has(service)) {
                nodeMap.set(service, { id: service, label: service });
                nodes.push(nodeMap.get(service));
            }
        }

        // Create links
        const link = svg.append('g')
            .selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('class', 'link');

        // Create nodes
        const node = svg.append('g')
            .selectAll('g')
            .data(nodes)
            .enter().append('g')
            .attr('class', 'node')
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended));

        node.append('circle')
            .attr('r', d => Math.max(20, Math.min(40, d.label.length * 3)))
            .attr('fill', d => {
                const hasDeps = graphData[d.id] && graphData[d.id].length > 0;
                const hasDependents = dependentsData[d.id] && dependentsData[d.id].length > 0;
                if (hasDeps && hasDependents) return '#667eea';
                if (hasDeps) return '#28a745';
                if (hasDependents) return '#ffc107';
                return '#6c757d';
            });

        node.append('text')
            .text(d => d.label)
            .attr('dy', 4)
            .attr('font-size', '10px')
            .attr('text-anchor', 'middle');

        // Add click handler
        node.on('click', function(event, d) {
            const deps = graphData[d.id] || [];
            const depsOnThis = dependentsData[d.id] || [];

            const infoPanel = document.getElementById('info-panel');
            infoPanel.innerHTML = \`
                <div class="impact-info">
                    <strong>Service: \${d.id}</strong><br>
                    <strong>Dependencies:</strong> \${deps.length > 0 ? deps.join(', ') : 'None'}<br>
                    <strong>Dependents:</strong> \${depsOnThis.length > 0 ? depsOnThis.join(', ') : 'None'}<br>
                    <strong>Impact if removed:</strong> \${depsOnThis.length} services affected
                </div>
            \`;
            infoPanel.style.display = 'block';
        });

        simulation
            .nodes(nodes)
            .on('tick', ticked);

        simulation.force('link')
            .links(links);

        function ticked() {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node
                .attr('transform', d => \`translate(\${d.x},\${d.y})\`);
        }

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

        function resetZoom() {
            svg.transition().duration(500).call(
                d3.zoom().transform,
                d3.zoomIdentity
            );
        }

        function exportJSON() {
            const data = {
                dependencies: graphData,
                dependents: dependentsData,
                nodes: nodes.map(n => n.id),
                links: links
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'dependency-graph.json';
            a.click();
            URL.revokeObjectURL(url);
        }

        // Add zoom
        svg.call(d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', function(event) {
                svg.selectAll('g').attr('transform', event.transform);
            }));

        // Initial cycle detection
        detectCycles();
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
};

module.exports = dependencyGraphController;