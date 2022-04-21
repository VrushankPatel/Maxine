var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('../../../index');
const config = require('../../main/config/config');
const { registryService } = require('../../main/service/registry-service');
const { constants } = require('../../main/util/constants/constants');
const { ENDPOINTS, serviceDataSample, httpOrNonHttp } = require('../testUtil/test-constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");

// Registering fake server to discover afterwards for tests.
registryService.registryService(serviceDataSample);

describe(`${fileName} : API /api/maxine/discover with config with Round Robin`, () => {
    it(`GET /discover?serviceName={service_name} discovering service`, (done) => {

        config.serverSelectionStrategy = constants.SSS.RR; // setting to Round Robin

        chai.request(app)
            .get(ENDPOINTS.maxine.serviceops.discover + "?serviceName=dbservice")
            .set('Content-Type', 'application/json')
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                // by default, Round robin will return node with name lke nodename + '-0', w'll test it.
                body.should.have.own.property("nodeName", `${serviceDataSample.nodeName}-0`);
                body.should.have.own.property("parentNode", serviceDataSample.nodeName);
                body.should.have.own.property("address", `${httpOrNonHttp}://${serviceDataSample.hostName}:${serviceDataSample.port}`);
            });
        done();
    });
});