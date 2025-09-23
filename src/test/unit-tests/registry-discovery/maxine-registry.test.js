var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('../../../../index');
const { generateAccessToken } = require('../../../main/security/jwt');
const { testUser, ENDPOINTS } = require('../../testUtil/test-constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");
const accessToken = generateAccessToken(testUser);
const serviceSampleRS = {
    "hostName": "xx.xxx.xx.xx",
    "nodeName": "node-x-10",
    "port": "8082",
    "serviceName": "dbservice-rs",
    "ssl": true,
    "timeOut": 5,
    "weight": 10
};

describe(`${fileName} : API /api/maxine/{registry urls}`, () => {
    before(() => {
        // Clear registry for clean test
        const { serviceRegistry } = require('../../../main/entity/service-registry');
        const fs = require('fs');
        const path = require('path');
        const registryPath = path.join(__dirname, '../../../registry.json');
        if (fs.existsSync(registryPath)) {
            fs.unlinkSync(registryPath);
        }
        serviceRegistry.registry = new Map();
        serviceRegistry.healthyNodes = new Map();
        serviceRegistry.hashRegistry = new Map();
        serviceRegistry.healthyCache = new Map();
        serviceRegistry.expandedHealthy = new Map();
        serviceRegistry.maintenanceNodes = new Map();
        serviceRegistry.responseTimes = new Map();
        serviceRegistry.activeConnections = new Map();
        serviceRegistry.timeResetters = new Map();
        serviceRegistry.changes = [];
        serviceRegistry.webhooks = new Map();
        serviceRegistry.tagIndex = new Map();
        serviceRegistry.kvStore = new Map();
        serviceRegistry.serviceAliases = new Map();
        serviceRegistry.serviceDependencies = new Map();
    });

    it('POST /register (without passing necessary parameters) -> 400 & should return error', (done) => {
        chai.request(app)
            .post(ENDPOINTS.maxine.serviceops.register)
            .end((_, res) => {
                res.should.have.status(400);
                res.should.be.json;

                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("message");
                done();
            });
    });

    it('POST /register (With all necessary parameters) -> 200 & should register the server', (done) => {
        chai.request(app)
            .post(ENDPOINTS.maxine.serviceops.register)
            .set('Content-Type', 'application/json')
            .send(serviceSampleRS)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("serviceName", serviceSampleRS.serviceName);
                body.should.have.own.property("nodeName", serviceSampleRS.nodeName);
                body.should.have.own.property("address");
                body.should.have.own.property("timeOut", serviceSampleRS.timeOut);
                body.should.have.own.property("weight", serviceSampleRS.weight);
                done();
            });
    });

    it('GET /servers -> 200 & should show the registered server (we just registered one above)', (done) => {
        chai.request(app)
            .get(ENDPOINTS.maxine.serviceops.servers)
            .set({ "Authorization": `Bearer ${accessToken}` })
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;

                const tempNodeName = serviceSampleRS.nodeName + "-0"; // no weight means 1 server, no replication
                const body = res.body;
                body.should.be.a('object');
                const serviceKey = "default:" + serviceSampleRS.serviceName + ":1.0";
                body.should.have.own.property(serviceKey);
                const service = body[serviceKey];
                service.should.have.own.property("offset");
                service.should.have.own.property("nodes");

                const nodes = service["nodes"]
                nodes.should.have.own.property(tempNodeName);

                const node = nodes[tempNodeName];
                node.should.have.own.property("nodeName", tempNodeName);
                node.should.have.own.property("parentNode", serviceSampleRS.nodeName);
                node.should.have.own.property("address");
                node.should.have.own.property("timeOut", serviceSampleRS.timeOut);
                done();
            });
    });
});