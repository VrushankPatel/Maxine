const { serviceRegistry } = require('../../entity/service-registry');
const config = require('../../config/config');

const traefikConfigController = (req, res) => {
  const services = serviceRegistry.getRegServers();
  const routers = {};
  const servicesConfig = {};

  for (const [serviceName, serviceData] of Object.entries(services)) {
    const nodes = serviceData.nodes || {};
    const servers = [];

    for (const [nodeName, node] of Object.entries(nodes)) {
      if (node.healthy !== false) {
        servers.push({
          url: node.address,
        });
      }
    }

    if (servers.length > 0) {
      // Traefik service configuration
      servicesConfig[serviceName] = {
        loadBalancer: {
          servers: servers,
        },
      };

      // Traefik router configuration
      routers[`${serviceName}-router`] = {
        rule: `PathPrefix(\`/${serviceName}\`)`,
        service: serviceName,
        middlewares: [`${serviceName}-strip-prefix`],
      };

      // Middleware to strip prefix
      routers[`${serviceName}-middleware`] = {
        stripPrefix: {
          prefixes: [`/${serviceName}`],
        },
      };
    }
  }

  const traefikConfig = {
    http: {
      routers: routers,
      services: servicesConfig,
    },
  };

  res.json(traefikConfig);
};

module.exports = traefikConfigController;
