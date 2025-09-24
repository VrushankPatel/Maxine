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
        global.eventEmitter.emit('config_changed', { serviceName, key, value, namespace, region, zone });
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
        const deleted = this.configs.get(fullServiceName).delete(key);
        if (deleted) global.eventEmitter.emit('config_deleted', { serviceName, key, namespace, region, zone });
        return deleted;
    }
}

const configService = new ConfigService();

module.exports = {
    configService
};