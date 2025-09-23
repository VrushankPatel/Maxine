const axios = require('axios');
const { LRUCache } = require('lru-cache');
const dgram = require('dgram');
const net = require('net');

class MaxineClient {
    constructor(baseUrl, token, cacheOptions = {}) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.client = axios.create({
            baseURL: baseUrl,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        this.discoveryCache = new LRUCache({
            max: cacheOptions.max || 100,
            ttl: cacheOptions.ttl || 30000 // 30 seconds default
        });
    }

    async register(serviceData) {
        const response = await this.client.post('/api/maxine/serviceops/register', serviceData);
        return response.data;
    }

    async deregister(serviceName, nodeName, namespace = 'default') {
        const response = await this.client.delete('/api/maxine/serviceops/deregister', {
            data: { serviceName, nodeName, namespace }
        });
        return response.data;
    }

    async discover(serviceName, options = {}) {
        const params = { serviceName, ...options };
        const cacheKey = JSON.stringify(params);
        if (this.discoveryCache.has(cacheKey)) {
            return this.discoveryCache.get(cacheKey);
        }
        const response = await this.client.get('/api/maxine/serviceops/discover', { params });
        this.discoveryCache.set(cacheKey, response.data);
        return response.data;
    }

    async discoverUdp(serviceName, udpPort = 8081, udpHost = 'localhost') {
        return new Promise((resolve, reject) => {
            const client = dgram.createSocket('udp4');
            client.send(serviceName, 0, serviceName.length, udpPort, udpHost, (err) => {
                if (err) {
                    client.close();
                    reject(err);
                }
            });
            client.on('message', (msg) => {
                client.close();
                try {
                    const data = JSON.parse(msg.toString());
                    resolve(data);
                } catch (e) {
                    reject(e);
                }
            });
            client.on('error', (err) => {
                client.close();
                reject(err);
            });
        });
    }

    async discoverTcp(serviceName, tcpPort = 8082, tcpHost = 'localhost') {
        return new Promise((resolve, reject) => {
            const client = net.createConnection({ host: tcpHost, port: tcpPort }, () => {
                client.write(serviceName + '\n');
            });
            let data = '';
            client.on('data', (chunk) => {
                data += chunk.toString();
                if (data.endsWith('\n')) {
                    client.end();
                    try {
                        const result = JSON.parse(data.trim());
                        resolve(result);
                    } catch (e) {
                        reject(e);
                    }
                }
            });
            client.on('error', (err) => {
                reject(err);
            });
            client.on('timeout', () => {
                client.destroy();
                reject(new Error('TCP discovery timeout'));
            });
            client.setTimeout(5000); // 5 second timeout
        });
    }

    async getServiceInfo(serviceName, options = {}) {
        const params = { serviceName, ...options };
        const cacheKey = 'info:' + JSON.stringify(params);
        if (this.discoveryCache.has(cacheKey)) {
            return this.discoveryCache.get(cacheKey);
        }
        const response = await this.client.get('/api/maxine/serviceops/discover/info', { params });
        this.discoveryCache.set(cacheKey, response.data);
        return response.data;
    }

    async getHealth(serviceName, namespace = 'default') {
        const params = { serviceName, namespace };
        const response = await this.client.get('/api/maxine/serviceops/health', { params });
        return response.data;
    }

    async getMetrics() {
        const response = await this.client.get('/api/maxine/serviceops/metrics');
        return response.data;
    }

    async setConfig(serviceName, key, value) {
        const response = await this.client.post('/api/maxine/serviceops/config/set', { serviceName, key, value });
        return response.data;
    }

    async getConfig(serviceName, key) {
        const params = { serviceName, key };
        const response = await this.client.get('/api/maxine/serviceops/config/get', { params });
        return response.data;
    }

    async addAlias(alias, primaryServiceName) {
        const response = await this.client.post('/api/maxine/serviceops/aliases/add', { alias, primaryServiceName });
        return response.data;
    }

    async removeAlias(alias) {
        const response = await this.client.delete('/api/maxine/serviceops/aliases/remove', { data: { alias } });
        return response.data;
    }

    async getAliases(serviceName) {
        const params = { serviceName };
        const response = await this.client.get('/api/maxine/serviceops/aliases', { params });
        return response.data;
    }

    async addWebhook(serviceName, url) {
        const response = await this.client.post('/api/maxine/serviceops/webhooks/add', { serviceName, url });
        return response.data;
    }

    async removeWebhook(serviceName, url) {
        const response = await this.client.delete('/api/maxine/serviceops/webhooks/remove', { data: { serviceName, url } });
        return response.data;
    }

    async getWebhooks(serviceName) {
        const params = { serviceName };
        const response = await this.client.get('/api/maxine/serviceops/webhooks', { params });
        return response.data;
    }

    async setKv(key, value) {
        const response = await this.client.post('/api/maxine/serviceops/kv/set', { key, value });
        return response.data;
    }

    async getKv(key) {
        const params = { key };
        const response = await this.client.get('/api/maxine/serviceops/kv/get', { params });
        return response.data.value;
    }

    async deleteKv(key) {
        const response = await this.client.delete('/api/maxine/serviceops/kv/delete', { data: { key } });
        return response.data;
    }

    async getAllKv() {
        const response = await this.client.get('/api/maxine/serviceops/kv/all');
        return response.data;
    }

    clearCache() {
        this.discoveryCache.clear();
    }
}

module.exports = MaxineClient;