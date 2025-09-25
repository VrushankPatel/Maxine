const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../../../index');
const { constants } = require('../../main/util/constants/constants');
const config = require('../../main/config/config');
const should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);
const jwt = require('jsonwebtoken');
const { testUser, ENDPOINTS } = require('../testUtil/test-constants');

const fileName = require('path').basename(__filename).replace('.js', '');

describe(`${fileName} : API /api/maxine/signin`, () => {
  // Skip security tests in lightning mode unless auth is enabled
  if (config.lightningMode && !config.authEnabled) {
    it.skip('Security tests skipped in lightning mode when auth disabled', () => {});
    return;
  }
  it('POST /signin Signin endpoint fire but without any payload, it should return 400 Bad request.', (done) => {
    chai
      .request(app)
      .post(ENDPOINTS.maxine.signin)
      .end((_, res) => {
        res.should.have.status(400);
        res.should.be.json;
        res.body.should.be.a('object');
        done();
      });
  });

  it('POST /signin Signin endpoint fire with the payload of admin credentials, we should get accessToken as response.', (done) => {
    chai
      .request(app)
      .post(ENDPOINTS.maxine.signin)
      .set('content-type', 'application/json')
      .send(testUser)
      .end((_, res) => {
        res.should.have.status(200);
        res.should.be.json;
        res.body.should.be.a('object');
        res.body.should.have.own.property('accessToken');
        const token = res.body['accessToken'];

        jwt.verify(token, constants.SECRET, (err, user) => {
          user.should.be.a('object');
          user.should.have.own.property('userName', constants.DEFAULT_ADMIN_USERNAME_PWD);
          user.should.have.own.property('password', constants.DEFAULT_ADMIN_USERNAME_PWD);

          const tokenExpiration = user.exp - user.iat;
          tokenExpiration.should.be.eql(constants.EXPIRATION_TIME);

          should.not.exist(err);
        });
        done();
      });
  });
});

describe(`${fileName} : Lightning Mode Auth`, () => {
  if (!config.lightningMode || !config.authEnabled) {
    it.skip('Lightning auth tests only when auth enabled in lightning mode', () => {});
    return;
  }

  it('POST /signin with valid credentials should return token', (done) => {
    chai
      .request(app)
      .post('/signin')
      .set('content-type', 'application/json')
      .send({ username: config.adminUsername, password: 'admin' }) // Assuming password is 'admin' for test
      .end((_, res) => {
        res.should.have.status(200);
        res.should.be.json;
        res.body.should.be.a('object');
        res.body.should.have.own.property('token');
        done();
      });
  });

  it('GET /backup without auth should return 401', (done) => {
    chai
      .request(app)
      .get('/backup')
      .end((_, res) => {
        res.should.have.status(401);
        done();
      });
  });

  it('GET /trace/123 without auth should return 401', (done) => {
    chai
      .request(app)
      .get('/trace/123')
      .end((_, res) => {
        res.should.have.status(401);
        done();
      });
  });
});
