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
const serviceSampleRR = {
    "hostName": "xx.xxx.xx.xx",
    "nodeName": "node-x-10",
    "port": "8082",
    "serviceName": "dbservice-rr",
    "version": "1.0",
    "ssl": true,
    "timeOut": 5,
    "weight": 10,
    "metadata": {}
};

// Clear registry for clean test
const { serviceRegistry } = require('../../../main/entity/service-registry');
const fs = require('fs');
const path = require('path');
const registryPath = path.join(__dirname, '../../../registry.json');
if (fs.existsSync(registryPath)) {
    fs.unlinkSync(registryPath);
}
serviceRegistry.registry = new Map();
serviceRegistry.healthyNodes = new Map();
serviceRegistry.healthyNodeSets = new Map();
serviceRegistry.healthyNodesMap = new Map();
serviceRegistry.availableNodes = new Map();
serviceRegistry.groupIndex = new Map();
serviceRegistry.hashRegistry = new Map();
serviceRegistry.healthyCache = new Map();
serviceRegistry.expandedHealthy = new Map();
serviceRegistry.maintenanceNodes = new Map();
serviceRegistry.drainingNodes = new Map();
serviceRegistry.responseTimes = new Map();
serviceRegistry.averageResponseTimes = new Map();
serviceRegistry.healthScore = new Map();
serviceRegistry.activeConnections = new Map();
serviceRegistry.timeResetters = new Map();
serviceRegistry.changes = [];
serviceRegistry.webhooks = new Map();
serviceRegistry.tagIndex = new Map();
serviceRegistry.kvStore = new Map();
serviceRegistry.serviceAliases = new Map();
serviceRegistry.serviceAliasesReverse = new Map();
serviceRegistry.serviceDependencies = new Map();
serviceRegistry.trafficSplit = new Map();
serviceRegistry.healthHistory = new Map();

if (config.lightningMode) {
    describe.skip(`${fileName} : NON API discover with config with Round Robin`, () => {});
} else {
describe(`${fileName} : NON API discover with config with Round Robin`, () => {
    it(`RR discover with NonAPI`, async () => {
        // Making sure that server selection strategy is RR
        config.serverSelectionStrategy = constants.SSS.RR;
        // Register service for test
        registryService.registerService(serviceSampleRR);
        // Reset cache for test
        const fullServiceName = `default:${serviceSampleRR.serviceName}:1.0`;
        discoveryService.clearCache();
        const response1 = await discoveryService.getNode(fullServiceName, serviceSampleRR.hostName);
        response1.should.be.a('object');
        // by default, Round robin will return node with name like nodename + '-0', we'll test it.
        response1.should.have.own.property("nodeName", `${serviceSampleRR.nodeName}-0`);
        response1.should.have.own.property("parentNode", serviceSampleRR.nodeName);
        response1.should.have.own.property("address");
    });
});
}