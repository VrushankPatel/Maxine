var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('..');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");

describe(`${fileName} : API /api/actuator`, () => {
    it('/health -> 200', (done) => {
        chai.request(app)
            .get('/api/actuator/health')
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.be.eql({"status": "UP"});
                done();
            });
    });

    it('/info -> 200', (done) => {
        chai.request(app)
            .get('/api/actuator/info')
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

    it('/metrics -> 200 & should return memory occupied and uptime', (done) => {
        chai.request(app)
            .get('/api/actuator/metrics')
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
});