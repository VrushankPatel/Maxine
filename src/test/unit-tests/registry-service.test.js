const chai = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { constants } = require('../../main/util/constants/constants');
const { registryService } = require('../../main/service/registry-service');
const { serviceRegistry } = require('../../main/entity/service-registry');

const should = chai.should();
const fileName = require('path').basename(__filename).replace(".js", "");

class FakeRedisClient {
    constructor(sharedState) {
        this.sharedState = sharedState;
        this.handlers = {};
        this.isOpen = false;
    }

    on = (eventName, handler) => {
        this.handlers[eventName] = handler;
    }

    connect = async () => {
        this.isOpen = true;
    }

    quit = async () => {
        this.isOpen = false;
    }

    getActiveEntry = (key) => {
        const entry = this.sharedState.store.get(key);
        if (!entry) {
            return undefined;
        }

        if (entry.expiresAt && entry.expiresAt <= Date.now()) {
            this.sharedState.store.delete(key);
            return undefined;
        }

        return entry;
    }

    get = async (key) => {
        const entry = this.getActiveEntry(key);
        return entry ? entry.value : null;
    }

    set = async (key, value, options = {}) => {
        const existingEntry = this.getActiveEntry(key);
        if (options.NX && existingEntry) {
            return null;
        }

        this.sharedState.store.set(key, {
            value,
            expiresAt: options.PX ? Date.now() + options.PX : null
        });

        return 'OK';
    }

    del = async (key) => {
        return this.sharedState.store.delete(key) ? 1 : 0;
    }

    eval = async (_script, options = {}) => {
        const [key] = options.keys || [];
        const [expectedValue] = options.arguments || [];
        const currentValue = await this.get(key);
        if (currentValue !== expectedValue) {
            return 0;
        }

        return this.del(key);
    }
}

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

    beforeEach(async () => {
        await registryService.reset();
    });

    after(async () => {
        await registryService.reset();
    });

    it('persists registry state and restores active nodes on startup', async () => {
        await registryService.registryService(baseService);

        fs.existsSync(constants.REGISTRY_STATE_FILE).should.equal(true);

        await registryService.reset(false);
        await registryService.initialize();

        const restoredRegistry = serviceRegistry.getRegServers();
        restoredRegistry.should.have.own.property(baseService.serviceName);
        const nodes = restoredRegistry[baseService.serviceName].nodes;
        Object.keys(nodes).should.have.lengthOf(baseService.weight);
        nodes.should.have.own.property('orders-node-0');
    });

    it('removes stale virtual nodes when a service re-registers with a lower weight', async () => {
        await registryService.registryService(baseService);
        await registryService.registryService({
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
            registryStateService: require('../../main/service/registry-state-service').registryStateService,
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

    it('synchronizes active registrations across fresh shared-file instances', async () => {
        const writerModules = loadFreshRegistryModules();
        await writerModules.registryService.reset();

        await writerModules.registryService.registryService({
            hostName: '127.0.0.1',
            nodeName: 'inventory-node',
            port: 9100,
            serviceName: 'inventory',
            ssl: false,
            timeOut: 5,
            weight: 2
        });

        const readerModules = loadFreshRegistryModules();
        await readerModules.registryService.initialize();
        const registrySnapshot = await readerModules.registryService.getRegisteredServers();

        registrySnapshot.should.have.own.property('inventory');
        Object.keys(registrySnapshot.inventory.nodes).should.have.lengthOf(2);
    });

    it('persists round-robin offsets through the shared-file state', async () => {
        const writerModules = loadFreshRegistryModules();
        await writerModules.registryService.reset();

        await writerModules.registryService.registryService({
            hostName: '127.0.0.1',
            nodeName: 'billing-node',
            port: 9200,
            serviceName: 'billing',
            ssl: false,
            timeOut: 5,
            weight: 2
        });

        (await writerModules.registryService.getOffsetAndIncrement('billing')).should.equal(0);

        const readerModules = loadFreshRegistryModules();
        await readerModules.registryService.initialize();
        (await readerModules.registryService.getRegisteredServers()).billing.offset.should.equal(1);
    });
});

describe(`${fileName} : redis registry state mode`, () => {
    const sharedRedisState = {
        store: new Map()
    };
    const modulePaths = [
        '../../main/util/constants/constants',
        '../../main/entity/service-registry',
        '../../main/service/registry-state-service',
        '../../main/service/registry-service'
    ];

    const loadFreshRedisModules = () => {
        modulePaths.forEach((modulePath) => {
            delete require.cache[require.resolve(modulePath)];
        });

        const registryStateService = require('../../main/service/registry-state-service').registryStateService;
        registryStateService.setRedisClientFactory(() => new FakeRedisClient(sharedRedisState));

        return {
            registryStateService,
            registryService: require('../../main/service/registry-service').registryService
        };
    };

    before(() => {
        process.env.MAXINE_REGISTRY_STATE_MODE = 'redis';
        process.env.MAXINE_REGISTRY_REDIS_URL = 'redis://fake-redis:6379';
        process.env.MAXINE_REGISTRY_REDIS_KEY_PREFIX = 'maxine:test';
    });

    after(async () => {
        delete process.env.MAXINE_REGISTRY_STATE_MODE;
        delete process.env.MAXINE_REGISTRY_REDIS_URL;
        delete process.env.MAXINE_REGISTRY_REDIS_KEY_PREFIX;
        sharedRedisState.store.clear();

        const cleanupModules = loadFreshRedisModules();
        await cleanupModules.registryStateService.close();

        modulePaths.forEach((modulePath) => {
            delete require.cache[require.resolve(modulePath)];
        });
    });

    beforeEach(() => {
        sharedRedisState.store.clear();
    });

    it('synchronizes active registrations across fresh redis-backed instances', async () => {
        const writerModules = loadFreshRedisModules();
        await writerModules.registryService.reset();

        await writerModules.registryService.registryService({
            hostName: '127.0.0.1',
            nodeName: 'payments-node',
            port: 9300,
            serviceName: 'payments',
            ssl: false,
            timeOut: 5,
            weight: 2
        });

        const readerModules = loadFreshRedisModules();
        await readerModules.registryService.initialize();
        const registrySnapshot = await readerModules.registryService.getRegisteredServers();

        registrySnapshot.should.have.own.property('payments');
        Object.keys(registrySnapshot.payments.nodes).should.have.lengthOf(2);
    });

    it('persists round-robin offsets through the redis-backed state', async () => {
        const writerModules = loadFreshRedisModules();
        await writerModules.registryService.reset();

        await writerModules.registryService.registryService({
            hostName: '127.0.0.1',
            nodeName: 'shipping-node',
            port: 9400,
            serviceName: 'shipping',
            ssl: false,
            timeOut: 5,
            weight: 2
        });

        (await writerModules.registryService.getOffsetAndIncrement('shipping')).should.equal(0);

        const readerModules = loadFreshRedisModules();
        await readerModules.registryService.initialize();
        (await readerModules.registryService.getRegisteredServers()).shipping.offset.should.equal(1);
    });
});
