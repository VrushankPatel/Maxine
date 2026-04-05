var chai = require('chai');
const { buildApp } = require('../../../index');
const { MaxineClient } = require('../../../client-sdk');
const { testUser, serviceDataSample } = require('../testUtil/test-constants');

var should = chai.should();

const fileName = require('path').basename(__filename).replace(".js","");

describe(`${fileName} : Node SDK`, () => {
    let server;
    let client;

    before((done) => {
        const app = buildApp();
        server = app.listen(0, () => {
            const { port } = server.address();
            client = new MaxineClient({ baseUrl: `http://127.0.0.1:${port}` });
            done();
        });
    });

    after((done) => {
        server.close(done);
    });

    it('signs in, manages config, registers a service, and resolves a redirect location', async () => {
        const token = await client.signIn(testUser.userName, testUser.password);
        token.should.be.a('string');

        const config = await client.getConfig();
        config.should.have.own.property('heartBeatTimeout');

        const registration = await client.register(serviceDataSample);
        registration.should.have.own.property('serviceName', serviceDataSample.serviceName);

        const servers = await client.listServers();
        servers.should.have.own.property(serviceDataSample.serviceName);

        const discovery = await client.discoverLocation(serviceDataSample.serviceName, '/health');
        discovery.should.have.own.property('status', 302);
        discovery.should.have.own.property('location', 'https://xx.xxx.xx.xx:8082/health');

        const logs = await client.listLogFiles();
        logs.should.be.a('object');
    });
});
