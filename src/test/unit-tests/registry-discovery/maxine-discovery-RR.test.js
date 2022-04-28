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
    "ssl": true,
    "timeOut": 5,
    "weight": 10
};

// Registering fake server to discover afterwards for tests.
registryService.registryService(serviceSampleRR);

describe(`${fileName} : NON API discover with config with Round Robin`, () => {
    it(`RR discover with NonAPI`, (done) => {
        // Making sure that server selection strategy is CH
        config.serverSelectionStrategy = constants.SSS.RR;
        const response1 = discoveryService.getNode(serviceSampleRR.serviceName,serviceSampleRR.hostName);
        response1.should.be.a('object');
        // by default, Round robin will return node with name lke nodename + '-0', w'll test it.
        response1.should.have.own.property("nodeName", `${serviceSampleRR.nodeName}-0`);
        response1.should.have.own.property("parentNode", serviceSampleRR.nodeName);
        response1.should.have.own.property("address");
        done();
    });
});