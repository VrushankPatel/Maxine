const { makeExecutableSchema } = require('@graphql-tools/schema');
const { PubSub, withFilter } = require('graphql-subscriptions');
const { serviceRegistry } = require('../entity/service-registry');
const { discoveryService } = require('../service/discovery-service');

// Use lightning registry if available
const registry = global.serviceRegistry || serviceRegistry;

const pubsub = new PubSub();

// Listen to global events and publish to GraphQL subscriptions
if (global.eventEmitter) {
  global.eventEmitter.on('service_registered', (data) => {
    pubsub.publish('SERVICE_EVENT', {
      serviceEvents: {
        event: 'register',
        serviceName: data.serviceName,
        nodeName: data.nodeName,
        data: JSON.stringify(data),
      },
    });
  });
  global.eventEmitter.on('service_deregistered', (data) => {
    pubsub.publish('SERVICE_EVENT', {
      serviceEvents: {
        event: 'deregister',
        serviceName: data.serviceName,
        nodeName: data.nodeName,
        data: JSON.stringify(data),
      },
    });
  });
  global.eventEmitter.on('service_unhealthy', (data) => {
    pubsub.publish('SERVICE_EVENT', {
      serviceEvents: {
        event: 'unhealthy',
        serviceName: data.serviceName,
        nodeName: data.nodeId,
        data: JSON.stringify(data),
      },
    });
  });
  global.eventEmitter.on('circuit_open', (data) => {
    pubsub.publish('CIRCUIT_BREAKER_EVENT', {
      circuitBreakerEvents: { event: 'open', nodeId: data.nodeId, data: JSON.stringify(data) },
    });
  });
  global.eventEmitter.on('circuit_closed', (data) => {
    pubsub.publish('CIRCUIT_BREAKER_EVENT', {
      circuitBreakerEvents: { event: 'closed', nodeId: data.nodeId, data: JSON.stringify(data) },
    });
  });
  global.eventEmitter.on('config_changed', (data) => {
    pubsub.publish('CONFIG_EVENT', {
      configEvents: {
        event: 'changed',
        serviceName: data.serviceName,
        key: data.key,
        data: JSON.stringify(data),
      },
    });
  });
  // Add more events as needed
}

const typeDefs = `
  type ServiceNode {
    nodeName: String
    address: String
    metadata: String
    healthy: Boolean
    weight: Int
    connections: Int
  }

  type Service {
    serviceName: String
    nodes: [ServiceNode]
    versions: [String]
  }

  type ServiceEvent {
    event: String
    serviceName: String
    nodeName: String
    data: String
  }

  type CircuitBreakerEvent {
    event: String
    nodeId: String
    data: String
  }

  type ConfigEvent {
    event: String
    serviceName: String
    key: String
    data: String
  }

  type Anomaly {
    serviceName: String
    type: String
    value: Float
    threshold: Float
    severity: String
  }

  type HealthPrediction {
    nodeId: String
    currentScore: Float
    predictedScore: Float
    trend: Float
    predictedResponseTime: Float
  }

  type DependencyGraph {
    service: String
    dependsOn: [String]
  }

  type Mutation {
    register(serviceName: String!, nodeName: String!, address: String!, metadata: String): String
    deregister(serviceName: String!, nodeName: String!): String
    setTrafficDistribution(serviceName: String!, distribution: String!): String
    addDependency(serviceName: String!, dependsOn: String!): String
    removeDependency(serviceName: String!, dependsOn: String!): String
  }

  type HealthScore {
    nodeId: String
    score: Float
  }

  type Query {
    services(filter: ServiceFilter, sort: ServiceSort): [Service]
    service(serviceName: String!): Service
    discover(serviceName: String!, ip: String, group: String, tags: [String], deployment: String, filter: String, loadBalancing: String): ServiceNode
    healthScores(serviceName: String!): [HealthScore]
    anomalies: [Anomaly]
    predictHealth(serviceName: String!, window: Int): [HealthPrediction]
    dependencyGraph: [DependencyGraph]
    versions(serviceName: String!): [String]
  }

  input ServiceFilter {
    serviceName: String
    hasNodes: Boolean
    tags: [String]
  }

  enum ServiceSort {
    NAME_ASC
    NAME_DESC
    NODE_COUNT_ASC
    NODE_COUNT_DESC
  }

  type Subscription {
    serviceEvents(serviceName: String): ServiceEvent
    circuitBreakerEvents: CircuitBreakerEvent
    configEvents(serviceName: String): ConfigEvent
  }
 `;

const resolvers = {
  Query: {
    services: (_, { filter, sort }) => {
      const services = [];
      const registryData = registry.getAllServices
        ? registry.getAllServices()
        : serviceRegistry.registry;
      for (const [serviceName, service] of registryData) {
        const nodes = service.nodes
          ? Array.from(service.nodes.values())
          : Object.values(service.nodes || {});
        const serviceObj = {
          serviceName,
          nodes: nodes.map((n) => ({
            ...n,
            healthy: true,
            weight: n.weight || 1,
            connections: n.connections || 0,
          })),
          versions: registry.getVersions ? registry.getVersions(serviceName) : [],
        };
        if (filter) {
          if (filter.serviceName && !serviceName.includes(filter.serviceName)) continue;
          if (filter.hasNodes !== undefined && serviceObj.nodes.length > 0 !== filter.hasNodes)
            continue;
          if (filter.tags && filter.tags.length > 0) {
            const hasTags = serviceObj.nodes.some(
              (n) =>
                n.metadata &&
                n.metadata.tags &&
                filter.tags.some((t) => n.metadata.tags.includes(t))
            );
            if (!hasTags) continue;
          }
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
      const service = registry.getAllServices
        ? registry.getAllServices().get(serviceName)
        : serviceRegistry.registry.get(serviceName);
      if (!service) return null;
      const nodes = service.nodes
        ? Array.from(service.nodes.values())
        : Object.values(service.nodes || {});
      return {
        serviceName,
        nodes: nodes.map((n) => ({
          ...n,
          healthy: true,
          weight: n.weight || 1,
          connections: n.connections || 0,
        })),
        versions: registry.getVersions ? registry.getVersions(serviceName) : [],
      };
    },
    discover: async ({ serviceName, ip, group, tags, deployment, filter, loadBalancing }) => {
      const options = {
        version: filter ? JSON.parse(filter).version : undefined,
        loadBalancing: loadBalancing || 'round-robin',
        tags,
        ip,
      };
      const node = await registry.discover(serviceName, options);
      if (!node) return null;
      return {
        nodeName: node.nodeName,
        address: node.address,
        metadata: JSON.stringify(node.metadata || {}),
        healthy: true,
        weight: node.weight || 1,
        connections: node.connections || 0,
      };
    },
    healthScores: ({ serviceName }) => {
      const scores = registry.getHealthScores ? registry.getHealthScores(serviceName) : {};
      return Object.entries(scores).map(([nodeId, score]) => ({ nodeId, score }));
    },
    anomalies: () => {
      return registry.getAnomalies ? registry.getAnomalies() : [];
    },
    predictHealth: ({ serviceName, window }) => {
      const predictions = registry.predictServiceHealth
        ? registry.predictServiceHealth(serviceName, window)
        : {};
      return Object.entries(predictions).map(([nodeId, pred]) => ({ nodeId, ...pred }));
    },
    dependencyGraph: () => {
      const graph = registry.getDependencyGraph ? registry.getDependencyGraph() : {};
      return Object.entries(graph).map(([service, dependsOn]) => ({ service, dependsOn }));
    },
    versions: ({ serviceName }) => {
      return registry.getVersions ? registry.getVersions(serviceName) : [];
    },
  },
  Mutation: {
    register: ({ serviceName, nodeName, address, metadata }) => {
      const metadataObj = metadata ? JSON.parse(metadata) : {};
      if (registry.register) {
        registry.register(serviceName, {
          host: address.split(':')[0],
          port: parseInt(address.split(':')[1]),
          metadata: metadataObj,
        });
        pubsub.publish('SERVICE_EVENT', {
          serviceEvents: {
            event: 'register',
            serviceName,
            nodeName,
            data: JSON.stringify({ address, metadata: metadataObj }),
          },
        });
        return 'Service registered';
      } else {
        serviceRegistry.registry.get(serviceName) ||
          serviceRegistry.registry.set(serviceName, { nodes: {}, createdAt: Date.now() });
        serviceRegistry.registry.get(serviceName).nodes[nodeName] = {
          address,
          metadata: metadataObj,
          healthy: true,
          registeredAt: Date.now(),
        };
        serviceRegistry.addToHealthyNodes(serviceName, nodeName);
        serviceRegistry.addChange('register', serviceName, nodeName, {
          address,
          metadata: metadataObj,
        });
        pubsub.publish('SERVICE_EVENT', {
          serviceEvents: {
            event: 'register',
            serviceName,
            nodeName,
            data: JSON.stringify({ address, metadata: metadataObj }),
          },
        });
        return 'Service registered';
      }
    },
    deregister: ({ serviceName, nodeName }) => {
      if (registry.deregister) {
        registry.deregister(nodeName);
        pubsub.publish('SERVICE_EVENT', {
          serviceEvents: { event: 'deregister', serviceName, nodeName, data: '{}' },
        });
        return 'Service deregistered';
      } else {
        serviceRegistry.removeFromHealthyNodes(serviceName, nodeName);
        const service = serviceRegistry.registry.get(serviceName);
        if (service && service.nodes[nodeName]) {
          delete service.nodes[nodeName];
          if (Object.keys(service.nodes).length === 0) {
            serviceRegistry.registry.delete(serviceName);
          }
          serviceRegistry.addChange('deregister', serviceName, nodeName, {});
          pubsub.publish('SERVICE_EVENT', {
            serviceEvents: { event: 'deregister', serviceName, nodeName, data: '{}' },
          });
        }
        return 'Service deregistered';
      }
    },
    setTrafficDistribution: ({ serviceName, distribution }) => {
      const distObj = JSON.parse(distribution);
      if (registry.setTrafficDistribution) {
        registry.setTrafficDistribution(serviceName, distObj);
        return 'Traffic distribution set';
      }
      return 'Not supported';
    },
    addDependency: ({ serviceName, dependsOn }) => {
      if (registry.addDependency) {
        registry.addDependency(serviceName, dependsOn);
        return 'Dependency added';
      }
      return 'Not supported';
    },
    removeDependency: ({ serviceName, dependsOn }) => {
      if (registry.removeDependency) {
        registry.removeDependency(serviceName, dependsOn);
        return 'Dependency removed';
      }
      return 'Not supported';
    },
  },
  Subscription: {
    serviceEvents: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['SERVICE_EVENT']),
        (payload, variables) => {
          return (
            !variables.serviceName || payload.serviceEvents.serviceName === variables.serviceName
          );
        }
      ),
    },
    circuitBreakerEvents: {
      subscribe: () => pubsub.asyncIterator(['CIRCUIT_BREAKER_EVENT']),
    },
    configEvents: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['CONFIG_EVENT']),
        (payload, variables) => {
          return (
            !variables.serviceName || payload.configEvents.serviceName === variables.serviceName
          );
        }
      ),
    },
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

module.exports = { schema, root: resolvers };
