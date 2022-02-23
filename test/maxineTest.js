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

describe('API /maxine', () => {
    const hostName = "xxx.xxx.xx.xxx";
    const port = 8080;
    const serviceName = "Sample-Service";
    const nodeName = "node-4";
    const timeOut = 4;    

    
    // first test will retrieve below two params after registering service and assign the values.
    // second test will retrieve the registered server info and will verify it by below two params.
    let retrievedId;
    let registeredAt;

    it('/register -> 200 & should register the server', (done) => {
        const testServiceData = {
            "hostName" : hostName,
            "port" : port,
            "serviceName" : serviceName,
            "nodeName" : nodeName,
            "timeOut" : timeOut
        };
        chai.request(app)
            .post('/maxine/register')
            .set('Content-Type', 'application/json')
            .send(testServiceData)            
            .end((err, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');                
                res.body.should.have.own.property("address", `${hostName}:${port}`);
                res.body.should.have.own.property("timeOut", timeOut);
                res.body.should.have.own.property("id");
                res.body.should.have.own.property("registeredAt");

                registeredAt = res.body.registeredAt;
                retrievedId = res.body.id;

                done();
            });
    });
    
    it('/servers -> 200 & should show the registered server (we just registered one above)', (done) => {        
        chai.request(app)
            .get('/maxine/servers')            
            .end((err, res) => {
                res.should.have.status(200);
                res.should.be.json;

                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property(serviceName);

                const service = body[serviceName];
                service.should.be.a('object');
                service.should.have.own.property(nodeName);

                const node = service[nodeName];
                node.should.be.a('object');                
                node.should.have.own.property("address", `${hostName}:${port}`);
                node.should.have.own.property("timeOut", timeOut);
                node.should.have.own.property("id", retrievedId);
                node.should.have.own.property("registeredAt", registeredAt);                
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