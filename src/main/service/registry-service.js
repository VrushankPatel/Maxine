const Service = require("../entity/service-body");
const { serviceRegistry: sRegistry } = require("../entity/service-registry");
const { discoveryService } = require("../service/discovery-service");
const config = require("../config/config");
const fs = require('fs');
const path = require('path');
class RegistryService{

    auditLog = (action, details) => {
        const logEntry = {
            timestamp: new Date().toISOString(),
            action,
            ...details
        };
        const logFile = path.join(__dirname, '../../../logs/audit.log');
        fs.appendFile(logFile, JSON.stringify(logEntry) + '\n', (err) => {
            if (err) console.error('Audit log error:', err);
        });
    }

    registerService = (serviceObj) => {
        const {serviceName, version, namespace = "default", region = "default", zone = "default", tenantId = "default", nodeName, address, timeOut, weight, metadata, aliases = [], apiSpec} = serviceObj;
        const tenantPrefix = tenantId !== "default" ? `${tenantId}:` : '';
        const fullServiceName = (region !== "default" || zone !== "default") ?
            (version ? `${tenantPrefix}${namespace}:${region}:${zone}:${serviceName}:${version}` : `${tenantPrefix}${namespace}:${region}:${zone}:${serviceName}`) :
            (version ? `${tenantPrefix}${namespace}:${serviceName}:${version}` : `${tenantPrefix}${namespace}:${serviceName}`);

        if (!sRegistry.registry.has(fullServiceName)){
            sRegistry.registry.set(fullServiceName, {offset: 0, nodes: {}});
        }

        const service = sRegistry.registry.get(fullServiceName);
        const currentNodesCount = Object.keys(service.nodes).length;
        if (currentNodesCount + weight > config.maxInstancesPerService) {
            console.warn(`Service ${fullServiceName} has reached max instances limit (${config.maxInstancesPerService})`);
            return; // Reject registration
        }
        [...Array(weight).keys()].forEach(index => {
            const subNodeName = `${nodeName}-${index}`;

            sRegistry.addNodeToHashRegistry(fullServiceName, subNodeName);

            if(service.nodes[subNodeName]){
                clearTimeout(sRegistry.timeResetters.get(subNodeName));
            }

            service.nodes[subNodeName] = {
                "nodeName" : subNodeName,
                "parentNode" : nodeName,
                "address" : address,
                "timeOut" : timeOut,
                "registeredAt" : Date.now(),
                "healthy" : true,
                "failureCount" : 0,
                "lastFailureTime" : null,
                "metadata" : metadata,
                "apiSpec" : apiSpec
            }

            sRegistry.addToTagIndex(subNodeName, metadata.tags);
            sRegistry.addToHealthyNodes(fullServiceName, subNodeName);

            const timeResetter = setTimeout(() => {
                // Check self-preservation mode
                const { healthService } = require("../service/health-service");
                if (healthService.selfPreservationMode) {
                    // In self-preservation mode, renew the timeout instead of deregistering
                    setTimeout(() => {
                        const service = sRegistry.registry.get(fullServiceName);
                        if (service) {
                            delete service.nodes[subNodeName];
                            if(Object.keys(service.nodes).length === 0){
                                sRegistry.registry.delete(fullServiceName);
                            }
                        }
                        sRegistry.removeNodeFromRegistry(fullServiceName, subNodeName);
                        const hashRing = sRegistry.hashRegistry.get(fullServiceName);
                        if(hashRing && hashRing.servers.length === 0){
                            sRegistry.hashRegistry.delete(fullServiceName);
                        }
                    }, ((timeOut)*1000)+500);
                    return;
                }
                const service = sRegistry.registry.get(fullServiceName);
                if (service) {
                    delete service.nodes[subNodeName];
                    if(Object.keys(service.nodes).length === 0){
                        sRegistry.registry.delete(fullServiceName);
                    }
                }
                sRegistry.removeNodeFromRegistry(fullServiceName, subNodeName);
                const hashRing = sRegistry.hashRegistry.get(fullServiceName);
                if(hashRing && hashRing.servers.length === 0){
                    sRegistry.hashRegistry.delete(fullServiceName);
                }
            }, ((timeOut)*1000)+500);

            sRegistry.timeResetters.set(subNodeName, timeResetter);
        });

        // Register aliases
        if (aliases && Array.isArray(aliases)) {
            for (const alias of aliases) {
                const fullAliasName = (region !== "default" || zone !== "default") ?
                    (version ? `${tenantPrefix}${namespace}:${region}:${zone}:${alias}:${version}` : `${tenantPrefix}${namespace}:${region}:${zone}:${alias}`) :
                    (version ? `${tenantPrefix}${namespace}:${alias}:${version}` : `${tenantPrefix}${namespace}:${alias}`);
                sRegistry.addServiceAlias(fullAliasName, fullServiceName);
            }
        }

        sRegistry.addChange('register', fullServiceName, nodeName, { address, metadata, aliases });
        this.auditLog('register', { fullServiceName, nodeName, address, metadata, aliases });
        discoveryService.invalidateServiceCache(fullServiceName);
    }

    registryService = (serviceObj) => {
        let service = Service.buildByObj(serviceObj);
        if(!service) return;
        this.registerService(service);
        service.registeredAt = new Date().toLocaleString();
        return service;
    }

    deregisterService = (serviceName, nodeName, namespace = "default", region = "default", zone = "default", tenantId = "default") => {
        const tenantPrefix = tenantId !== "default" ? `${tenantId}:` : '';
        const fullServiceName = (region !== "default" || zone !== "default") ?
            `${tenantPrefix}${namespace}:${region}:${zone}:${serviceName}` :
            `${tenantPrefix}${namespace}:${serviceName}`;
        if (!sRegistry.registry.has(fullServiceName)) return false;
        const service = sRegistry.registry.get(fullServiceName);
        const nodes = service.nodes;
        const toRemove = Object.keys(nodes).filter(key => nodes[key].parentNode === nodeName);
        toRemove.forEach(subNode => {
            if (sRegistry.timeResetters.has(subNode)) {
                clearTimeout(sRegistry.timeResetters.get(subNode));
                sRegistry.timeResetters.delete(subNode);
            }
            delete nodes[subNode];
            sRegistry.removeNodeFromRegistry(fullServiceName, subNode);
        });
        if (Object.keys(nodes).length === 0) {
            sRegistry.registry.delete(fullServiceName);
            sRegistry.hashRegistry.delete(fullServiceName);
        }
        sRegistry.addChange('deregister', fullServiceName, nodeName, {});
        this.auditLog('deregister', { fullServiceName, nodeName });
        discoveryService.invalidateServiceCache(fullServiceName);
        return true;
    }
}

const registryService = new RegistryService();

module.exports = {
    registryService
}