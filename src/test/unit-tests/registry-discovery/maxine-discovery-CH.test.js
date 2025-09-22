var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('../../../../index');
const config = require('../../../main/config/config');
const { discoveryService } = require('../../../main/service/discovery-service');
const { registryService } = require('../../../main/service/registry-service');
const { constants } = require('../../../main/util/constants/constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");
const serviceSampleCH = {
    "hostName": "xx.xxx.xx.xx",
    "nodeName": "node-x-10",
    "port": "8082",
    "serviceName": "dbservice-ch",
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
registryService.registryService(serviceSampleCH);

// We'll check if we're getting same server for multiple endpoint hits.
describe(`${fileName} : API /api/maxine/discover with config with Consistent Hashing`, () => {
    it(`CH discover with NonAPI`, (done) => {
        // Making sure that server selection strategy is CH
        config.serverSelectionStrategy = constants.SSS.CH;

        const response1 = discoveryService.getNode(serviceSampleCH.serviceName,serviceSampleCH.hostName, "1.0", "default");

        const response2 = discoveryService.getNode(serviceSampleCH.serviceName,serviceSampleCH.hostName, "1.0", "default");

        // Because of consistent hashing, we should expect both the responses same because the ip we're passing is the same.
        response1.should.be.eql(response2);
        done();
    });
});