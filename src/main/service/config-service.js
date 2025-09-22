class ConfigService {
    constructor() {
        this.configs = new Map();
    }

    setConfig(serviceName, key, value, namespace = "default", region = "default", zone = "default") {
        const fullServiceName = (region !== "default" || zone !== "default") ?
            `${namespace}:${region}:${zone}:${serviceName}` :
            `${namespace}:${serviceName}`;
        if (!this.configs.has(fullServiceName)) {
            this.configs.set(fullServiceName, new Map());
        }
        this.configs.get(fullServiceName).set(key, value);
        return true;
    }

    getConfig(serviceName, key, namespace = "default", region = "default", zone = "default") {
        const fullServiceName = (region !== "default" || zone !== "default") ?
            `${namespace}:${region}:${zone}:${serviceName}` :
            `${namespace}:${serviceName}`;
        if (!this.configs.has(fullServiceName)) return null;
        return this.configs.get(fullServiceName).get(key) || null;
    }

    getAllConfig(serviceName, namespace = "default", region = "default", zone = "default") {
        const fullServiceName = (region !== "default" || zone !== "default") ?
            `${namespace}:${region}:${zone}:${serviceName}` :
            `${namespace}:${serviceName}`;
        if (!this.configs.has(fullServiceName)) return {};
        return Object.fromEntries(this.configs.get(fullServiceName));
    }

    deleteConfig(serviceName, key, namespace = "default", region = "default", zone = "default") {
        const fullServiceName = (region !== "default" || zone !== "default") ?
            `${namespace}:${region}:${zone}:${serviceName}` :
            `${namespace}:${serviceName}`;
        if (!this.configs.has(fullServiceName)) return false;
        return this.configs.get(fullServiceName).delete(key);
    }
}

const configService = new ConfigService();

module.exports = {
    configService
};