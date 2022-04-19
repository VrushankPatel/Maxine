var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('..');
const config = require('../src/config/config');
const { registryService } = require('../src/service/registry-service');
const { constants } = require('../src/util/constants/constants');
const { ENDPOINTS, serviceDataSample } = require('./testUtil/test-constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");

// Registering fake server to discover afterwards for tests.
registryService.registryService(serviceDataSample);

// We'll check if we're getting same server for multiple endpoint hits.
describe(`${fileName} : API /api/maxine/discover with config with Consistent Hashing`, () => {
    it(`POST /discover?serviceName={service_name} discovering service`, (done) => {

        config.serverSelectionStrategy = constants.SSS.CH;

        // First request hit will return node name.
        chai.request(app)
            .get(ENDPOINTS.maxine.serviceops.discover + "?serviceName=dbservice")
            .set('Content-Type', 'application/json')
            .send(serviceDataSample)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("parentNode", serviceDataSample.nodeName);
                body.should.have.own.property("address", serviceDataSample.address);
                body.should.have.own.property("nodeName");

                // Again we'll hit the request similarly, we should get the same node.
                // because of consistent hashing. we'll assert the nodename we got earlier with this one.
                chai.request(app)
                    .get(ENDPOINTS.maxine.serviceops.discover + "?serviceName=dbservice")
                    .set('Content-Type', 'application/json')
                    .send(serviceDataSample)
                    .end((_, res2) => {
                        const body2 = res2.body;
                        body2.nodeName.should.be.eql(body.nodeName);
                        body.should.have.own.property("parentNode", serviceDataSample.nodeName);
                        body.should.have.own.property("address", serviceDataSample.address);
                    });
            });
        done();
    });
});