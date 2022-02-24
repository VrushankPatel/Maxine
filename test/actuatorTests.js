var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('..');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");

describe(`${fileName} : API /actuator`, () => {
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
    
    it('/metrics -> 200 & should return memory occupied and uptime', (done) => {
        chai.request(app)
            .get('/actuator/metrics')
            .end((err, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.have.own.property("mem");
                const res.body["mem"]
                done();
            });
    }); 
});