const zookeeper = require('zookeeper');
const { serviceRegistry } = require('../entity/service-registry');
const { registryService } = require('./registry-service');
const config = require('../config/config');
const { consoleLog, consoleError } = require('../util/logging/logging-util');

class ZookeeperService {
    constructor() {
        if (!config.zookeeperEnabled) return;

        this.zkClient = zookeeper.createClient(`${config.zookeeperHost}:${config.zookeeperPort}`);
        this.registeredServices = new Map(); // zk path -> maxine service name

        this.zkClient.once('connected', () => {
            consoleLog('Connected to Zookeeper');
            this.watchServices();
        });

        this.zkClient.connect();
    }

    watchServices() {
        const servicesPath = '/services';

        this.zkClient.exists(servicesPath, (err, stat) => {
            if (err) {
                consoleError('Zookeeper exists error:', err);
                return;
            }
            if (!stat) {
                this.zkClient.mkdirp(servicesPath, (err) => {
                    if (err) consoleError('Zookeeper mkdirp error:', err);
                });
                return;
            }

            this.zkClient.getChildren(servicesPath, (event) => {
                if (event.type === zookeeper.ZOO_CHILD_EVENT) {
                    this.syncServices();
                }
            }, (err, children) => {
                if (err) {
                    consoleError('Zookeeper getChildren error:', err);
                    return;
                }
                this.syncServices(children);
            });
        });
    }

    syncServices(serviceNames) {
        const currentServices = new Set(serviceNames || []);

        // Remove services no longer in Zookeeper
        for (const [zkPath, maxineName] of this.registeredServices) {
            if (!currentServices.has(zkPath.split('/').pop())) {
                // Deregister from Maxine
                const nodes = serviceRegistry.getNodes(maxineName);
                Object.keys(nodes || {}).forEach(nodeName => {
                    registryService.deregisterService(maxineName, nodes[nodeName].parentNode, 'default', 'default', 'default');
                });
                this.registeredServices.delete(zkPath);
            }
        }

        // Add or update services
        for (const serviceName of currentServices) {
            const servicePath = `/services/${serviceName}`;
            if (!this.registeredServices.has(servicePath)) {
                this.registeredServices.set(servicePath, `zk-${serviceName}`);
            }
            const maxineServiceName = this.registeredServices.get(servicePath);

            this.zkClient.getChildren(servicePath, (err, instances) => {
                if (err) {
                    consoleError('Zookeeper getChildren instances error:', err);
                    return;
                }

                // Deregister existing nodes
                const existingNodes = serviceRegistry.getNodes(maxineServiceName);
                Object.keys(existingNodes || {}).forEach(nodeName => {
                    registryService.deregisterService(maxineServiceName, existingNodes[nodeName].parentNode, 'default', 'default', 'default');
                });

                // Register new nodes
                instances.forEach(instance => {
                    const instancePath = `${servicePath}/${instance}`;
                    this.zkClient.getData(instancePath, (err, data) => {
                        if (err) {
                            consoleError('Zookeeper getData error:', err);
                            return;
                        }
                        try {
                            const nodeData = JSON.parse(data.toString());
                            const nodeName = `${serviceName}-${instance}`;
                            const address = nodeData.address || `http://${nodeData.host}:${nodeData.port}`;

                            registryService.registryService({
                                serviceName: maxineServiceName,
                                nodeName,
                                address,
                                timeOut: nodeData.timeout || 30,
                                weight: nodeData.weight || 1,
                                metadata: {
                                    zookeeper: true,
                                    service: serviceName,
                                    ...nodeData.metadata
                                },
                                aliases: []
                            });
                        } catch (parseErr) {
                            consoleError('Zookeeper data parse error:', parseErr);
                        }
                    });
                });
            });
        }
    }
}

const zookeeperService = new ZookeeperService();

module.exports = {
    zookeeperService
};