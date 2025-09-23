const k8s = require('@kubernetes/client-node');
const { serviceRegistry } = require('../entity/service-registry');
const { registryService } = require('./registry-service');
const config = require('../config/config');

class K8sService {
    constructor() {
        if (!config.kubernetesEnabled) return;

        this.kc = new k8s.KubeConfig();
        this.kc.loadFromDefault();
        this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
        this.registeredServices = new Map(); // k8s service name -> maxine service name

        this.watchServices();
        this.watchEndpoints();
    }

    watchServices() {
        const watch = new k8s.Watch(this.kc);
        watch.watch('/api/v1/services', {}, (type, obj) => {
            const serviceName = `${obj.metadata.namespace}/${obj.metadata.name}`;
            if (type === 'ADDED' || type === 'MODIFIED') {
                // Register or update service
                this.registerK8sService(obj);
            } else if (type === 'DELETED') {
                // Deregister service
                this.deregisterK8sService(obj);
            }
        }, (err) => {
            console.error('Error watching services:', err);
        });
    }

    watchEndpoints() {
        const watch = new k8s.Watch(this.kc);
        watch.watch('/api/v1/endpoints', {}, (type, obj) => {
            const serviceName = `${obj.metadata.namespace}/${obj.metadata.name}`;
            if (type === 'ADDED' || type === 'MODIFIED') {
                this.updateEndpoints(obj);
            } else if (type === 'DELETED') {
                this.removeEndpoints(obj);
            }
        }, (err) => {
            console.error('Error watching endpoints:', err);
        });
    }

    registerK8sService(k8sService) {
        const serviceName = `${k8sService.metadata.namespace}/${k8sService.metadata.name}`;
        const maxineServiceName = `k8s-${serviceName}`;
        this.registeredServices.set(serviceName, maxineServiceName);

        // Get endpoints
        this.k8sApi.readNamespacedEndpoints(k8sService.metadata.name, k8sService.metadata.namespace).then((res) => {
            this.updateEndpoints(res.body);
        }).catch((err) => {
            console.error('Error reading endpoints:', err);
        });
    }

    deregisterK8sService(k8sService) {
        const serviceName = `${k8sService.metadata.namespace}/${k8sService.metadata.name}`;
        const maxineServiceName = this.registeredServices.get(serviceName);
        if (maxineServiceName) {
            // Deregister all nodes for this service
            const nodes = serviceRegistry.getNodes(maxineServiceName);
            Object.keys(nodes || {}).forEach(nodeName => {
                registryService.deregisterService(maxineServiceName, nodes[nodeName].parentNode, 'default', 'default', 'default');
            });
            this.registeredServices.delete(serviceName);
        }
    }

    updateEndpoints(endpoints) {
        const serviceName = `${endpoints.metadata.namespace}/${endpoints.metadata.name}`;
        const maxineServiceName = this.registeredServices.get(serviceName);
        if (!maxineServiceName) return;

        // Deregister existing nodes
        const existingNodes = serviceRegistry.getNodes(maxineServiceName);
        Object.keys(existingNodes || {}).forEach(nodeName => {
            registryService.deregisterService(maxineServiceName, existingNodes[nodeName].parentNode, 'default', 'default', 'default');
        });

        // Register new endpoints
        (endpoints.subsets || []).forEach(subset => {
            (subset.addresses || []).forEach((address, index) => {
                const port = subset.ports && subset.ports[0] ? subset.ports[0].port : 80;
                const nodeName = `${address.ip}:${port}`;
                const fullAddress = `http://${address.ip}:${port}`;

                registryService.registryService({
                    serviceName: maxineServiceName,
                    nodeName,
                    address: fullAddress,
                    timeOut: 30, // Default timeout
                    weight: 1,
                    metadata: {
                        k8s: true,
                        namespace: endpoints.metadata.namespace,
                        service: endpoints.metadata.name,
                        labels: endpoints.metadata.labels || {}
                    },
                    aliases: []
                });
            });
        });
    }

    removeEndpoints(endpoints) {
        const serviceName = `${endpoints.metadata.namespace}/${endpoints.metadata.name}`;
        const maxineServiceName = this.registeredServices.get(serviceName);
        if (maxineServiceName) {
            const nodes = serviceRegistry.getNodes(maxineServiceName);
            Object.keys(nodes || {}).forEach(nodeName => {
                registryService.deregisterService(maxineServiceName, nodes[nodeName].parentNode, 'default', 'default', 'default');
            });
        }
    }
}

const k8sService = new K8sService();

module.exports = {
    k8sService
};