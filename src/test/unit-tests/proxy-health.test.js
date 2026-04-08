const chai = require('chai');
const chaiHttp = require('chai-http');
const http = require('http');
const app = require('../../../index');
const { registryService } = require('../../main/service/registry-service');
const { upstreamHealthService } = require('../../main/service/upstream-health-service');
const { alertService } = require('../../main/service/alert-service');
const { auditService } = require('../../main/service/audit-service');
const { constants } = require('../../main/util/constants/constants');
const { ENDPOINTS } = require('../testUtil/test-constants');

const should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace('.js', '');

describe(`${fileName} : proxying and active health checks`, () => {
    let upstreamServer;
    let upstreamPort;
    let originalHealthEnabled;
    let originalFailureThreshold;

    const registerService = async ({ serviceName, nodeName, healthCheckPath = '/health' }) => {
        await registryService.registryService({
            hostName: '127.0.0.1',
            nodeName,
            port: upstreamPort,
            serviceName,
            ssl: false,
            timeOut: 5,
            weight: 1,
            healthCheckPath
        });
    };

    before((done) => {
        upstreamServer = http.createServer((req, res) => {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'UP' }));
                return;
            }

            if (req.url === '/missing') {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'MISSING' }));
                return;
            }

            if (req.url.startsWith('/hello')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    method: req.method,
                    path: req.url,
                    traceId: req.headers[constants.TRACE_HEADER_NAME],
                    traceparent: req.headers.traceparent || null
                }));
                return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'NOT_FOUND' }));
        });

        upstreamServer.listen(0, '127.0.0.1', () => {
            upstreamPort = upstreamServer.address().port;
            done();
        });
    });

    beforeEach(async () => {
        originalHealthEnabled = constants.ACTIVE_HEALTH_CHECKS_ENABLED;
        originalFailureThreshold = constants.ACTIVE_HEALTH_CHECK_FAILURE_THRESHOLD;
        alertService.clearRecentAlerts();
        auditService.clearRecentEvents();
        await upstreamHealthService.stop();
        await registryService.reset();
    });

    afterEach(async () => {
        constants.ACTIVE_HEALTH_CHECKS_ENABLED = originalHealthEnabled;
        constants.ACTIVE_HEALTH_CHECK_FAILURE_THRESHOLD = originalFailureThreshold;
        alertService.clearRecentAlerts();
        auditService.clearRecentEvents();
        await upstreamHealthService.stop();
        await registryService.reset();
    });

    after((done) => {
        upstreamServer.close(done);
    });

    it('proxies service requests and forwards trace headers', async () => {
        await registerService({
            serviceName: 'proxy-health-orders',
            nodeName: 'orders-node'
        });

        const res = await chai.request(app).get(`${ENDPOINTS.maxine.serviceops.proxy}/proxy-health-orders/hello?via=proxy`);

        res.should.have.status(200);
        res.should.be.json;
        res.body.should.have.own.property('path', '/hello?via=proxy');
        res.body.should.have.own.property('method', 'GET');
        res.body.should.have.own.property('traceId');
        res.body.should.have.own.property('traceparent');
        res.header.should.have.own.property(constants.TRACE_HEADER_NAME);
        res.body.traceId.should.equal(res.header[constants.TRACE_HEADER_NAME]);
    });

    it('evicts unhealthy upstreams after the configured active health check threshold', async () => {
        constants.ACTIVE_HEALTH_CHECKS_ENABLED = true;
        constants.ACTIVE_HEALTH_CHECK_FAILURE_THRESHOLD = 1;

        await registerService({
            serviceName: 'proxy-health-failing',
            nodeName: 'failing-node',
            healthCheckPath: '/missing'
        });

        await upstreamHealthService.runOnce();

        const registrySnapshot = await registryService.getRegisteredServers();
        should.not.exist(registrySnapshot['proxy-health-failing']);
        alertService.getRecentAlerts().should.have.lengthOf(1);
        alertService.getRecentAlerts()[0].should.have.own.property('type', 'upstream.evicted');
        auditService.getRecentEvents()[0].should.have.own.property('type');
    });
});
