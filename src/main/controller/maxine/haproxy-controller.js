const { serviceRegistry } = require("../../entity/service-registry");
const config = require("../../config/config");

const haproxyConfigController = (req, res) => {
    const services = serviceRegistry.getRegServers();
    let haproxyConfig = `global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin expose-fd listeners
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

defaults
    log global
    mode http
    option httplog
    option dontlognull
    timeout connect 5000
    timeout client 50000
    timeout server 50000

frontend http_front
    bind *:80
    default_backend default_backend

backend default_backend
    server default 127.0.0.1:8080

`;

    for (const [serviceName, serviceData] of Object.entries(services)) {
        const nodes = serviceData.nodes || {};
        const servers = [];

        for (const [nodeName, node] of Object.entries(nodes)) {
            if (node.healthy !== false) {
                const url = new URL(node.address);
                servers.push(`    server ${nodeName} ${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)} check`);
            }
        }

        if (servers.length > 0) {
            haproxyConfig += `
backend ${serviceName}_backend
${servers.join('\n')}

`;
        }
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send(haproxyConfig);
}

module.exports = haproxyConfigController