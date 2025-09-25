const { serviceRegistry } = require('../../entity/service-registry');
const config = require('../../config/config');

const appMeshConfigController = (req, res) => {
  const services = serviceRegistry.getRegServers();
  const meshName = req.query.meshName || 'maxine-mesh';
  const virtualServices = [];
  const virtualNodes = [];
  const virtualRouters = [];
  const routes = [];

  for (const [serviceName, serviceData] of Object.entries(services)) {
    const nodes = serviceData.nodes || {};
    const backends = [];

    for (const [nodeName, node] of Object.entries(nodes)) {
      if (node.healthy !== false) {
        const url = new URL(node.address);
        const virtualNodeName = `${serviceName}-${nodeName.replace(/[^a-zA-Z0-9-]/g, '-')}`;

        virtualNodes.push({
          meshName: meshName,
          virtualNodeName: virtualNodeName,
          spec: {
            listeners: [
              {
                portMapping: {
                  port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
                  protocol: url.protocol === 'https:' ? 'http' : 'http',
                },
              },
            ],
            serviceDiscovery: {
              dns: {
                hostname: url.hostname,
              },
            },
          },
        });

        backends.push({
          virtualService: {
            virtualServiceName: `${serviceName}.maxine.local`,
          },
        });
      }
    }

    if (backends.length > 0) {
      // Virtual Router
      virtualRouters.push({
        meshName: meshName,
        virtualRouterName: `${serviceName}-router`,
        spec: {
          listeners: [
            {
              portMapping: {
                port: 80,
                protocol: 'http',
              },
            },
          ],
        },
      });

      // Route
      routes.push({
        meshName: meshName,
        virtualRouterName: `${serviceName}-router`,
        routeName: `${serviceName}-route`,
        spec: {
          httpRoute: {
            match: {
              prefix: '/',
            },
            action: {
              weightedTargets: backends.map((backend, index) => ({
                virtualNode: backend.virtualService.virtualServiceName.replace(
                  '.maxine.local',
                  `-${index}`
                ),
                weight: 1,
              })),
            },
          },
        },
      });

      // Virtual Service
      virtualServices.push({
        meshName: meshName,
        virtualServiceName: `${serviceName}.maxine.local`,
        spec: {
          provider: {
            virtualRouter: {
              virtualRouterName: `${serviceName}-router`,
            },
          },
        },
      });
    }
  }

  const appMeshConfig = {
    virtualServices: virtualServices,
    virtualNodes: virtualNodes,
    virtualRouters: virtualRouters,
    routes: routes,
  };

  res.json(appMeshConfig);
};

module.exports = appMeshConfigController;
