const { buildSchema } = require('graphql');
const { serviceRegistry } = require('../entity/service-registry');
const { discoveryService } = require('../service/discovery-service');

const schema = buildSchema(`
  type ServiceNode {
    nodeName: String
    address: String
    metadata: String
  }

  type Service {
    serviceName: String
    nodes: [ServiceNode]
  }

  type Mutation {
    register(serviceName: String!, nodeName: String!, address: String!, metadata: String): String
    deregister(serviceName: String!, nodeName: String!): String
  }

  type Query {
    services: [Service]
    service(serviceName: String!): Service
    discover(serviceName: String!, ip: String, group: String, tags: [String], deployment: String, filter: String): ServiceNode
  }
`);

const root = {
  services: () => {
    const services = [];
    for (const [serviceName, service] of serviceRegistry.registry) {
      services.push({
        serviceName,
        nodes: Object.values(service.nodes)
      });
    }
    return services;
  },
  service: ({ serviceName }) => {
    const service = serviceRegistry.registry.get(serviceName);
    if (!service) return null;
    return {
      serviceName,
      nodes: Object.values(service.nodes)
    };
  },
  discover: ({ serviceName, ip, group, tags, deployment, filter }) => {
    const filterObj = filter ? JSON.parse(filter) : undefined;
    return discoveryService.getNode(serviceName, ip || 'unknown', group, tags, deployment, filterObj);
  },
  register: ({ serviceName, nodeName, address, metadata }) => {
    const metadataObj = metadata ? JSON.parse(metadata) : {};
    serviceRegistry.registry.get(serviceName) || serviceRegistry.registry.set(serviceName, { nodes: {}, createdAt: Date.now() });
    serviceRegistry.registry.get(serviceName).nodes[nodeName] = { address, metadata: metadataObj, healthy: true, registeredAt: Date.now() };
    serviceRegistry.addToHealthyNodes(serviceName, nodeName);
    serviceRegistry.addChange('register', serviceName, nodeName, { address, metadata: metadataObj });
    return 'Service registered';
  },
  deregister: ({ serviceName, nodeName }) => {
    serviceRegistry.removeFromHealthyNodes(serviceName, nodeName);
    const service = serviceRegistry.registry.get(serviceName);
    if (service && service.nodes[nodeName]) {
      delete service.nodes[nodeName];
      if (Object.keys(service.nodes).length === 0) {
        serviceRegistry.registry.delete(serviceName);
      }
      serviceRegistry.addChange('deregister', serviceName, nodeName, {});
    }
    return 'Service deregistered';
  }
};

module.exports = { schema, root };