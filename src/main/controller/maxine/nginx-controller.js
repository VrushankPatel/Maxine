const { serviceRegistry } = require('../../entity/service-registry');
const config = require('../../config/config');

const nginxConfigController = (req, res) => {
  const services = serviceRegistry.getRegServers();
  let nginxConfig = `events {
    worker_connections 1024;
}

http {
    upstream default_backend {
        server 127.0.0.1:8080;
    }

    server {
        listen 80;
        server_name localhost;

        location / {
            proxy_pass http://default_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

`;

  for (const [serviceName, serviceData] of Object.entries(services)) {
    const nodes = serviceData.nodes || {};
    const servers = [];

    for (const [nodeName, node] of Object.entries(nodes)) {
      if (node.healthy !== false) {
        const url = new URL(node.address);
        servers.push(
          `        server ${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)};`
        );
      }
    }

    if (servers.length > 0) {
      nginxConfig += `
    upstream ${serviceName}_backend {
${servers.join('\n')}
    }

    server {
        listen 80;
        server_name ${serviceName}.localhost;

        location / {
            proxy_pass http://${serviceName}_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

`;
    }
  }

  nginxConfig += `}
`;

  res.setHeader('Content-Type', 'text/plain');
  res.send(nginxConfig);
};

module.exports = nginxConfigController;
