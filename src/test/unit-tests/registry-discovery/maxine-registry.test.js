var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('../../../../index');
const { generateAccessToken } = require('../../../main/security/jwt');
const { testUser, ENDPOINTS, serviceDataSample, httpOrNonHttp } = require('../../testUtil/test-constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");
const accessToken = generateAccessToken(testUser);

describe(`${fileName} : API /api/maxine/{registry urls}`, () => {

    it('POST /register (without passing necessary parameters) -> 400 & should return error', (done) => {
        chai.request(app)
            .post(ENDPOINTS.maxine.serviceops.register)
            .end((_, res) => {
                res.should.have.status(400);
                res.should.be.json;

                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("message");
                done();
            });
    });

    it('POST /register (With all necessary parameters) -> 200 & should register the server', (done) => {
        chai.request(app)
            .post(ENDPOINTS.maxine.serviceops.register)
            .set('Content-Type', 'application/json')
            .send(serviceDataSample)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("serviceName", serviceDataSample.serviceName);
                body.should.have.own.property("nodeName", serviceDataSample.nodeName);
                body.should.have.own.property("address");
                body.should.have.own.property("timeOut", serviceDataSample.timeOut);
                body.should.have.own.property("weight", serviceDataSample.weight);
                done();
            });
    });

    it('GET /servers -> 200 & should show the registered server (we just registered one above)', (done) => {
        chai.request(app)
            .get(ENDPOINTS.maxine.serviceops.servers)
            .set({ "Authorization": `Bearer ${accessToken}` })
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;

                const tempNodeName = serviceDataSample.nodeName + "-0"; // no weight means 1 server, no replication
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property(serviceDataSample.serviceName);
                const service = body[serviceDataSample.serviceName];
                service.should.have.own.property("offset");
                service.should.have.own.property("nodes");

                const nodes = service["nodes"]
                nodes.should.have.own.property(tempNodeName);

                const node = nodes[tempNodeName];
                node.should.have.own.property("nodeName", tempNodeName);
                node.should.have.own.property("parentNode", serviceDataSample.nodeName);
                node.should.have.own.property("address");
                node.should.have.own.property("timeOut", serviceDataSample.timeOut);
                done();
            });
    });
});