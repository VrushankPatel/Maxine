const axios = require('axios');
const config = require('../config/config');

class FederationService {
    constructor() {
        this.federatedRegistries = new Map(); // name -> {url, lastHealthCheck, isHealthy}
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
                    isHealthy: true
                });
            }
        });

        // Start periodic health checks
        setInterval(() => {
            this.healthCheckFederatedRegistries();
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
    }
}

module.exports = new FederationService();