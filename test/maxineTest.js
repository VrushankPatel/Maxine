var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('..');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

describe('API /actuator', () => {
    it('/health -> 200', (done) => {
        chai.request(app)
            .get('/actuator/health')
            .end((err, res) => {                
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.be.eql({"status": "UP"});
                done();
            });
    });

    it('/info -> 200', (done) => {
        chai.request(app)
            .get('/actuator/info')
            .end((err, res) => {                
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.be.eql(
                    {
                        "build": {
                            "name" : "maxine-discovery",
                            "description" : "Maxine is a discovery and a naming server for all the running nodes with gargantua client dependency.","version":"1.0.0"
                        }
                    });
                done();
            });
    });    
});

describe('API /any_malformed_url', () => {
    it('/8989 -> 404', (done) => {
        chai.request(app)
            .get('/8989')
            .end((err, res) => {
                res.should.have.status(404);                
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.be.eql({"message":"Not found"});
                done();
            });
    });
});

describe('API /maxine', () => {
    it('/register -> 200', (done) => {
        const testData = {
            "hostName" : "xxx.xxx.xx.xxx",
            "port" : 8080,
            "serviceName" : "Maxine-Discovery",
            "nodeName" : "node-4",
            "timeOut" : 4
        };
        chai.request(app)
            .post('/maxine/register')
            .send(testData)
            .end((err, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.be.eql(
                    {
                        "message": `Service Registered Successfully [service : ${testData.serviceName} | node : ${testData.nodeName} | address : ${testData.hostName}:${testData.port} | timeOut : ${testData.timeOut} second(s)`
                    });
                done();
            });
    });
})