var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('../../../index');
const { ENDPOINTS } = require('../testUtil/test-constants');
const { generateAccessToken } = require('../../main/security/jwt');
const { testUser } = require('../testUtil/test-constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");

describe(`${fileName} : API /api/actuator`, () => {
    it('GET /health -> 200', (done) => {
        chai.request(app)
            .get(ENDPOINTS.actuator.health)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.be.eql({"status": "UP"});
                done();
            });
    });

    it('GET /info -> 200', (done) => {
        chai.request(app)
            .get(ENDPOINTS.actuator.info)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.have.own.property("build");
                res.body["build"].should.have.own.property("description");
                res.body["build"].should.have.own.property("name", "maxine-discovery");
                done();
            });
    });

    it('GET /metrics -> 200 & should return memory occupied and uptime', (done) => {
        chai.request(app)
            .get(ENDPOINTS.actuator.metrics)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.have.own.property("mem");
                res.body.should.have.own.property("uptime");
                const mem = res.body["mem"];
                mem.should.have.own.property("rss");
                mem.should.have.own.property("heapTotal");
                mem.should.have.own.property("heapUsed");
                mem.should.have.own.property("external");
                mem.should.have.own.property("arrayBuffers");

                done();
            });
    });

    it('GET /performance -> 404 when performance report URL is not configured', (done) => {
        chai.request(app)
            .get('/api/actuator/performance')
            .end((_, res) => {
                res.should.have.status(404);
                res.should.be.json;
                res.body.should.be.eql({"message": "Performance report URL is not configured."});
                done();
            });
    });

    it('GET protected ops actuator endpoints -> 200 with auth token', (done) => {
        const accessToken = generateAccessToken(testUser);
        chai.request(app)
            .get(ENDPOINTS.actuator.cluster)
            .set("Authorization", `Bearer ${accessToken}`)
            .end((_, clusterRes) => {
                clusterRes.should.have.status(200);
                clusterRes.body.should.have.own.property('instanceId');

                chai.request(app)
                    .get(ENDPOINTS.actuator.prometheus)
                    .set("Authorization", `Bearer ${accessToken}`)
                    .end((_, prometheusRes) => {
                        prometheusRes.should.have.status(200);
                        prometheusRes.text.should.contain('maxine_requests_total');

                        chai.request(app)
                            .get(ENDPOINTS.actuator.traces)
                            .set("Authorization", `Bearer ${accessToken}`)
                            .end((_, tracesRes) => {
                                tracesRes.should.have.status(200);
                                tracesRes.body.should.have.own.property('traces');

                                chai.request(app)
                                    .get(ENDPOINTS.actuator.audit)
                                    .set("Authorization", `Bearer ${accessToken}`)
                                    .end((_, auditRes) => {
                                        auditRes.should.have.status(200);
                                        auditRes.body.should.have.own.property('events');
                                        done();
                                    });
                            });
                    });
            });
    });
}); 
