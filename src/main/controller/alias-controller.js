const { serviceRegistry } = require('../entity/service-registry');
const { statusAndMsgs } = require("../util/constants/constants");

const addAlias = (req, res) => {
    const { alias, serviceName, version, namespace = "default", region = "default", zone = "default" } = req.body;

    if (!alias || !serviceName) {
        return res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({
            message: "alias and serviceName are required"
        });
    }

    const fullAliasName = (region !== "default" || zone !== "default") ?
        (version ? `${namespace}:${region}:${zone}:${alias}:${version}` : `${namespace}:${region}:${zone}:${alias}`) :
        (version ? `${namespace}:${alias}:${version}` : `${namespace}:${alias}`);

    const fullServiceName = (region !== "default" || zone !== "default") ?
        (version ? `${namespace}:${region}:${zone}:${serviceName}:${version}` : `${namespace}:${region}:${zone}:${serviceName}`) :
        (version ? `${namespace}:${serviceName}:${version}` : `${namespace}:${serviceName}`);

    // Check if the primary service exists
    if (!serviceRegistry.registry[fullServiceName]) {
        return res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({
            message: "Primary service does not exist"
        });
    }

    serviceRegistry.addServiceAlias(fullAliasName, fullServiceName);

    res.status(200).json({
        message: "Alias added successfully",
        alias: fullAliasName,
        service: fullServiceName
    });
};

const removeAlias = (req, res) => {
    const { alias, version, namespace = "default", region = "default", zone = "default" } = req.body;

    if (!alias) {
        return res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({
            message: "alias is required"
        });
    }

    const fullAliasName = (region !== "default" || zone !== "default") ?
        (version ? `${namespace}:${region}:${zone}:${alias}:${version}` : `${namespace}:${region}:${zone}:${alias}`) :
        (version ? `${namespace}:${alias}:${version}` : `${namespace}:${alias}`);

    serviceRegistry.removeServiceAlias(fullAliasName);

    res.status(200).json({
        message: "Alias removed successfully",
        alias: fullAliasName
    });
};

const getAliases = (req, res) => {
    const { serviceName, version, namespace = "default", region = "default", zone = "default" } = req.query;

    let fullServiceName;
    if (serviceName) {
        fullServiceName = (region !== "default" || zone !== "default") ?
            (version ? `${namespace}:${region}:${zone}:${serviceName}:${version}` : `${namespace}:${region}:${zone}:${serviceName}`) :
            (version ? `${namespace}:${serviceName}:${version}` : `${namespace}:${serviceName}`);
    }

    let aliases;
    if (fullServiceName) {
        aliases = serviceRegistry.getAliasesForService(fullServiceName);
    } else {
        // Return all aliases
        aliases = Array.from(serviceRegistry.serviceAliases.entries()).map(([alias, primary]) => ({
            alias,
            service: primary
        }));
    }

    res.status(200).json({
        aliases
    });
};

module.exports = {
    addAlias,
    removeAlias,
    getAliases
};