const Service = require('../entity/service-body');
const { serviceRegistry: sRegistry } = require('../entity/service-registry');
const { discoveryService } = require('../service/discovery-service');
const { healthService } = require('../service/health-service');
const federationService = require('./federation-service');
const config = require('../config/config');
const fs = require('fs');
const path = require('path');
const { consoleError, consoleLog } = require('../util/logging/logging-util');
class RegistryService {
  auditLog = (action, details) => {
    if (config.highPerformanceMode || config.ultraFastMode || config.extremeFastMode) return; // Skip audit logging in high performance, ultra-fast, or extreme fast mode
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      ...details,
    };
    const logFile = path.join(__dirname, '../../../logs/audit.log');
    fs.appendFile(logFile, JSON.stringify(logEntry) + '\n', (err) => {
      if (err) consoleError('Audit log error:', err);
    });
  };

  registerService = (serviceObj) => {
    const service = Service.buildByObj(serviceObj);
    if (!service) return;
    const {
      serviceName,
      version,
      namespace,
      region,
      zone,
      datacenter,
      tenantId,
      nodeName,
      address,
      timeOut,
      weight,
      metadata,
      aliases,
      apiSpec,
    } = service;
    const effectiveWeight = config.ultraFastMode || config.lightningMode ? 1 : weight; // In ultra-fast and lightning mode, ignore weight for max speed
    const tenantPrefix = tenantId !== 'default' ? `${tenantId}:` : '';
    let fullServiceName;
    if (datacenter !== 'default' || region !== 'default' || zone !== 'default') {
      const parts = [tenantPrefix, datacenter, namespace, region, zone, serviceName];
      if (version) parts.push(version);
      fullServiceName = parts.filter((p) => p).join(':');
    } else {
      const parts = [tenantPrefix, namespace, serviceName];
      if (version) parts.push(version);
      fullServiceName = parts.filter((p) => p).join(':');
    }

    if (config.approvalRequired && !config.ultraFastMode) {
      const pendingKey = `${fullServiceName}:${nodeName}`;
      sRegistry.pendingServices.set(pendingKey, {
        ...serviceObj,
        fullServiceName,
        registeredAt: Date.now(),
      });
      return { message: 'Registration pending approval', status: 'pending' };
    }

    if (!sRegistry.registry.has(fullServiceName)) {
      if (config.lightningMode) {
        sRegistry.registry.set(fullServiceName, { nodes: new Map(), healthyNodes: [] });
      } else {
        sRegistry.registry.set(fullServiceName, { offset: 0, nodes: {} });
      }
      if (!config.lightningMode) {
        sRegistry.serviceUptime.set(fullServiceName, Date.now());
      }
      // Track service versions for cleanup
      if (version && !config.lightningMode) {
        const baseServiceName = `${tenantPrefix}${namespace}:${serviceName}`;
        sRegistry.registerServiceVersion(baseServiceName, version);
      }
    }

    const svc = sRegistry.registry.get(fullServiceName);
    let currentNodesCount;
    if (config.lightningMode) {
      currentNodesCount = svc.nodes.size;
    } else {
      currentNodesCount = Object.keys(svc.nodes).length;
    }
    if (currentNodesCount + effectiveWeight > config.maxInstancesPerService) {
      consoleLog(
        `Service ${fullServiceName} has reached max instances limit (${config.maxInstancesPerService})`
      );
      return; // Reject registration
    }
    [...Array(effectiveWeight).keys()].forEach((index) => {
      const subNodeName = `${nodeName}-${index}`;

      if (!config.ultraFastMode && !config.lightningMode) {
        sRegistry.addNodeToHashRegistry(fullServiceName, subNodeName);
      }

      const nodeObj = {
        nodeName: subNodeName,
        parentNode: nodeName,
        address: address,
        timeOut: timeOut,
        registeredAt: Date.now(),
        healthy: true,
        failureCount: 0,
        lastFailureTime: null,
        metadata:
          config.ultraFastMode || config.lightningMode ? { weight: effectiveWeight } : metadata, // In lightning, only weight for load balancing
        apiSpec: config.ultraFastMode ? null : apiSpec,
      };

      if (config.lightningMode) {
        // Remove existing if present
        svc.nodes.set(subNodeName, nodeObj);
        // Clear timeout if exists
        if (!sRegistry.timeResetters) sRegistry.timeResetters = new Map();
        const existingTimeout = sRegistry.timeResetters.get(subNodeName);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
      } else {
        if (svc.nodes[subNodeName]) {
          clearTimeout(sRegistry.timeResetters.get(subNodeName));
        }
        svc.nodes[subNodeName] = nodeObj;
      }

      if (!config.ultraFastMode) {
        sRegistry.addToTagIndex(subNodeName, metadata?.tags);
      }
      sRegistry.addToHealthyNodes(fullServiceName, subNodeName);

      // In ultra-fast mode, disable heartbeats for maximum performance; enable in lightning mode
      if (!config.ultraFastMode) {
        const timeResetter = setTimeout(
          () => {
            // Check self-preservation mode
            if (healthService.selfPreservationMode) {
              // In self-preservation mode, renew the timeout instead of deregistering
              setTimeout(
                () => {
                  const service = sRegistry.registry.get(fullServiceName);
                  if (service) {
                    if (config.lightningMode) {
                      service.nodes.delete(subNodeName);
                      if (service.nodes.size === 0) {
                        sRegistry.registry.delete(fullServiceName);
                      }
                    } else {
                      delete service.nodes[subNodeName];
                      if (Object.keys(service.nodes).length === 0) {
                        sRegistry.registry.delete(fullServiceName);
                      }
                    }
                  }
                  sRegistry.removeNodeFromRegistry(fullServiceName, subNodeName);
                  const hashRing = sRegistry.hashRegistry.get(fullServiceName);
                  if (hashRing && hashRing.servers.length === 0) {
                    sRegistry.hashRegistry.delete(fullServiceName);
                  }
                },
                timeOut * 1000 + 500
              );
              return;
            }
            const service = sRegistry.registry.get(fullServiceName);
            if (service) {
              if (config.lightningMode) {
                service.nodes.delete(subNodeName);
                if (service.nodes.size === 0) {
                  sRegistry.registry.delete(fullServiceName);
                }
              } else {
                delete service.nodes[subNodeName];
                if (Object.keys(service.nodes).length === 0) {
                  sRegistry.registry.delete(fullServiceName);
                }
              }
            }
            sRegistry.removeNodeFromRegistry(fullServiceName, subNodeName);
            const hashRing = sRegistry.hashRegistry.get(fullServiceName);
            if (hashRing && hashRing.servers.length === 0) {
              sRegistry.hashRegistry.delete(fullServiceName);
            }
          },
          timeOut * 1000 + 500
        );

        sRegistry.timeResetters.set(subNodeName, timeResetter);
      }
    });

    // Register dependencies
    if (metadata && metadata.dependencies && !config.ultraFastMode && !config.lightningMode) {
      for (const dep of metadata.dependencies) {
        sRegistry.addServiceDependency(fullServiceName, dep);
      }
    }

    // Register aliases
    if (!config.extremeFastMode && !config.lightningMode && aliases && Array.isArray(aliases)) {
      for (const alias of aliases) {
        const fullAliasName =
          region !== 'default' || zone !== 'default'
            ? version
              ? `${tenantPrefix}${namespace}:${region}:${zone}:${alias}:${version}`
              : `${tenantPrefix}${namespace}:${region}:${zone}:${alias}`
            : version
              ? `${tenantPrefix}${namespace}:${alias}:${version}`
              : `${tenantPrefix}${namespace}:${alias}`;
        sRegistry.addServiceAlias(fullAliasName, fullServiceName);
      }
    }

    if (!config.extremeFastMode && !config.lightningMode) {
      sRegistry.addChange('register', fullServiceName, nodeName, {
        node: svc.nodes[`${nodeName}-0`],
        address,
        metadata,
        aliases,
      });
      this.auditLog('register', { fullServiceName, nodeName, address, metadata, aliases });
    }

    // Replicate to federated datacenters
    federationService.replicateRegistration(fullServiceName, serviceObj);
    if (!config.lightningMode) discoveryService.invalidateServiceCache(fullServiceName);
    return { serviceName, nodeName, address, timeOut, weight };
  };

  registryService = (serviceObj) => {
    // Merge with template if specified
    if (serviceObj.templateName) {
      const template = sRegistry.getServiceTemplate(serviceObj.templateName);
      if (template) {
        serviceObj = { ...template, ...serviceObj };
      }
    }
    let service = Service.buildByObj(serviceObj);
    if (!service) return;
    if (config.approvalRequired) {
      const key = `${service.serviceName}:${service.nodeName}`;
      sRegistry.pendingServices.set(key, service);
      sRegistry.addChange('pending', service.serviceName, service.nodeName, {
        address: service.address,
        metadata: service.metadata,
      });
      return { status: 'pending', service };
    } else {
      this.registerService(service);
      service.registeredAt = new Date().toLocaleString();
      return service;
    }
  };

  getPendingServices = () => {
    return Array.from(sRegistry.pendingServices.values());
  };

  approveService = (serviceName, nodeName) => {
    const key = `${serviceName}:${nodeName}`;
    const pending = sRegistry.pendingServices.get(key);
    if (pending) {
      sRegistry.pendingServices.delete(key);
      this.registerService(pending);
      pending.registeredAt = new Date().toLocaleString();
      return pending;
    }
    return null;
  };

  rejectService = (serviceName, nodeName) => {
    const key = `${serviceName}:${nodeName}`;
    return sRegistry.pendingServices.delete(key);
  };

  deregisterService = (
    serviceName,
    nodeName,
    namespace = 'default',
    region = 'default',
    zone = 'default',
    tenantId = 'default'
  ) => {
    const tenantPrefix = tenantId !== 'default' ? `${tenantId}:` : '';
    const fullServiceName =
      region !== 'default' || zone !== 'default'
        ? `${tenantPrefix}${namespace}:${region}:${zone}:${serviceName}`
        : `${tenantPrefix}${namespace}:${serviceName}`;
    if (!sRegistry.registry.has(fullServiceName)) return false;
    const service = sRegistry.registry.get(fullServiceName);
    let toRemove;
    if (config.lightningMode) {
      toRemove = Array.from(service.nodes.values())
        .filter((n) => n.parentNode === nodeName)
        .map((n) => n.nodeName);
    } else {
      toRemove = Object.keys(service.nodes).filter(
        (key) => service.nodes[key].parentNode === nodeName
      );
    }
    toRemove.forEach((subNode) => {
      if (sRegistry.timeResetters.has(subNode)) {
        clearTimeout(sRegistry.timeResetters.get(subNode));
        sRegistry.timeResetters.delete(subNode);
      }
      if (config.lightningMode) {
        service.nodes.delete(subNode);
        service.healthyNodes = service.healthyNodes.filter((n) => n.nodeName !== subNode);
      } else {
        delete service.nodes[subNode];
      }
      sRegistry.removeNodeFromRegistry(fullServiceName, subNode);
    });
    let remaining;
    if (config.lightningMode) {
      remaining = service.nodes.size;
    } else {
      remaining = Object.keys(service.nodes).length;
    }
    if (remaining === 0) {
      sRegistry.registry.delete(fullServiceName);
      if (!config.lightningMode) sRegistry.hashRegistry.delete(fullServiceName);
    }
    if (!config.extremeFastMode && !config.lightningMode) {
      sRegistry.addChange('deregister', fullServiceName, nodeName, {});
      this.auditLog('deregister', { fullServiceName, nodeName });
    }
    if (!config.lightningMode) discoveryService.invalidateServiceCache(fullServiceName);

    // Replicate deregistration to federated datacenters
    federationService.replicateDeregistration(fullServiceName, nodeName);

    return true;
  };
}

const registryService = new RegistryService();

module.exports = {
  registryService,
};
