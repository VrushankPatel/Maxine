const { registryService } = require("../../services/registry-service");

const discoveryController = (req, res) => {
    const serviceName = req.params.serviceName;

    const serviceNodes = registryService.getNodes(serviceName);
    res.json(serviceNodes);
}

module.exports = discoveryController