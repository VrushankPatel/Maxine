var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('../../../index');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");

describe(`${fileName} : API /any_unknown_url`, () => {
    it('GET /8989 -> 404 (invalid url)', (done) => {
        chai.request(app)
            .get('/8989')
            .end((_, res) => {
                res.should.have.status(404);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.be.eql({"message":"Not found"});
                done();
            });
    });
});