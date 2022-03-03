const { registryService } = require("../../services/registry-service");

const discoveryController = (req, res) => {
    const serviceName = req.params.serviceName;
    const serviceNode = registryService.getNode(serviceName);
    res.json(serviceNode);
}

module.exports = discoveryController