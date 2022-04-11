var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('..');
const { generateAccessToken } = require('../src/security/jwt');
const { testUser } = require('./testUtil/test-constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");
const accessToken = generateAccessToken(testUser);

const hostName = "xxx.xxx.xx.xxx";
const port = 8080;
const serviceName = "Sample-Service";
const nodeName = "node-4";
const timeOut = 4;
const ssl = false;
const httpOrNonHttp = ssl ? "https" : "http";

const testServiceData = {
    "hostName" : hostName,
    "port" : port,
    "serviceName" : serviceName,
    "nodeName" : nodeName,
    "timeOut" : timeOut,
    "ssl": ssl
};

describe(`${fileName} : API /api/maxine/{registry urls}`, () => {

    it('POST /register (without passing necessary parameters) -> 400 & should return error', (done) => {
        chai.request(app)
            .post('/api/maxine/register')
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
            .post('/api/maxine/register')
            .set('Content-Type', 'application/json')
            .send(testServiceData)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("serviceName", serviceName);
                body.should.have.own.property("nodeName", nodeName);
                body.should.have.own.property("address", `${httpOrNonHttp}://${hostName}:${port}`);
                body.should.have.own.property("timeOut", timeOut);
                body.should.have.own.property("weight", 1); // we havn't passed weight so, default is 1
                done();
            });
    });

    it('GET /servers -> 200 & should show the registered server (we just registered one above)', (done) => {
        chai.request(app)
            .get('/api/maxine/servers')
            .set({ "Authorization": `Bearer ${accessToken}` })
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;

                const tempNodeName = nodeName + "-0"; // no weight means 1 server, no replication
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property(serviceName);
                const service = body[serviceName];
                service.should.have.own.property("offset", 0);
                service.should.have.own.property("nodes");

                const nodes = service["nodes"]
                nodes.should.have.own.property(tempNodeName);

                const node = nodes[tempNodeName];
                node.should.have.own.property("nodeName", tempNodeName);
                node.should.have.own.property("parentNode", nodeName);
                node.should.have.own.property("address", `${httpOrNonHttp}://${hostName}:${port}`);
                node.should.have.own.property("timeOut", timeOut);
                done();
            });
    });
});