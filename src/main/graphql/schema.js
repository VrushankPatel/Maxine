const { makeExecutableSchema } = require('@graphql-tools/schema');
const { PubSub, withFilter } = require('graphql-subscriptions');
const { serviceRegistry } = require('../entity/service-registry');
const { discoveryService } = require('../service/discovery-service');

const pubsub = new PubSub();

// Listen to global events and publish to GraphQL subscriptions
if (global.eventEmitter) {
  global.eventEmitter.on('service_registered', (data) => {
    pubsub.publish('SERVICE_EVENT', { serviceEvents: { event: 'register', serviceName: data.serviceName, nodeName: data.nodeName, data: JSON.stringify(data) } });
  });
  global.eventEmitter.on('service_deregistered', (data) => {
    pubsub.publish('SERVICE_EVENT', { serviceEvents: { event: 'deregister', serviceName: data.serviceName, nodeName: data.nodeName, data: JSON.stringify(data) } });
  });
  // Add more events as needed
}

const typeDefs = `
  type ServiceNode {
    nodeName: String
    address: String
    metadata: String
  }

  type Service {
    serviceName: String
    nodes: [ServiceNode]
  }

  type ServiceEvent {
    event: String
    serviceName: String
    nodeName: String
    data: String
  }

  type Mutation {
    register(serviceName: String!, nodeName: String!, address: String!, metadata: String): String
    deregister(serviceName: String!, nodeName: String!): String
  }

  type HealthScore {
    nodeId: String
    score: Float
  }

  type Query {
    services(filter: ServiceFilter, sort: ServiceSort): [Service]
    service(serviceName: String!): Service
    discover(serviceName: String!, ip: String, group: String, tags: [String], deployment: String, filter: String): ServiceNode
    healthScores(serviceName: String!): [HealthScore]
  }

  input ServiceFilter {
    serviceName: String
    hasNodes: Boolean
  }

  enum ServiceSort {
    NAME_ASC
    NAME_DESC
    NODE_COUNT_ASC
    NODE_COUNT_DESC
  }

  type Subscription {
    serviceEvents(serviceName: String): ServiceEvent
  }
`;

const resolvers = {
  Query: {
    services: (_, { filter, sort }) => {
      let services = [];
      for (const [serviceName, service] of serviceRegistry.registry) {
        const serviceObj = {
          serviceName,
          nodes: Object.values(service.nodes)
        };
        if (filter) {
          if (filter.serviceName && !serviceName.includes(filter.serviceName)) continue;
          if (filter.hasNodes !== undefined && (serviceObj.nodes.length > 0) !== filter.hasNodes) continue;
        }
        services.push(serviceObj);
      }
      if (sort) {
        services.sort((a, b) => {
          switch (sort) {
            case 'NAME_ASC':
              return a.serviceName.localeCompare(b.serviceName);
            case 'NAME_DESC':
              return b.serviceName.localeCompare(a.serviceName);
            case 'NODE_COUNT_ASC':
              return a.nodes.length - b.nodes.length;
            case 'NODE_COUNT_DESC':
              return b.nodes.length - a.nodes.length;
            default:
              return 0;
          }
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
    discover: async ({ serviceName, ip, group, tags, deployment, filter }) => {
      const filterObj = filter ? JSON.parse(filter) : undefined;
      return await discoveryService.getNode(serviceName, ip || 'unknown', group, tags, deployment, filterObj);
    },
    healthScores: ({ serviceName }) => {
      const scores = serviceRegistry.getHealthScores(serviceName);
      return Object.entries(scores).map(([nodeId, score]) => ({ nodeId, score }));
    }
  },
  Mutation: {
    register: ({ serviceName, nodeName, address, metadata }) => {
      const metadataObj = metadata ? JSON.parse(metadata) : {};
      serviceRegistry.registry.get(serviceName) || serviceRegistry.registry.set(serviceName, { nodes: {}, createdAt: Date.now() });
      serviceRegistry.registry.get(serviceName).nodes[nodeName] = { address, metadata: metadataObj, healthy: true, registeredAt: Date.now() };
      serviceRegistry.addToHealthyNodes(serviceName, nodeName);
      serviceRegistry.addChange('register', serviceName, nodeName, { address, metadata: metadataObj });
      pubsub.publish('SERVICE_EVENT', { serviceEvents: { event: 'register', serviceName, nodeName, data: JSON.stringify({ address, metadata: metadataObj }) } });
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
        pubsub.publish('SERVICE_EVENT', { serviceEvents: { event: 'deregister', serviceName, nodeName, data: '{}' } });
      }
      return 'Service deregistered';
    }
  },
  Subscription: {
    serviceEvents: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['SERVICE_EVENT']),
        (payload, variables) => {
          return !variables.serviceName || payload.serviceEvents.serviceName === variables.serviceName;
        }
      )
    }
  }
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

module.exports = { schema, root: resolvers };