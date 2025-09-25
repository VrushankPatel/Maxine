const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

class GrpcServer {
  constructor(serviceRegistry, config) {
    this.serviceRegistry = serviceRegistry;
    this.config = config;
    this.server = new grpc.Server();
    this.loadProto();
    this.bindServices();
  }

  loadProto() {
    const protoPath = path.join(__dirname, '../../../api-specs/maxine.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    this.proto = grpc.loadPackageDefinition(packageDefinition).maxine;
  }

  bindServices() {
    this.server.addService(this.proto.DiscoveryService.service, {
      Register: this.register.bind(this),
      Discover: this.discover.bind(this),
      Heartbeat: this.heartbeat.bind(this),
      Deregister: this.deregister.bind(this),
      WatchServices: this.watchServices.bind(this),
    });
  }

  register(call, callback) {
    try {
      const { serviceName, host, port, metadata } = call.request;
      const nodeId = this.serviceRegistry.register(serviceName, host, port, metadata);
      callback(null, { nodeId });
    } catch (error) {
      callback(error);
    }
  }

  discover(call, callback) {
    try {
      const { serviceName, version, loadBalancing, tags, namespace, region, zone, ip, proxy } =
        call.request;
      const node = this.serviceRegistry.discover(serviceName, {
        version,
        loadBalancing: loadBalancing || 'round-robin',
        tags: tags || [],
        namespace,
        region,
        zone,
        ip,
        proxy,
      });
      if (node) {
        callback(null, {
          address: `${node.host}:${node.port}`,
          nodeName: node.nodeId,
          message: 'Service found',
        });
      } else {
        callback(null, {
          address: '',
          nodeName: '',
          message: 'Service not found',
        });
      }
    } catch (error) {
      callback(error);
    }
  }

  heartbeat(call, callback) {
    try {
      const { nodeId } = call.request;
      this.serviceRegistry.heartbeat(nodeId);
      callback(null, { success: true });
    } catch (error) {
      callback(error);
    }
  }

  deregister(call, callback) {
    try {
      const { nodeId } = call.request;
      this.serviceRegistry.deregister(nodeId);
      callback(null, { success: true });
    } catch (error) {
      callback(error);
    }
  }

  watchServices(call) {
    // For simplicity, send initial services and close
    // Full implementation would stream updates
    const services = this.serviceRegistry.getAllServices();
    for (const [serviceName, nodes] of services) {
      for (const node of nodes) {
        call.write({
          serviceName,
          action: 'REGISTERED',
          nodeName: node.nodeId,
          address: `${node.host}:${node.port}`,
        });
      }
    }
    call.end();
  }

  start(port) {
    this.server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          console.error('Failed to bind gRPC server:', error);
          return;
        }
        this.server.start();
      }
    );
  }
}

module.exports = GrpcServer;
