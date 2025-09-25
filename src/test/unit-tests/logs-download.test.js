const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../../../index');
const { generateAccessToken } = require('../../main/security/jwt');
const { ENDPOINTS, testUser } = require('../testUtil/test-constants');
const should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace('.js', '');
const accessToken = generateAccessToken(testUser);

describe(`${fileName} : API /api/logs`, () => {
  let logFiles = [];

  it('GET /download -> 200 && it should return all the log files available in logs dir in JSON format', (done) => {
    chai
      .request(app)
      .get(ENDPOINTS.logs.download)
      .set('Authorization', `Bearer ${accessToken}`)
      .end((_, res) => {
        res.should.have.status(200);
        res.should.be.json;
        res.body.should.be.a('object');
        logFiles = res.body;
        done();
      });
  });
});
