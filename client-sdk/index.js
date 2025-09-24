const axios = require('axios');
const { LRUCache } = require('lru-cache');
const dgram = require('dgram');
const net = require('net');
const WebSocket = require('ws');

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

    // Lightning Mode API Methods (for ultra-fast operations)

    async registerServiceLightning(serviceName, host, port, metadata = {}, tags = [], version = null, environment = null, namespace = 'default', datacenter = 'default') {
        const payload = {
            serviceName,
            host,
            port,
            metadata,
            tags,
            version,
            environment,
            namespace,
            datacenter
        };
        const response = await this.client.post('/register', payload);
        return response.data;
    }

    async discoverServiceLightning(serviceName, strategy = 'round-robin', clientId = null, tags = [], version = null, environment = null, namespace = 'default', datacenter = 'default') {
        const params = {
            serviceName,
            loadBalancing: strategy,
            namespace,
            datacenter
        };
        if (clientId) params.clientId = clientId;
        if (tags.length > 0) params.tags = tags.join(',');
        if (version) params.version = version;
        if (environment) params.environment = environment;

        const cacheKey = 'lightning:' + JSON.stringify(params);
        if (this.discoveryCache.has(cacheKey)) {
            return this.discoveryCache.get(cacheKey);
        }
        const response = await this.client.get('/discover', { params });
        this.discoveryCache.set(cacheKey, response.data);
        return response.data;
    }

    async heartbeatLightning(nodeId) {
        const payload = { nodeId };
        const response = await this.client.post('/heartbeat', payload);
        return response.data;
    }

    async deregisterServiceLightning(serviceName, nodeName, namespace = 'default', datacenter = 'default') {
        const payload = {
            serviceName,
            nodeName,
            namespace,
            datacenter
        };
        const response = await this.client.delete('/deregister', { data: payload });
        return response.data;
    }

    async listServicesLightning() {
        const response = await this.client.get('/servers');
        return response.data;
    }

    async getHealthLightning() {
        const response = await this.client.get('/health');
        return response.data;
    }

    async getMetricsLightning() {
        const response = await this.client.get('/metrics');
        return response.data;
    }
}

class WebSocketClient {
    constructor(baseUrl = 'ws://localhost:8080', token = null) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.ws = null;
        this.connected = false;
        this.eventHandlers = {};
    }

    on(eventType, handler) {
        if (!this.eventHandlers[eventType]) {
            this.eventHandlers[eventType] = [];
        }
        this.eventHandlers[eventType].push(handler);
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.baseUrl);

            this.ws.on('open', () => {
                this.connected = true;
                if (this.token) {
                    this.ws.send(JSON.stringify({ auth: this.token }));
                }
                resolve();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    const eventType = message.event;
                    if (eventType && this.eventHandlers[eventType]) {
                        this.eventHandlers[eventType].forEach(handler => handler(message));
                    }
                } catch (e) {
                    // Ignore invalid JSON
                }
            });

            this.ws.on('close', () => {
                this.connected = false;
            });

            this.ws.on('error', (error) => {
                reject(error);
            });
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }

    subscribe(eventType, serviceName = null, nodeId = null) {
        if (this.ws && this.connected) {
            const subscription = { subscribe: { event: eventType } };
            if (serviceName) subscription.subscribe.serviceName = serviceName;
            if (nodeId) subscription.subscribe.nodeId = nodeId;
            this.ws.send(JSON.stringify(subscription));
        }
    }

    unsubscribe() {
        if (this.ws && this.connected) {
            this.ws.send(JSON.stringify({ unsubscribe: true }));
        }
    }

    refreshToken() {
        if (this.ws && this.connected && this.token) {
            this.ws.send(JSON.stringify({ refresh_token: true }));
        }
    }
}

module.exports = { MaxineClient, WebSocketClient };