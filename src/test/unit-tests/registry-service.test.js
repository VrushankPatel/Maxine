const chai = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

describe(`${fileName} : shared-file registry state mode`, () => {
    const testRegistryStateFile = path.join(os.tmpdir(), 'maxine-shared-registry-state-test.json');
    const modulePaths = [
        '../../main/util/constants/constants',
        '../../main/entity/service-registry',
        '../../main/service/registry-state-service',
        '../../main/service/registry-service'
    ];

    const loadFreshRegistryModules = () => {
        modulePaths.forEach((modulePath) => {
            delete require.cache[require.resolve(modulePath)];
        });

        return {
            constants: require('../../main/util/constants/constants').constants,
            registryService: require('../../main/service/registry-service').registryService,
            serviceRegistry: require('../../main/entity/service-registry').serviceRegistry
        };
    };

    before(() => {
        process.env.MAXINE_REGISTRY_STATE_MODE = 'shared-file';
        process.env.MAXINE_REGISTRY_STATE_FILE = testRegistryStateFile;
    });

    after(() => {
        delete process.env.MAXINE_REGISTRY_STATE_MODE;
        delete process.env.MAXINE_REGISTRY_STATE_FILE;
        fs.rmSync(testRegistryStateFile, { force: true });
        fs.rmSync(`${testRegistryStateFile}.lock`, { recursive: true, force: true });
        modulePaths.forEach((modulePath) => {
            delete require.cache[require.resolve(modulePath)];
        });
    });

    beforeEach(() => {
        fs.rmSync(testRegistryStateFile, { force: true });
        fs.rmSync(`${testRegistryStateFile}.lock`, { recursive: true, force: true });
    });

    it('synchronizes active registrations across fresh shared-file instances', () => {
        const writerModules = loadFreshRegistryModules();
        writerModules.registryService.reset();

        writerModules.registryService.registryService({
            hostName: '127.0.0.1',
            nodeName: 'inventory-node',
            port: 9100,
            serviceName: 'inventory',
            ssl: false,
            timeOut: 5,
            weight: 2
        });

        const readerModules = loadFreshRegistryModules();
        readerModules.registryService.initialize();
        const registrySnapshot = readerModules.registryService.getRegisteredServers();

        registrySnapshot.should.have.own.property('inventory');
        Object.keys(registrySnapshot.inventory.nodes).should.have.lengthOf(2);
    });

    it('persists round-robin offsets through the shared-file state', () => {
        const writerModules = loadFreshRegistryModules();
        writerModules.registryService.reset();

        writerModules.registryService.registryService({
            hostName: '127.0.0.1',
            nodeName: 'billing-node',
            port: 9200,
            serviceName: 'billing',
            ssl: false,
            timeOut: 5,
            weight: 2
        });

        writerModules.registryService.getOffsetAndIncrement('billing').should.equal(0);

        const readerModules = loadFreshRegistryModules();
        readerModules.registryService.initialize();
        readerModules.registryService.getRegisteredServers().billing.offset.should.equal(1);
    });
});
