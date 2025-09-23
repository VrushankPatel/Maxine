const axios = require('axios');

class MaxineClient {
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.client = axios.create({
            baseURL: baseUrl,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
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
        const response = await this.client.get('/api/maxine/serviceops/discover', { params });
        return response.data;
    }

    async getServiceInfo(serviceName, options = {}) {
        const params = { serviceName, ...options };
        const response = await this.client.get('/api/maxine/serviceops/discover/info', { params });
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
}

module.exports = MaxineClient;