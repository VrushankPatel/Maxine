const { info } = require('../../util/logging/logging-util');
const { statusAndMsgs } = require('../../util/constants/constants');
const { registryService } = require('../../service/registry-service');
const { serviceRegistry } = require('../../entity/service-registry');
const { metricsService } = require('../../service/metrics-service');
const axios = require('axios');

const registryController = (req, res) => {
    const serviceResponse = registryService.registryService(req.body);
    if(!serviceResponse){
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_INVALID_SERVICE_DATA});
    }
    info(serviceResponse);
    res.status(statusAndMsgs.STATUS_SUCCESS).json(serviceResponse);
}


const serverListController = (_req, res) => {
    res.type('application/json');
    res.send(JSON.stringify(serviceRegistry.getRegServers()));
}

const deregisterController = (req, res) => {
    const { serviceName, nodeName } = req.body;
    if (!serviceName || !nodeName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName or nodeName" });
        return;
    }
    const success = registryService.deregisterService(serviceName, nodeName);
    if (success) {
        res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: "Deregistered successfully" });
    } else {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Service not found" });
    }
}

const healthController = async (req, res) => {
    const serviceName = req.query.serviceName;
    if (!serviceName) {
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({ message: "Missing serviceName" });
        return;
    }
    const nodes = serviceRegistry.getNodes(serviceName);
    if (!nodes || Object.keys(nodes).length === 0) {
        res.status(statusAndMsgs.SERVICE_UNAVAILABLE).json({ message: "Service not found" });
        return;
    }
    const healthPromises = Object.entries(nodes).map(async ([nodeName, node]) => {
        try {
            const response = await axios.get(node.address, { timeout: 5000 });
            // Update registry with healthy status
            if (serviceRegistry.registry[serviceName] && serviceRegistry.registry[serviceName].nodes[nodeName]) {
                const nodeObj = serviceRegistry.registry[serviceName].nodes[nodeName];
                nodeObj.healthy = true;
                nodeObj.failureCount = 0;
                nodeObj.lastFailureTime = null;
                serviceRegistry.addToHealthyNodes(serviceName, nodeName);
            }
            return [nodeName, { status: 'healthy', code: response.status }];
        } catch (error) {
            // Update registry with unhealthy status
            if (serviceRegistry.registry[serviceName] && serviceRegistry.registry[serviceName].nodes[nodeName]) {
                const nodeObj = serviceRegistry.registry[serviceName].nodes[nodeName];
                nodeObj.healthy = false;
                nodeObj.failureCount = (nodeObj.failureCount || 0) + 1;
                nodeObj.lastFailureTime = Date.now();
                serviceRegistry.removeFromHealthyNodes(serviceName, nodeName);
            }
            return [nodeName, { status: 'unhealthy', error: error.message }];
        }
    });
    const healthResultsArray = await Promise.all(healthPromises);
    const healthResults = Object.fromEntries(healthResultsArray);
    res.status(statusAndMsgs.STATUS_SUCCESS).json({ serviceName, health: healthResults });
}

const metricsController = (req, res) => {
    res.status(statusAndMsgs.STATUS_SUCCESS).json(metricsService.getMetrics());
}

module.exports = {
    registryController,
    serverListController,
    deregisterController,
    healthController,
    metricsController
};