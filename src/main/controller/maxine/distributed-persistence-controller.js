const config = require("../../config/config");
const { serviceRegistry } = require("../../entity/service-registry");

// Distributed persistence implementations
class TiKVStorage {
    constructor() {
        this.client = null;
        this.connected = false;
        this.namespace = 'maxine';
    }

    async connect() {
        try {
            // In real implementation, use tikv-client or similar
            // For simulation, we'll use a Map
            this.client = new Map();
            this.connected = true;
            console.log('TiKV storage connected');
        } catch (error) {
            console.error('TiKV connection failed:', error);
            throw error;
        }
    }

    async disconnect() {
        this.connected = false;
        this.client = null;
    }

    async put(key, value) {
        if (!this.connected) throw new Error('TiKV not connected');
        this.client.set(`${this.namespace}:${key}`, {
            value,
            timestamp: Date.now(),
            version: 1
        });
    }

    async get(key) {
        if (!this.connected) throw new Error('TiKV not connected');
        const entry = this.client.get(`${this.namespace}:${key}`);
        return entry ? entry.value : null;
    }

    async delete(key) {
        if (!this.connected) throw new Error('TiKV not connected');
        return this.client.delete(`${this.namespace}:${key}`);
    }

    async scan(prefix, limit = 100) {
        if (!this.connected) throw new Error('TiKV not connected');
        const results = [];
        const prefixKey = `${this.namespace}:${prefix}`;

        for (const [key, entry] of this.client) {
            if (key.startsWith(prefixKey) && results.length < limit) {
                results.push({ key: key.replace(`${this.namespace}:`, ''), value: entry.value });
            }
        }

        return results;
    }
}

class FoundationDBStorage {
    constructor() {
        this.db = null;
        this.connected = false;
        this.clusterFile = config.foundationDBClusterFile || '/etc/foundationdb/fdb.cluster';
    }

    async connect() {
        try {
            // In real implementation, use foundationdb npm package
            // For simulation, we'll use a Map with subspace simulation
            this.db = new Map();
            this.connected = true;
            console.log('FoundationDB storage connected');
        } catch (error) {
            console.error('FoundationDB connection failed:', error);
            throw error;
        }
    }

    async disconnect() {
        this.connected = false;
        this.db = null;
    }

    async put(key, value) {
        if (!this.connected) throw new Error('FoundationDB not connected');
        this.db.set(key, {
            value,
            timestamp: Date.now(),
            version: 1
        });
    }

    async get(key) {
        if (!this.connected) throw new Error('FoundationDB not connected');
        const entry = this.db.get(key);
        return entry ? entry.value : null;
    }

    async delete(key) {
        if (!this.connected) throw new Error('FoundationDB not connected');
        return this.db.delete(key);
    }

    async getRange(startKey, endKey, limit = 100) {
        if (!this.connected) throw new Error('FoundationDB not connected');
        const results = [];

        // Simple range query simulation
        for (const [key, entry] of this.db) {
            if (key >= startKey && key < endKey && results.length < limit) {
                results.push({ key, value: entry.value });
            }
        }

        return results;
    }
}

class DistributedPersistenceManager {
    constructor() {
        this.storages = new Map();
        this.activeStorage = null;
        this.replicationEnabled = config.distributedReplicationEnabled || false;
        this.replicas = config.persistenceReplicas || 3;
    }

    async initialize() {
        const persistenceType = config.persistenceType;

        if (persistenceType === 'tikv') {
            this.activeStorage = new TiKVStorage();
            await this.activeStorage.connect();
        } else if (persistenceType === 'foundationdb') {
            this.activeStorage = new FoundationDBStorage();
            await this.activeStorage.connect();
        }

        if (this.activeStorage) {
            this.storages.set(persistenceType, this.activeStorage);
        }
    }

    async saveServiceRegistry(registryData) {
        if (!this.activeStorage) return;

        try {
            const key = 'service-registry';
            const compressedData = this.compressData(registryData);
            await this.activeStorage.put(key, compressedData);

            if (this.replicationEnabled) {
                await this.replicateToReplicas(key, compressedData);
            }
        } catch (error) {
            console.error('Failed to save service registry:', error);
            throw error;
        }
    }

    async loadServiceRegistry() {
        if (!this.activeStorage) return null;

        try {
            const key = 'service-registry';
            let data = await this.activeStorage.get(key);

            if (!data && this.replicationEnabled) {
                data = await this.loadFromReplica(key);
            }

            return data ? this.decompressData(data) : null;
        } catch (error) {
            console.error('Failed to load service registry:', error);
            return null;
        }
    }

    async saveServiceMetrics(serviceName, metrics) {
        if (!this.activeStorage) return;

        try {
            const key = `metrics:${serviceName}`;
            await this.activeStorage.put(key, metrics);
        } catch (error) {
            console.error(`Failed to save metrics for ${serviceName}:`, error);
        }
    }

    async loadServiceMetrics(serviceName) {
        if (!this.activeStorage) return null;

        try {
            const key = `metrics:${serviceName}`;
            return await this.activeStorage.get(key);
        } catch (error) {
            console.error(`Failed to load metrics for ${serviceName}:`, error);
            return null;
        }
    }

    async saveFederationData(federationId, data) {
        if (!this.activeStorage) return;

        try {
            const key = `federation:${federationId}`;
            await this.activeStorage.put(key, data);
        } catch (error) {
            console.error(`Failed to save federation data for ${federationId}:`, error);
        }
    }

    async loadFederationData(federationId) {
        if (!this.activeStorage) return null;

        try {
            const key = `federation:${federationId}`;
            return await this.activeStorage.get(key);
        } catch (error) {
            console.error(`Failed to load federation data for ${federationId}:`, error);
            return null;
        }
    }

    async saveCircuitBreakerState(serviceName, state) {
        if (!this.activeStorage) return;

        try {
            const key = `circuit-breaker:${serviceName}`;
            await this.activeStorage.put(key, state);
        } catch (error) {
            console.error(`Failed to save circuit breaker state for ${serviceName}:`, error);
        }
    }

    async loadCircuitBreakerState(serviceName) {
        if (!this.activeStorage) return null;

        try {
            const key = `circuit-breaker:${serviceName}`;
            return await this.activeStorage.get(key);
        } catch (error) {
            console.error(`Failed to load circuit breaker state for ${serviceName}:`, error);
            return null;
        }
    }

    async getAllKeys(prefix = '', limit = 1000) {
        if (!this.activeStorage) return [];

        try {
            if (this.activeStorage instanceof TiKVStorage) {
                return await this.activeStorage.scan(prefix, limit);
            } else if (this.activeStorage instanceof FoundationDBStorage) {
                const startKey = prefix;
                const endKey = prefix + '\uffff';
                return await this.activeStorage.getRange(startKey, endKey, limit);
            }
        } catch (error) {
            console.error('Failed to get keys:', error);
            return [];
        }

        return [];
    }

    async replicateToReplicas(key, data) {
        // Simulate replication to multiple nodes
        for (let i = 1; i <= this.replicas; i++) {
            try {
                const replicaKey = `${key}:replica:${i}`;
                await this.activeStorage.put(replicaKey, data);
            } catch (error) {
                console.error(`Failed to replicate to replica ${i}:`, error);
            }
        }
    }

    async loadFromReplica(key) {
        // Try to load from replicas if primary fails
        for (let i = 1; i <= this.replicas; i++) {
            try {
                const replicaKey = `${key}:replica:${i}`;
                const data = await this.activeStorage.get(replicaKey);
                if (data) return data;
            } catch (error) {
                console.error(`Failed to load from replica ${i}:`, error);
            }
        }
        return null;
    }

    compressData(data) {
        // Simple compression simulation - in real implementation use zlib
        return JSON.stringify(data);
    }

    decompressData(data) {
        // Simple decompression simulation
        return JSON.parse(data);
    }

    getStatus() {
        return {
            activeStorage: config.persistenceType,
            connected: this.activeStorage ? this.activeStorage.connected : false,
            replicationEnabled: this.replicationEnabled,
            replicas: this.replicas,
            supportedTypes: ['tikv', 'foundationdb'],
            timestamp: new Date().toISOString()
        };
    }

    async cleanup() {
        for (const [type, storage] of this.storages) {
            try {
                await storage.disconnect();
            } catch (error) {
                console.error(`Error disconnecting ${type}:`, error);
            }
        }
        this.storages.clear();
        this.activeStorage = null;
    }
}

// Singleton instance
const distributedPersistence = new DistributedPersistenceManager();

// Initialize on module load
distributedPersistence.initialize().catch(console.error);

// Controller functions
const getPersistenceStatus = (req, res) => {
    const status = distributedPersistence.getStatus();
    res.json(status);
};

const saveRegistrySnapshot = async (req, res) => {
    try {
        const registryData = serviceRegistry.getRegServers();
        await distributedPersistence.saveServiceRegistry(registryData);
        res.json({
            success: true,
            message: 'Registry snapshot saved to distributed storage',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to save registry snapshot',
            details: error.message
        });
    }
};

const loadRegistrySnapshot = async (req, res) => {
    try {
        const data = await distributedPersistence.loadServiceRegistry();
        if (data) {
            res.json({
                success: true,
                data,
                message: 'Registry snapshot loaded from distributed storage'
            });
        } else {
            res.status(404).json({ error: 'No registry snapshot found' });
        }
    } catch (error) {
        res.status(500).json({
            error: 'Failed to load registry snapshot',
            details: error.message
        });
    }
};

const getStoredKeys = async (req, res) => {
    const { prefix = '', limit = 100 } = req.query;

    try {
        const keys = await distributedPersistence.getAllKeys(prefix, parseInt(limit));
        res.json({
            keys,
            count: keys.length,
            prefix,
            limit: parseInt(limit)
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to retrieve stored keys',
            details: error.message
        });
    }
};

const saveServiceData = async (req, res) => {
    const { serviceName, data, type = 'metrics' } = req.body;

    if (!serviceName || !data) {
        return res.status(400).json({ error: 'serviceName and data required' });
    }

    try {
        switch (type) {
            case 'metrics':
                await distributedPersistence.saveServiceMetrics(serviceName, data);
                break;
            case 'federation':
                await distributedPersistence.saveFederationData(serviceName, data);
                break;
            case 'circuit-breaker':
                await distributedPersistence.saveCircuitBreakerState(serviceName, data);
                break;
            default:
                return res.status(400).json({ error: 'Invalid data type' });
        }

        res.json({
            success: true,
            message: `${type} data saved for ${serviceName}`,
            type,
            serviceName
        });
    } catch (error) {
        res.status(500).json({
            error: `Failed to save ${type} data`,
            details: error.message
        });
    }
};

const loadServiceData = async (req, res) => {
    const { serviceName, type = 'metrics' } = req.params;

    try {
        let data;
        switch (type) {
            case 'metrics':
                data = await distributedPersistence.loadServiceMetrics(serviceName);
                break;
            case 'federation':
                data = await distributedPersistence.loadFederationData(serviceName);
                break;
            case 'circuit-breaker':
                data = await distributedPersistence.loadCircuitBreakerState(serviceName);
                break;
            default:
                return res.status(400).json({ error: 'Invalid data type' });
        }

        if (data) {
            res.json({
                success: true,
                data,
                type,
                serviceName
            });
        } else {
            res.status(404).json({
                error: `${type} data not found for ${serviceName}`
            });
        }
    } catch (error) {
        res.status(500).json({
            error: `Failed to load ${type} data`,
            details: error.message
        });
    }
};

const configurePersistence = (req, res) => {
    const { type, replicationEnabled, replicas } = req.body;

    if (type && !['tikv', 'foundationdb'].includes(type)) {
        return res.status(400).json({ error: 'Invalid persistence type. Supported: tikv, foundationdb' });
    }

    // Update configuration (in real implementation, this would update config and restart)
    if (type) {
        config.persistenceType = type;
    }
    if (replicationEnabled !== undefined) {
        distributedPersistence.replicationEnabled = replicationEnabled;
    }
    if (replicas !== undefined) {
        distributedPersistence.replicas = replicas;
    }

    res.json({
        success: true,
        message: 'Persistence configuration updated',
        config: distributedPersistence.getStatus()
    });
};

module.exports = {
    getPersistenceStatus,
    saveRegistrySnapshot,
    loadRegistrySnapshot,
    getStoredKeys,
    saveServiceData,
    loadServiceData,
    configurePersistence
};