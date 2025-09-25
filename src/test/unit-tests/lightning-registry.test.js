process.env.LIGHTNING_MODE = 'true';
const chai = require('chai');
const chaiHttp = require('chai-http');
const should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);
const app = require('../../../index');
const config = require('../../main/config/config');

const fileName = require('path').basename(__filename).replace('.js', '');

if (!config.lightningMode) {
  describe.skip(`${fileName} : Lightning Mode API`, () => {});
} else {
  describe(`${fileName} : Lightning Mode API`, () => {
    before(() => {
      // Lightning mode enabled
    });

    it('POST /register (With all necessary parameters) -> 200 & should register the server', (done) => {
      chai
        .request(app)
        .post('/register')
        .set('Content-Type', 'application/json')
        .send({
          serviceName: 'test-service',
          host: 'localhost',
          port: 3000,
          metadata: { version: '1.0' },
        })
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('nodeId');
          body.should.have.own.property('status', 'registered');
          done();
        });
    });

    it('GET /discover -> 200 & should discover the service', (done) => {
      chai
        .request(app)
        .get('/discover?serviceName=test-service&version=1.0')
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('address');
          body.should.have.own.property('nodeName');
          body.should.have.own.property('healthy', true);
          done();
        });
    });

    it('POST /heartbeat -> 200 & should heartbeat', (done) => {
      chai
        .request(app)
        .post('/heartbeat')
        .set('Content-Type', 'application/json')
        .send({
          nodeId: 'localhost:3000',
        })
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('success', true);
          done();
        });
    });

    it('GET /servers -> 200 & should list services', (done) => {
      chai
        .request(app)
        .get('/servers')
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('services');
          body.services.should.be.an('array');
          done();
        });
    });

    it('GET /health -> 200 & should return health', (done) => {
      chai
        .request(app)
        .get('/health')
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('status', 'ok');
          body.should.have.own.property('services');
          body.should.have.own.property('nodes');
          done();
        });
    });

    it('GET /metrics -> 200 & should return metrics', (done) => {
      chai
        .request(app)
        .get('/metrics')
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('uptime');
          body.should.have.own.property('requests');
          body.should.have.own.property('errors');
          body.should.have.own.property('services');
          body.should.have.own.property('nodes');
          done();
        });
    });

    it('DELETE /deregister -> 200 & should deregister', (done) => {
      chai
        .request(app)
        .delete('/deregister')
        .set('Content-Type', 'application/json')
        .send({
          nodeId: 'localhost:3000',
        })
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('success', true);
          done();
        });
    });

    it('POST /config/set -> 200 & should set config', (done) => {
      chai
        .request(app)
        .post('/config/set')
        .set('Content-Type', 'application/json')
        .send({
          serviceName: 'test-service',
          key: 'timeout',
          value: 5000,
          metadata: { description: 'Request timeout' },
        })
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('value', 5000);
          body.should.have.own.property('version', 1);
          body.should.have.own.property('metadata');
          body.metadata.should.have.own.property('description', 'Request timeout');
          done();
        });
    });

    it('GET /config/get -> 200 & should get config', (done) => {
      chai
        .request(app)
        .get('/config/get?serviceName=test-service&key=timeout')
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('value', 5000);
          body.should.have.own.property('version', 1);
          done();
        });
    });

    it('GET /config/all -> 200 & should get all configs', (done) => {
      chai
        .request(app)
        .get('/config/all?serviceName=test-service')
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('timeout');
          body.timeout.should.have.own.property('value', 5000);
          done();
        });
    });

    it('DELETE /config/delete -> 200 & should delete config', (done) => {
      chai
        .request(app)
        .delete('/config/delete?serviceName=test-service&key=timeout')
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('success', true);
          done();
        });
    });

    it('POST /record-call -> 200 & should record service call', (done) => {
      chai
        .request(app)
        .post('/record-call')
        .set('Content-Type', 'application/json')
        .send({
          callerService: 'web-service',
          calledService: 'api-service',
        })
        .end((_, res) => {
          res.should.have.status(200);
          res.should.be.json;
          const body = res.body;
          body.should.have.own.property('success', true);
          done();
        });
    });
  });
}
