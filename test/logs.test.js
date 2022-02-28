var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('..');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");

describe(`${fileName} : API /logs`, () => {
    logFiles = [];

    it('/download -> 200 && it should return all the log files available in logs dir in JSON format', (done) => {
        chai.request(app)
            .get('/logs/download')
            .end((err, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                logFiles = res.body;
                done();
            });
    });

    it('/download/{log_filename.log} -> (Testing with all the log file names retrieved in above test) 200 && it should return attachment with response type text/plain', (done) => {
        Object.keys(logFiles).forEach(key => {
            chai.request(app)
            .get(logFiles[key])
            .end((err, res) => {
                res.should.have.status(200);
                res.should.be.text;
                res.text.should.be.a('string');
                res.headers['content-disposition'].should.be.eql(`attachment; filename="${key}"`);
            });
        });
        done();
    });
});