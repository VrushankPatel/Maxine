const Service = require("../entity/service-body");
const { serviceRegistry: sRegistry } = require("../entity/service-registry");
const { registryStateService } = require("./registry-state-service");
const config = require("../config/config");
const { constants } = require("../util/constants/constants");
const _ = require('lodash');
class RegistryService{
    initialized = false;

    isSharedFileMode = () => constants.REGISTRY_STATE_MODE === 'shared-file';

    initialize = () => {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        if (this.isSharedFileMode()) {
            this.syncForRead();
            return;
        }

        this.restoreRegistryState();
    }

    ensureServiceEntry = (serviceName, offset = 0) => {
        if (!sRegistry.registry[serviceName]) {
            sRegistry.registry[serviceName] = { offset, nodes: {} };
        }
    }

    persistRegistry = () => {
        registryStateService.save(sRegistry.getRegServers());
    }

    scheduleNodeExpiry = (serviceName, nodeName, ttlMs) => {
        if (this.isSharedFileMode()) {
            return;
        }

        if (sRegistry.timeResetters[nodeName]) {
            clearTimeout(sRegistry.timeResetters[nodeName]);
        }

        sRegistry.timeResetters[nodeName] = setTimeout(() => {
            this.removeNode(serviceName, nodeName);
        }, Math.max(1000, ttlMs));
    }

    removeNode = (serviceName, nodeName, shouldPersist = true) => {
        const service = sRegistry.registry[serviceName];
        if (!service || !service.nodes[nodeName]) {
            return;
        }

        if (sRegistry.timeResetters[nodeName]) {
            clearTimeout(sRegistry.timeResetters[nodeName]);
            delete sRegistry.timeResetters[nodeName];
        }

        delete service.nodes[nodeName];
        sRegistry.removeNodeFromRegistry(serviceName, nodeName);

        const hashRegistry = sRegistry.hashRegistry[serviceName];
        if (hashRegistry && Object.keys(hashRegistry.nodes).length === 0) {
            delete sRegistry.hashRegistry[serviceName];
        }

        if (Object.keys(service.nodes).length === 0) {
            delete sRegistry.registry[serviceName];
        }

        if (shouldPersist) {
            this.persistRegistry();
        }
    }

    normalizeNodeState = (nodeName, nodeState, now = Date.now()) => {
        const nodeTimeOut = Math.abs(parseInt(nodeState.timeOut)) || config.heartBeatTimeout;
        const registeredAt = Number(nodeState.registeredAt) || now;

        return {
            ...nodeState,
            nodeName,
            parentNode: nodeState.parentNode || nodeName,
            timeOut: nodeTimeOut,
            registeredAt
        };
    }

    pruneExpiredSnapshot = (snapshot = {}) => {
        const now = Date.now();
        let changed = false;
        const activeSnapshot = {};

        Object.entries(snapshot).forEach(([serviceName, serviceState]) => {
            const activeNodes = {};
            const offset = Number.isInteger(serviceState.offset) ? serviceState.offset : 0;

            Object.entries(serviceState.nodes || {}).forEach(([nodeName, nodeState]) => {
                const normalizedNode = this.normalizeNodeState(nodeName, nodeState, now);
                const ttlMs = (normalizedNode.timeOut * 1000) + 500 - (now - normalizedNode.registeredAt);

                if (ttlMs <= 0) {
                    changed = true;
                    return;
                }

                activeNodes[nodeName] = normalizedNode;
            });

            if (Object.keys(activeNodes).length > 0) {
                activeSnapshot[serviceName] = {
                    offset,
                    nodes: activeNodes
                };
                return;
            }

            if (serviceState && Object.keys(serviceState.nodes || {}).length > 0) {
                changed = true;
            }
        });

        return {
            snapshot: activeSnapshot,
            changed
        };
    }

    loadSnapshotIntoMemory = (snapshot = {}, shouldScheduleExpiries = !this.isSharedFileMode()) => {
        sRegistry.reset();

        Object.entries(snapshot).forEach(([serviceName, serviceState]) => {
            this.ensureServiceEntry(serviceName, Number.isInteger(serviceState.offset) ? serviceState.offset : 0);

            Object.entries(serviceState.nodes || {}).forEach(([nodeName, nodeState]) => {
                const normalizedNode = this.normalizeNodeState(nodeName, nodeState);
                sRegistry.addNodeToHashRegistry(serviceName, nodeName);
                sRegistry.registry[serviceName].nodes[nodeName] = normalizedNode;

                if (shouldScheduleExpiries) {
                    const ttlMs = (normalizedNode.timeOut * 1000) + 500 - (Date.now() - normalizedNode.registeredAt);
                    if (ttlMs > 0) {
                        this.scheduleNodeExpiry(serviceName, nodeName, ttlMs);
                    }
                }
            });

            if (Object.keys(sRegistry.registry[serviceName].nodes).length === 0) {
                delete sRegistry.registry[serviceName];
            }
        });
    }

    syncForRead = () => {
        if (!this.isSharedFileMode()) {
            return;
        }

        registryStateService.mutate((snapshot) => {
            const activeSnapshot = this.pruneExpiredSnapshot(snapshot).snapshot;
            this.loadSnapshotIntoMemory(activeSnapshot, false);
            return {
                result: activeSnapshot,
                registry: activeSnapshot
            };
        });
    }

    upsertNode = (serviceName, nodeName, nodeData, ttlMs, shouldPersist = true) => {
        this.ensureServiceEntry(serviceName);
        sRegistry.addNodeToHashRegistry(serviceName, nodeName);
        sRegistry.registry[serviceName].nodes[nodeName] = nodeData;
        this.scheduleNodeExpiry(serviceName, nodeName, ttlMs);

        if (shouldPersist) {
            this.persistRegistry();
        }
    }

    removeParentNodeRegistrations = (serviceName, parentNode, shouldPersist = true) => {
        const service = sRegistry.registry[serviceName];
        if (!service) {
            return;
        }

        Object.values(service.nodes)
            .filter((node) => node.parentNode === parentNode)
            .forEach((node) => {
                this.removeNode(serviceName, node.nodeName, false);
            });

        if (shouldPersist) {
            this.persistRegistry();
        }
    }

    restoreRegistryState = () => {
        const savedRegistry = registryStateService.load();
        if (!savedRegistry) {
            return;
        }

        const now = Date.now();
        let restoredNodeCount = 0;

        Object.entries(savedRegistry).forEach(([serviceName, serviceState]) => {
            this.ensureServiceEntry(serviceName, serviceState.offset || 0);

            Object.entries(serviceState.nodes || {}).forEach(([nodeName, nodeState]) => {
                const nodeTimeOut = Math.abs(parseInt(nodeState.timeOut)) || config.heartBeatTimeout;
                const registeredAt = Number(nodeState.registeredAt) || now;
                const ttlMs = (nodeTimeOut * 1000) + 500 - (now - registeredAt);

                if (ttlMs <= 0) {
                    return;
                }

                this.upsertNode(serviceName, nodeName, {
                    nodeName,
                    parentNode: nodeState.parentNode || nodeName,
                    address: nodeState.address,
                    timeOut: nodeTimeOut,
                    registeredAt
                }, ttlMs, false);
                restoredNodeCount += 1;
            });

            const service = sRegistry.registry[serviceName];
            if (service && Object.keys(service.nodes).length === 0) {
                delete sRegistry.registry[serviceName];
            }
        });

        this.persistRegistry();
        registryStateService.logRestoreSummary(restoredNodeCount);
    }

    registerService = (serviceObj, shouldPersist = true) => {
        const {serviceName, nodeName, address, timeOut, weight} = serviceObj;

        this.ensureServiceEntry(serviceName);
        this.removeParentNodeRegistrations(serviceName, nodeName, false);

        [...Array(weight).keys()].forEach(index => {
            const subNodeName = `${nodeName}-${index}`;
            this.upsertNode(serviceName, subNodeName, {
                "nodeName" : subNodeName,
                "parentNode" : nodeName,
                "address" : address,
                "timeOut" : timeOut,
                "registeredAt" : Date.now()
            }, ((timeOut)*1000)+500, false);
        });

        if (shouldPersist) {
            this.persistRegistry();
        }
    }

    registryService = (serviceObj) => {
        this.initialize();

        if (this.isSharedFileMode()) {
            return registryStateService.mutate((snapshot) => {
                const activeSnapshot = this.pruneExpiredSnapshot(snapshot).snapshot;
                this.loadSnapshotIntoMemory(activeSnapshot, false);

                const service = Service.buildByObj(serviceObj);
                if (!service || _.isNull(service)) {
                    return {
                        result: undefined,
                        registry: sRegistry.getRegServers()
                    };
                }

                this.registerService(service, false);
                service.registeredAt = new Date().toLocaleString();

                return {
                    result: service,
                    registry: sRegistry.getRegServers()
                };
            });
        }

        let service = Service.buildByObj(serviceObj);
        if(!service || _.isNull(service)) return;
        this.registerService(service);
        service.registeredAt = new Date().toLocaleString();
        return service;
    }

    getRegisteredServers = () => {
        this.initialize();
        this.syncForRead();
        return sRegistry.getRegServers();
    }

    getOffsetAndIncrement = (serviceName) => {
        this.initialize();

        if (this.isSharedFileMode()) {
            return registryStateService.mutate((snapshot) => {
                const activeSnapshot = this.pruneExpiredSnapshot(snapshot).snapshot;
                this.loadSnapshotIntoMemory(activeSnapshot, false);
                const service = sRegistry.registry[serviceName];

                if (!service) {
                    return {
                        result: undefined,
                        registry: sRegistry.getRegServers()
                    };
                }

                const currentOffset = Number.isInteger(service.offset) ? service.offset : 0;
                service.offset = currentOffset + 1;

                return {
                    result: currentOffset,
                    registry: sRegistry.getRegServers()
                };
            });
        }

        const service = sRegistry.registry[serviceName];
        if (!service) {
            return undefined;
        }

        const currentOffset = Number.isInteger(service.offset) ? service.offset : 0;
        service.offset = currentOffset + 1;
        return currentOffset;
    }

    reset = (clearPersistedState = true) => {
        sRegistry.reset();
        if (clearPersistedState) {
            registryStateService.clear();
        }
        this.initialized = false;
    }
}

const registryService = new RegistryService();

module.exports = {
    registryService
}
