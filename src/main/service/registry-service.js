const Service = require("../entity/service-body");
const { serviceRegistry: sRegistry } = require("../entity/service-registry");
const { registryStateService } = require("./registry-state-service");
const config = require("../config/config");
const { constants } = require("../util/constants/constants");
const { error } = require("../util/logging/logging-util");
const _ = require('lodash');

class RegistryService{
    initialized = false;
    initializationPromise;

    isSharedFileMode = () => constants.REGISTRY_STATE_MODE === 'shared-file';

    isRedisMode = () => constants.REGISTRY_STATE_MODE === 'redis';

    isSharedStateMode = () => this.isSharedFileMode() || this.isRedisMode();

    initialize = async () => {
        if (this.initialized) {
            return;
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = (async () => {
            if (this.isSharedStateMode()) {
                await registryStateService.initialize();
                await this.syncForRead();
            } else {
                await this.restoreRegistryState();
            }

            this.initialized = true;
        })().catch((err) => {
            this.initialized = false;
            throw err;
        }).finally(() => {
            this.initializationPromise = undefined;
        });

        return this.initializationPromise;
    }

    ensureServiceEntry = (serviceName, offset = 0) => {
        if (!sRegistry.registry[serviceName]) {
            sRegistry.registry[serviceName] = { offset, nodes: {} };
        }
    }

    persistRegistry = async () => {
        await registryStateService.save(sRegistry.getRegServers());
    }

    scheduleNodeExpiry = (serviceName, nodeName, ttlMs) => {
        if (this.isSharedStateMode()) {
            return;
        }

        if (sRegistry.timeResetters[nodeName]) {
            clearTimeout(sRegistry.timeResetters[nodeName]);
        }

        sRegistry.timeResetters[nodeName] = setTimeout(() => {
            Promise.resolve(this.removeNode(serviceName, nodeName)).catch((err) => {
                error(`Unable to expire node ${nodeName}: ${err.message}`);
            });
        }, Math.max(1000, ttlMs));
    }

    removeNode = async (serviceName, nodeName, shouldPersist = true) => {
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
            await this.persistRegistry();
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

    loadSnapshotIntoMemory = (snapshot = {}, shouldScheduleExpiries = !this.isSharedStateMode()) => {
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

    syncForRead = async () => {
        if (!this.isSharedStateMode()) {
            return;
        }

        if (this.isSharedFileMode()) {
            await registryStateService.mutate((snapshot) => {
                const activeSnapshot = this.pruneExpiredSnapshot(snapshot).snapshot;
                this.loadSnapshotIntoMemory(activeSnapshot, false);
                return {
                    result: activeSnapshot,
                    registry: activeSnapshot
                };
            });
            return;
        }

        const snapshot = await registryStateService.load() || {};
        const { snapshot: activeSnapshot, changed } = this.pruneExpiredSnapshot(snapshot);
        this.loadSnapshotIntoMemory(activeSnapshot, false);

        if (!changed) {
            return;
        }

        await registryStateService.mutate((latestSnapshot) => {
            const nextSnapshot = this.pruneExpiredSnapshot(latestSnapshot).snapshot;
            this.loadSnapshotIntoMemory(nextSnapshot, false);
            return {
                result: nextSnapshot,
                registry: nextSnapshot
            };
        });
    }

    upsertNode = async (serviceName, nodeName, nodeData, ttlMs, shouldPersist = true) => {
        this.ensureServiceEntry(serviceName);
        sRegistry.addNodeToHashRegistry(serviceName, nodeName);
        sRegistry.registry[serviceName].nodes[nodeName] = nodeData;
        this.scheduleNodeExpiry(serviceName, nodeName, ttlMs);

        if (shouldPersist) {
            await this.persistRegistry();
        }
    }

    removeParentNodeRegistrations = async (serviceName, parentNode, shouldPersist = true) => {
        const service = sRegistry.registry[serviceName];
        if (!service) {
            return;
        }

        for (const node of Object.values(service.nodes).filter((candidate) => candidate.parentNode === parentNode)) {
            await this.removeNode(serviceName, node.nodeName, false);
        }

        if (shouldPersist) {
            await this.persistRegistry();
        }
    }

    restoreRegistryState = async () => {
        const savedRegistry = await registryStateService.load();
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

        await this.persistRegistry();
        registryStateService.logRestoreSummary(restoredNodeCount);
    }

    registerService = async (serviceObj, shouldPersist = true) => {
        const {serviceName, nodeName, address, timeOut, weight} = serviceObj;

        this.ensureServiceEntry(serviceName);
        await this.removeParentNodeRegistrations(serviceName, nodeName, false);

        for (const index of [...Array(weight).keys()]) {
            const subNodeName = `${nodeName}-${index}`;
            await this.upsertNode(serviceName, subNodeName, {
                "nodeName" : subNodeName,
                "parentNode" : nodeName,
                "address" : address,
                "timeOut" : timeOut,
                "registeredAt" : Date.now()
            }, ((timeOut)*1000)+500, false);
        }

        if (shouldPersist) {
            await this.persistRegistry();
        }
    }

    registryService = async (serviceObj) => {
        await this.initialize();

        if (this.isSharedStateMode()) {
            return registryStateService.mutate(async (snapshot) => {
                const activeSnapshot = this.pruneExpiredSnapshot(snapshot).snapshot;
                this.loadSnapshotIntoMemory(activeSnapshot, false);

                const service = Service.buildByObj(serviceObj);
                if (!service || _.isNull(service)) {
                    return {
                        result: undefined,
                        registry: sRegistry.getRegServers()
                    };
                }

                await this.registerService(service, false);
                service.registeredAt = new Date().toLocaleString();

                return {
                    result: service,
                    registry: sRegistry.getRegServers()
                };
            });
        }

        const service = Service.buildByObj(serviceObj);
        if (!service || _.isNull(service)) {
            return;
        }

        await this.registerService(service);
        service.registeredAt = new Date().toLocaleString();
        return service;
    }

    getRegisteredServers = async () => {
        await this.initialize();
        await this.syncForRead();
        return sRegistry.getRegServers();
    }

    getOffsetAndIncrement = async (serviceName) => {
        await this.initialize();

        if (this.isSharedStateMode()) {
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

    reset = async (clearPersistedState = true) => {
        sRegistry.reset();
        if (clearPersistedState) {
            await registryStateService.clear();
        }
        this.initialized = false;
        this.initializationPromise = undefined;
    }
}

const registryService = new RegistryService();

module.exports = {
    registryService
}
