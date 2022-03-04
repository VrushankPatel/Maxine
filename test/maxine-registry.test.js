var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('..');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");

const hostName = "xxx.xxx.xx.xxx";
const port = 8080;
const serviceName = "Sample-Service".toUpperCase();
const nodeName = "node-4".toUpperCase();
const timeOut = 4;

const testServiceData = {
    "hostName" : hostName,
    "port" : port,
    "serviceName" : serviceName,
    "nodeName" : nodeName,
    "timeOut" : timeOut
};

describe(`${fileName} : API /maxine`, () => {

    it('/register (without passing necessary parameters) -> 400 & should return error', (done) => {
        chai.request(app)
            .post('/api/maxine/register')
            .end((err, res) => {
                res.should.have.status(400);
                res.should.be.json;

                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("message");
                done();
            });
    });

    // first test will retrieve below two params after registering service and assign the values.
    // second test will retrieve the registered server info and will verify it by below two params.
    let expectedServiceObj;

    it('/register (With all necessary parameters) -> 200 & should register the server', (done) => {
        chai.request(app)
            .post('/api/maxine/register')
            .set('Content-Type', 'application/json')
            .send(testServiceData)
            .end((err, res) => {
                res.should.have.status(200);
                res.should.be.json;

                const tempNodeName = nodeName + "-0"; // no weight means 1 server, no replication
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property(tempNodeName);

                const node = body[tempNodeName];
                node.should.have.own.property("nodeName", tempNodeName);
                node.should.have.own.property("address", `${hostName}:${port}`);
                node.should.have.own.property("timeOut", timeOut);

                expectedServiceObj = body;
                done();
            });
    });

    it('/servers -> 200 & should show the registered server (we just registered one above)', (done) => {
        chai.request(app)
            .get('/api/maxine/servers')
            .end((err, res) => {
                res.should.have.status(200);
                res.should.be.json;

                const tempNodeName = nodeName + "-0"; // no weight means 1 server, no replication

                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property(serviceName);
                body[serviceName].should.have.own.property("nodes");
                body[serviceName]["nodes"].should.have.own.property(tempNodeName);
                body[serviceName]["nodes"][tempNodeName].should.be.eql(expectedServiceObj[tempNodeName]);
                done();
            });
    });
});