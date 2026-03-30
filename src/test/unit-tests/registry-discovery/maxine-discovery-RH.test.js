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
const serviceSampleRH = {
    "hostName": "xx.xxx.xx.xx",
    "nodeName": "node-x-10",
    "port": "8082",
    "serviceName": "dbservice-rh",
    "ssl": true,
    "timeOut": 5,
    "weight": 10
};

// Registering fake server to discover afterwards for tests.
registryService.registryService(serviceSampleRH);

// We'll check if we're getting same server for multiple endpoint hits.
describe(`${fileName} : API /api/maxine/discover with config with Rendezvous Hashing`, () => {

    it(`RH discover with NonAPI`, (done) => {
        // Making sure that server selection strategy is RH
        config.serverSelectionStrategy = constants.SSS.RH;

        const response1 = discoveryService.getNode(serviceSampleRH.serviceName,serviceSampleRH.hostName);

        const response2 = discoveryService.getNode(serviceSampleRH.serviceName,serviceSampleRH.hostName);

        // Because of consistent hashing, we should expect both the responses same because the ip we're passing is the same.
        response1.should.be.eql(response2);
        done();
    });
});