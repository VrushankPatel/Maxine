const chai = require('chai');
const chaiHttp = require('chai-http');
const http = require('http');
const app = require('../../../index');
const { registryService } = require('../../main/service/registry-service');
const { proxyService } = require('../../main/service/proxy-service');
const { upstreamHealthService } = require('../../main/service/upstream-health-service');
const { constants } = require('../../main/util/constants/constants');
const { ENDPOINTS } = require('../testUtil/test-constants');

const should = chai.should();
chai.use(chaiHttp);

describe('Proxy and Health Model Depth Tests', () => {
    let mockServer;
    let mockPort;
    let requestCount = 0;
    let healthStatus = 200;

    before((done) => {
        mockServer = http.createServer((req, res) => {
            if (req.url === '/health') {
                res.writeHead(healthStatus, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: healthStatus === 200 ? 'UP' : 'DOWN' }));
                return;
            }

            if (req.url === '/retry-endpoint') {
                requestCount++;
                if (requestCount < 3) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Transient failure' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                }
                return;
            }

            res.writeHead(404);
            res.end();
        });

        mockServer.listen(0, '127.0.0.1', () => {
            mockPort = mockServer.address().port;
            done();
        });
    });

    after((done) => {
        mockServer.close(done);
    });

    beforeEach(async () => {
        requestCount = 0;
        healthStatus = 200;
        proxyService.circuitBreakers.clear();
        upstreamHealthService.recoveringNodes.clear();
        await registryService.reset();
    });

    describe('Proxy Retry Logic', () => {
        it('should retry on transient 5xx errors and succeed if they recover within max attempts', async () => {
            constants.PROXY_RETRIES = 3;
            constants.PROXY_RETRY_BACKOFF_MS = 5; // small backoff for fast tests

            await registryService.registryService({
                hostName: '127.0.0.1',
                nodeName: 'retry-node',
                port: mockPort,
                serviceName: 'retry-service',
                ssl: false,
                timeOut: 5,
                weight: 1
            });

            const res = await chai.request(app)
                .get(`${ENDPOINTS.maxine.serviceops.proxy}/retry-service/retry-endpoint`);

            res.should.have.status(200);
            res.body.should.have.property('success', true);
            requestCount.should.equal(3); // 2 fails + 1 success
        });
    });

    describe('Circuit Breaker', () => {
        it('should open circuit after configured failures and fail-fast with 503', async () => {
            constants.PROXY_RETRIES = 1;
            constants.CIRCUIT_BREAKER_FAILURE_THRESHOLD = 2;

            await registryService.registryService({
                hostName: '127.0.0.1',
                nodeName: 'cb-node',
                port: mockPort,
                serviceName: 'cb-service',
                ssl: false,
                timeOut: 5,
                weight: 1
            });

            // Make mockServer return 500 for all retry-endpoint requests
            requestCount = -100; // will always return 500

            // Request 1: fails
            let res1 = await chai.request(app)
                .get(`${ENDPOINTS.maxine.serviceops.proxy}/cb-service/retry-endpoint`);
            res1.should.have.status(500);

            // Request 2: fails, triggers circuit opening
            let res2 = await chai.request(app)
                .get(`${ENDPOINTS.maxine.serviceops.proxy}/cb-service/retry-endpoint`);
            res2.should.have.status(500);

            // Circuit breaker for this node address should now be OPEN
            const cb = proxyService.getCircuitBreaker(`http://127.0.0.1:${mockPort}`);
            cb.state.should.equal('OPEN');

            // Request 3: fails fast with 503 Service Unavailable
            let res3 = await chai.request(app)
                .get(`${ENDPOINTS.maxine.serviceops.proxy}/cb-service/retry-endpoint`);
            res3.should.have.status(503);
            res3.body.message.should.contain('Circuit breaker is OPEN');
        });
    });

    describe('Upstream Health Half-Open and Recovery', () => {
        it('should transition node through EVICTED -> HALF-OPEN (weight 1) -> HEALTHY (original weight)', async () => {
            constants.ACTIVE_HEALTH_CHECKS_ENABLED = true;
            constants.ACTIVE_HEALTH_CHECK_FAILURE_THRESHOLD = 1;

            const serviceName = 'recovery-service';
            const nodeName = 'recovery-node';

            await registryService.registryService({
                hostName: '127.0.0.1',
                nodeName,
                port: mockPort,
                serviceName,
                ssl: false,
                timeOut: 5,
                weight: 3,
                healthCheckPath: '/health'
            });

            // 1. Trigger failure
            healthStatus = 500;
            await upstreamHealthService.runOnce();

            // The node should be evicted from the active registry
            let registry = await registryService.getRegisteredServers();
            should.not.exist(registry[serviceName]);

            const key = `${serviceName}:${nodeName}`;
            upstreamHealthService.recoveringNodes.has(key).should.be.true;
            const recState1 = upstreamHealthService.recoveringNodes.get(key);
            recState1.state.should.equal('EVICTED');
            recState1.originalWeight.should.equal(3);

            // 2. Health passes once -> Node goes to HALF-OPEN with weight 1
            healthStatus = 200;
            await upstreamHealthService.runOnce();

            registry = await registryService.getRegisteredServers();
            registry.should.have.property(serviceName);
            const nodes1 = registry[serviceName].nodes;
            Object.keys(nodes1).should.have.lengthOf(1); // Demoted to weight 1
            nodes1.should.have.property(`${nodeName}-0`);

            const recState2 = upstreamHealthService.recoveringNodes.get(key);
            recState2.state.should.equal('HALF-OPEN');
            recState2.consecutivePasses.should.equal(1);

            // 3. Health passes twice -> Node returns to healthy with weight 3
            await upstreamHealthService.runOnce();

            registry = await registryService.getRegisteredServers();
            registry.should.have.property(serviceName);
            const nodes2 = registry[serviceName].nodes;
            Object.keys(nodes2).should.have.lengthOf(3); // Restored to weight 3
            nodes2.should.have.property(`${nodeName}-0`);
            nodes2.should.have.property(`${nodeName}-1`);
            nodes2.should.have.property(`${nodeName}-2`);

            upstreamHealthService.recoveringNodes.has(key).should.be.false;
        });
    });
});
