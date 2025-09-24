const axios = require('axios');
const config = require('../config/config');

class FederationService {
    constructor() {
        this.federatedRegistries = new Map(); // name -> {url, lastHealthCheck, isHealthy, region, datacenter, replicationLag, failoverPriority}
        this.primaryRegistry = null; // Current primary registry
        this.failoverInProgress = false;
        this.replicationLagThreshold = 5000; // 5 seconds
        this.loadFederatedRegistries();
    }

    loadFederatedRegistries() {
        if (!config.federationEnabled) return;

        config.federationPeers.forEach(peer => {
            const [name, url] = peer.split(':');
            if (name && url) {
                this.federatedRegistries.set(name, {
                    url: url.startsWith('http') ? url : `http://${url}`,
                    lastHealthCheck: 0,
                    isHealthy: true,
                    region: this.extractRegionFromUrl(url),
                    datacenter: this.extractDatacenterFromUrl(url),
                    replicationLag: 0,
                    failoverPriority: this.calculateFailoverPriority(name),
                    lastReplicationCheck: 0
                });
            }
        });

        // Determine initial primary
        this.selectPrimaryRegistry();

        // Start periodic health checks and failover monitoring
        setInterval(() => {
            this.healthCheckFederatedRegistries();
            this.checkReplicationLag();
            this.performFailoverIfNeeded();
        }, 30000); // Every 30 seconds
    }

    addFederatedRegistry(name, url) {
        if (!config.federationEnabled) {
            throw new Error('Federation is not enabled');
        }

        if (this.federatedRegistries.has(name)) {
            throw new Error(`Federated registry ${name} already exists`);
        }

        this.federatedRegistries.set(name, {
            url: url.startsWith('http') ? url : `http://${url}`,
            lastHealthCheck: Date.now(),
            isHealthy: true
        });

        return { name, url: this.federatedRegistries.get(name).url };
    }

    removeFederatedRegistry(name) {
        if (!this.federatedRegistries.has(name)) {
            throw new Error(`Federated registry ${name} not found`);
        }

        this.federatedRegistries.delete(name);
        return { name };
    }

    getFederatedRegistries() {
        return Array.from(this.federatedRegistries.entries()).map(([name, data]) => ({
            name,
            url: data.url,
            isHealthy: data.isHealthy,
            lastHealthCheck: data.lastHealthCheck
        }));
    }

    async queryFederatedRegistry(name, serviceName) {
        const registry = this.federatedRegistries.get(name);
        if (!registry || !registry.isHealthy) {
            return null;
        }

        try {
            const response = await axios.get(`${registry.url}/discover?serviceName=${serviceName}`, {
                timeout: config.federationTimeout
            });

            if (response.status === 200 && response.data) {
                return response.data;
            }
        } catch (error) {
            console.warn(`Failed to query federated registry ${name}: ${error.message}`);
            registry.isHealthy = false;
        }

        return null;
    }

    async discoverFromFederation(serviceName) {
        if (!config.federationEnabled) return [];

        const results = [];
        const promises = Array.from(this.federatedRegistries.keys()).map(async (name) => {
            const result = await this.queryFederatedRegistry(name, serviceName);
            if (result) {
                results.push(result);
            }
        });

        await Promise.allSettled(promises);
        return results;
    }

    async replicateRegistration(serviceName, serviceData) {
        if (!config.federationEnabled) return;

        const promises = Array.from(this.federatedRegistries.entries()).map(async ([name, registry]) => {
            if (!registry.isHealthy) return;

            try {
                await axios.post(`${registry.url}/register`, serviceData, {
                    timeout: config.federationTimeout
                });
            } catch (error) {
                console.warn(`Failed to replicate registration to ${name}: ${error.message}`);
            }
        });

        await Promise.allSettled(promises);
    }

    async replicateDeregistration(serviceName, nodeName) {
        if (!config.federationEnabled) return;

        const promises = Array.from(this.federatedRegistries.entries()).map(async ([name, registry]) => {
            if (!registry.isHealthy) return;

            try {
                await axios.delete(`${registry.url}/deregister?serviceName=${serviceName}&nodeName=${nodeName}`, {
                    timeout: config.federationTimeout
                });
            } catch (error) {
                console.warn(`Failed to replicate deregistration to ${name}: ${error.message}`);
            }
        });

        await Promise.allSettled(promises);
    }

    extractRegionFromUrl(url) {
        // Extract region from URL (e.g., us-east-1 from url)
        const match = url.match(/(\w+-\w+-\d+)/);
        return match ? match[1] : 'unknown';
    }

    extractDatacenterFromUrl(url) {
        // Extract datacenter from URL
        const match = url.match(/dc-(\w+)/);
        return match ? match[1] : 'default';
    }

    calculateFailoverPriority(name) {
        // Calculate priority based on name (lower number = higher priority)
        const match = name.match(/(\d+)/);
        return match ? parseInt(match[1]) : 999;
    }

    selectPrimaryRegistry() {
        const healthyRegistries = Array.from(this.federatedRegistries.entries())
            .filter(([, registry]) => registry.isHealthy)
            .sort(([, a], [, b]) => a.failoverPriority - b.failoverPriority);

        if (healthyRegistries.length > 0) {
            this.primaryRegistry = healthyRegistries[0][0];
        } else {
            this.primaryRegistry = null;
        }
    }

    async checkReplicationLag() {
        if (!config.federationEnabled) return;

        const now = Date.now();
        const promises = Array.from(this.federatedRegistries.entries()).map(async ([name, registry]) => {
            if (now - registry.lastReplicationCheck < 60000) return; // Check every minute

            try {
                // Check replication lag by comparing timestamps
                const response = await axios.get(`${registry.url}/metrics`, {
                    timeout: 2000
                });

                if (response.status === 200 && response.data) {
                    const remoteUptime = response.data.uptime || 0;
                    const localUptime = process.uptime() * 1000;
                    registry.replicationLag = Math.abs(localUptime - remoteUptime);
                    registry.lastReplicationCheck = now;
                }
            } catch (error) {
                registry.replicationLag = Infinity;
                registry.lastReplicationCheck = now;
            }
        });

        await Promise.allSettled(promises);
    }

    performFailoverIfNeeded() {
        if (this.failoverInProgress) return;

        const currentPrimary = this.primaryRegistry;
        const currentPrimaryData = currentPrimary ? this.federatedRegistries.get(currentPrimary) : null;

        // Check if current primary is unhealthy or has high replication lag
        if (!currentPrimaryData || !currentPrimaryData.isHealthy || currentPrimaryData.replicationLag > this.replicationLagThreshold) {
            this.failoverInProgress = true;

            // Select new primary
            this.selectPrimaryRegistry();

            if (this.primaryRegistry !== currentPrimary) {
                // Federation failover occurred

                // Broadcast failover event
                if (global.broadcast) {
                    global.broadcast('federation_failover', {
                        oldPrimary: currentPrimary,
                        newPrimary: this.primaryRegistry,
                        timestamp: Date.now()
                    });
                }

                // Trigger data synchronization from new primary
                this.synchronizeFromPrimary();
            }

            this.failoverInProgress = false;
        }
    }

    async synchronizeFromPrimary() {
        if (!this.primaryRegistry) return;

        const primaryData = this.federatedRegistries.get(this.primaryRegistry);
        if (!primaryData || !primaryData.isHealthy) return;

        try {
            // Get all services from primary
            const response = await axios.get(`${primaryData.url}/servers`, {
                timeout: 5000
            });

            if (response.status === 200 && response.data) {
                // Synchronize local registry with primary data
                // This would require access to the local service registry
                // Synchronized services from primary
            }
        } catch (error) {
            console.warn(`Failed to synchronize from primary ${this.primaryRegistry}: ${error.message}`);
        }
    }

    getFailoverStatus() {
        return {
            primaryRegistry: this.primaryRegistry,
            failoverInProgress: this.failoverInProgress,
            registries: Array.from(this.federatedRegistries.entries()).map(([name, data]) => ({
                name,
                url: data.url,
                isHealthy: data.isHealthy,
                region: data.region,
                datacenter: data.datacenter,
                replicationLag: data.replicationLag,
                failoverPriority: data.failoverPriority,
                lastHealthCheck: data.lastHealthCheck,
                lastReplicationCheck: data.lastReplicationCheck
            }))
        };
    }

    async healthCheckFederatedRegistries() {
        if (!config.federationEnabled) return;

        const now = Date.now();
        const promises = Array.from(this.federatedRegistries.entries()).map(async ([name, registry]) => {
            if (now - registry.lastHealthCheck < 30000) return; // Check every 30s

            try {
                const response = await axios.get(`${registry.url}/health`, {
                    timeout: 2000
                });

                registry.isHealthy = response.status === 200;
                registry.lastHealthCheck = now;
            } catch (error) {
                registry.isHealthy = false;
                registry.lastHealthCheck = now;
            }
        });

        await Promise.allSettled(promises);

        // Update primary selection after health checks
        this.selectPrimaryRegistry();
    }
}

module.exports = new FederationService();