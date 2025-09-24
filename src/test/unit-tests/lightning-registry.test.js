process.env.LIGHTNING_MODE = 'true';
var chai = require('chai');
var chaiHttp = require('chai-http');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);
const app = require('../../../index');
const config = require('../../main/config/config');

const fileName = require('path').basename(__filename).replace(".js","");

if (!config.lightningMode) {
    describe.skip(`${fileName} : Lightning Mode API`, () => {});
} else {
describe(`${fileName} : Lightning Mode API`, () => {
    before(() => {
        // Lightning mode enabled
    });

    it('POST /register (With all necessary parameters) -> 200 & should register the server', (done) => {
        chai.request(app)
            .post('/register')
            .set('Content-Type', 'application/json')
            .send({
                "serviceName": "test-service",
                "host": "localhost",
                "port": 3000,
                "metadata": {"version": "1.0"}
            })
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.have.own.property("nodeId");
                body.should.have.own.property("status", "registered");
                done();
            });
    });

    it('GET /discover -> 200 & should discover the service', (done) => {
        chai.request(app)
            .get('/discover?serviceName=test-service&version=1.0')
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.have.own.property("address");
                body.should.have.own.property("nodeName");
                body.should.have.own.property("healthy", true);
                done();
            });
    });

    it('POST /heartbeat -> 200 & should heartbeat', (done) => {
        chai.request(app)
            .post('/heartbeat')
            .set('Content-Type', 'application/json')
            .send({
                "nodeId": "localhost:3000"
            })
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.have.own.property("success", true);
                done();
            });
    });

    it('GET /servers -> 200 & should list services', (done) => {
        chai.request(app)
            .get('/servers')
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.have.own.property("services");
                body.services.should.be.an('array');
                done();
            });
    });

    it('GET /health -> 200 & should return health', (done) => {
        chai.request(app)
            .get('/health')
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.have.own.property("status", "ok");
                body.should.have.own.property("services");
                body.should.have.own.property("nodes");
                done();
            });
    });

    it('GET /metrics -> 200 & should return metrics', (done) => {
        chai.request(app)
            .get('/metrics')
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.have.own.property("uptime");
                body.should.have.own.property("requests");
                body.should.have.own.property("errors");
                body.should.have.own.property("services");
                body.should.have.own.property("nodes");
                done();
            });
    });



    it('DELETE /deregister -> 200 & should deregister', (done) => {
        chai.request(app)
            .delete('/deregister')
            .set('Content-Type', 'application/json')
            .send({
                "nodeId": "localhost:3000"
            })
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.have.own.property("success", true);
                done();
            });
    });
});
}