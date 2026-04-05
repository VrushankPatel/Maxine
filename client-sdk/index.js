const axios = require('axios');

class MaxineClient {
    constructor(options) {
        const normalizedOptions = typeof options === 'string' ? { baseUrl: options } : (options || {});
        if (!normalizedOptions.baseUrl) {
            throw new Error('MaxineClient requires a baseUrl.');
        }

        this.baseUrl = normalizedOptions.baseUrl.replace(/\/$/, '');
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json'
            },
            ...normalizedOptions.axiosConfig
        });

        this.setAccessToken(normalizedOptions.token || null);
    }

    setAccessToken(token) {
        this.token = token || null;
        if (this.token) {
            this.client.defaults.headers.common.Authorization = `Bearer ${this.token}`;
            return;
        }
        delete this.client.defaults.headers.common.Authorization;
    }

    async signIn(userName, password) {
        const response = await this.client.post('/api/maxine/signin', { userName, password });
        this.setAccessToken(response.data.accessToken);
        return response.data.accessToken;
    }

    async changePassword(password, newPassword) {
        const response = await this.client.put('/api/maxine/change-password', { password, newPassword });
        return response.data;
    }

    async register(serviceData) {
        const response = await this.client.post('/api/maxine/serviceops/register', serviceData);
        return response.data;
    }

    async discoverLocation(serviceName, endPoint = '') {
        const response = await this.client.get('/api/maxine/serviceops/discover', {
            params: {
                serviceName,
                ...(endPoint ? { endPoint } : {})
            },
            maxRedirects: 0,
            validateStatus: (status) => status === 302 || status === 400 || status === 503
        });

        return {
            status: response.status,
            location: response.headers.location || null,
            data: response.data
        };
    }

    async listServers() {
        const response = await this.client.get('/api/maxine/serviceops/servers');
        return response.data;
    }

    async getConfig() {
        const response = await this.client.get('/api/maxine/control/config');
        return response.data;
    }

    async updateConfig(configPatch) {
        const response = await this.client.put('/api/maxine/control/config', configPatch);
        return response.data;
    }

    async listLogFiles() {
        const response = await this.client.get('/api/logs/download');
        return response.data;
    }

    async getRecentLogs() {
        const response = await this.client.get('/api/logs/recent');
        return response.data;
    }

    async clearRecentLogs() {
        const response = await this.client.get('/api/logs/recent/clear');
        return response.status;
    }

    async actuatorHealth() {
        const response = await this.client.get('/api/actuator/health');
        return response.data;
    }

    async actuatorInfo() {
        const response = await this.client.get('/api/actuator/info');
        return response.data;
    }

    async actuatorMetrics() {
        const response = await this.client.get('/api/actuator/metrics');
        return response.data;
    }

    async actuatorPerformance() {
        const response = await this.client.get('/api/actuator/performance', {
            responseType: 'text'
        });
        return response.data;
    }

    startHeartbeat(serviceData, options = {}) {
        const intervalMs = options.intervalMs
            || Math.max(1000, Math.floor(((serviceData.timeOut || 5) * 1000) / 2));
        let stopped = false;
        const onError = typeof options.onError === 'function' ? options.onError : null;

        const tick = async () => {
            if (stopped) {
                return null;
            }
            return this.register(serviceData);
        };

        if (options.immediately !== false) {
            tick().catch((error) => {
                if (onError) {
                    onError(error);
                }
            });
        }

        const timer = setInterval(() => {
            tick().catch((error) => {
                if (onError) {
                    onError(error);
                }
            });
        }, intervalMs);

        return {
            intervalMs,
            stop() {
                stopped = true;
                clearInterval(timer);
            },
            tick
        };
    }
}

module.exports = {
    MaxineClient
};
