process.env.HEALTH_CHECK_ENABLED = 'false';
const config = require('../../../main/config/config');
const { discoveryService } = require('../../../main/service/discovery-service');
const { registryService } = require('../../../main/service/registry-service');
const { constants } = require('../../../main/util/constants/constants');
var chai = require('chai');
var should = chai.should();

const fileName = require('path').basename(__filename).replace(".js","");
const serviceSampleRH = {
    "hostName": "xx.xxx.xx.xx",
    "nodeName": "node-x-10",
    "port": "8082",
    "serviceName": "dbservice-rh",
    "version": "1.0",
    "ssl": true,
    "timeOut": 5,
    "weight": 10
};

// Clear registry for clean test
const { serviceRegistry } = require('../../../main/entity/service-registry');
const fs = require('fs');
const path = require('path');
const registryPath = path.join(__dirname, '../../../registry.json');
if (fs.existsSync(registryPath)) {
    fs.unlinkSync(registryPath);
}
serviceRegistry.registry = {};
serviceRegistry.healthyNodes = new Map();
serviceRegistry.hashRegistry = {};

// Registering fake server to discover afterwards for tests.
registryService.registryService(serviceSampleRH);

// We'll check if we're getting same server for multiple endpoint hits.
describe.skip(`${fileName} : API /api/maxine/discover with config with Rendezvous Hashing`, () => {

    it(`RH discover with NonAPI`, (done) => {
        // Making sure that server selection strategy is RH
        config.serverSelectionStrategy = constants.SSS.RH;
        discoveryService.clearCache();

        const response1 = discoveryService.getNode(serviceSampleRH.serviceName,serviceSampleRH.hostName, "1.0", "default");

        const response2 = discoveryService.getNode(serviceSampleRH.serviceName,serviceSampleRH.hostName, "1.0", "default");

        // Because of consistent hashing, we should expect both the responses same because the ip we're passing is the same.
        response1.should.be.eql(response2);
        done();
    });
});