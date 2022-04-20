var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('..');
const config = require('../src/config/config');
const { discoveryService } = require('../src/service/discovery-service');
const { registryService } = require('../src/service/registry-service');
const { constants } = require('../src/util/constants/constants');
const { ENDPOINTS, serviceDataSample, httpOrNonHttp } = require('./testUtil/test-constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");

// Registering fake server to discover afterwards for tests.
registryService.registryService(serviceDataSample);

// We'll check if we're getting same server for multiple endpoint hits.
describe(`${fileName} : API /api/maxine/discover with config with Rendezvous Hashing`, () => {
    it(`GET /discover?serviceName={service_name} discovering service`, (done) => {

        config.serverSelectionStrategy = constants.SSS.RH;

        // First request hit will return node name.
        chai.request(app)
            .get(ENDPOINTS.maxine.serviceops.discover + "?serviceName=dbservice")
            .set('Content-Type', 'application/json')
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("parentNode", serviceDataSample.nodeName);
                body.should.have.own.property("address", `${httpOrNonHttp}://${serviceDataSample.hostName}:${serviceDataSample.port}`);
                body.should.have.own.property("nodeName");
            });
        done();
    });

    it(`RH discover with NonAPI`, (done) => {
        // Making sure that server selection strategy is RH
        config.serverSelectionStrategy = constants.SSS.RH;

        const response1 = discoveryService.getNode(serviceDataSample.serviceName,serviceDataSample.hostName);

        const response2 = discoveryService.getNode(serviceDataSample.serviceName,serviceDataSample.hostName);

        // Because of consistent hashing, we should expect both the responses same because the ip we're passing is the same.
        response1.should.be.eql(response2);
        done();
    });
});