const chai = require('chai');
const fs = require('fs');
const { constants } = require('../../main/util/constants/constants');
const { registryService } = require('../../main/service/registry-service');
const { serviceRegistry } = require('../../main/entity/service-registry');

const should = chai.should();
const fileName = require('path').basename(__filename).replace(".js", "");

describe(`${fileName} : registry persistence and lifecycle`, () => {
    const baseService = {
        hostName: '127.0.0.1',
        nodeName: 'orders-node',
        port: 9000,
        serviceName: 'orders',
        ssl: false,
        timeOut: 5,
        weight: 3
    };

    beforeEach(() => {
        registryService.reset();
    });

    after(() => {
        registryService.reset();
    });

    it('persists registry state and restores active nodes on startup', () => {
        registryService.registryService(baseService);

        fs.existsSync(constants.REGISTRY_STATE_FILE).should.equal(true);

        registryService.reset(false);
        registryService.initialize();

        const restoredRegistry = serviceRegistry.getRegServers();
        restoredRegistry.should.have.own.property(baseService.serviceName);
        const nodes = restoredRegistry[baseService.serviceName].nodes;
        Object.keys(nodes).should.have.lengthOf(baseService.weight);
        nodes.should.have.own.property('orders-node-0');
    });

    it('removes stale virtual nodes when a service re-registers with a lower weight', () => {
        registryService.registryService(baseService);
        registryService.registryService({
            ...baseService,
            weight: 1
        });

        const nodes = serviceRegistry.getRegServers()[baseService.serviceName].nodes;
        Object.keys(nodes).should.deep.equal(['orders-node-0']);
    });
});
