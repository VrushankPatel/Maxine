const k8s = require('@kubernetes/client-node');
const axios = require('axios');

class MaxineOperator {
    constructor() {
        this.kc = new k8s.KubeConfig();
        this.kc.loadFromDefault();

        this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
        this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
        this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);

        this.watchServiceRegistries();
        this.watchServiceInstances();
        this.watchServicePolicies();
    }

    watchServiceRegistries() {
        const watch = new k8s.Watch(this.kc);
        watch.watch('/apis/maxine.io/v1/serviceregistries', {}, (type, obj) => {
            if (type === 'ADDED' || type === 'MODIFIED') {
                this.reconcileServiceRegistry(obj);
            } else if (type === 'DELETED') {
                this.deleteServiceRegistry(obj);
            }
        }, (err) => {
            console.error('Error watching ServiceRegistries:', err);
        });
    }

    async reconcileServiceRegistry(sr) {
        const name = sr.metadata.name;
        const namespace = sr.metadata.namespace;
        const spec = sr.spec;

        // Create or update Deployment
        const deployment = {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
                name: `${name}-maxine`,
                namespace: namespace,
                labels: {
                    app: 'maxine',
                    'maxine.io/registry': name
                }
            },
            spec: {
                replicas: spec.replicas || 1,
                selector: {
                    matchLabels: {
                        app: 'maxine',
                        'maxine.io/registry': name
                    }
                },
                template: {
                    metadata: {
                        labels: {
                            app: 'maxine',
                            'maxine.io/registry': name
                        }
                    },
                    spec: {
                        containers: [{
                            name: 'maxine',
                            image: 'maxine:latest', // Assume image is available
                            ports: [{
                                containerPort: spec.config?.port || 8080
                            }],
                            env: [
                                { name: 'LIGHTNING_MODE', value: spec.mode === 'lightning' ? 'true' : 'false' },
                                { name: 'ULTRA_FAST_MODE', value: spec.mode === 'ultra-fast' ? 'true' : 'false' },
                                { name: 'PORT', value: String(spec.config?.port || 8080) },
                                { name: 'PERSISTENCE_ENABLED', value: String(spec.config?.persistenceEnabled || false) },
                                { name: 'AUTH_ENABLED', value: String(spec.config?.authEnabled || false) }
                            ]
                        }]
                    }
                }
            }
        };

        try {
            await this.appsApi.createNamespacedDeployment(namespace, deployment);
        } catch (err) {
            if (err.response?.statusCode === 409) {
                // Already exists, update
                await this.appsApi.replaceNamespacedDeployment(`${name}-maxine`, namespace, deployment);
            } else {
                console.error('Error creating deployment:', err);
            }
        }

        // Create Service
        const service = {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
                name: `${name}-maxine`,
                namespace: namespace,
                labels: {
                    app: 'maxine',
                    'maxine.io/registry': name
                }
            },
            spec: {
                selector: {
                    app: 'maxine',
                    'maxine.io/registry': name
                },
                ports: [{
                    port: spec.config?.port || 8080,
                    targetPort: spec.config?.port || 8080
                }]
            }
        };

        try {
            await this.coreApi.createNamespacedService(namespace, service);
        } catch (err) {
            if (err.response?.statusCode === 409) {
                // Already exists
            } else {
                console.error('Error creating service:', err);
            }
        }

        // Update status
        const status = {
            phase: 'Running',
            nodes: spec.replicas || 1,
            services: 0, // Will be updated by instances
            lastUpdated: new Date().toISOString()
        };

        await this.customApi.patchNamespacedCustomObjectStatus(
            'maxine.io', 'v1', namespace, 'serviceregistries', name,
            { status },
            undefined, undefined, undefined, { headers: { 'Content-Type': 'application/merge-patch+json' } }
        );
    }

    async deleteServiceRegistry(sr) {
        const name = sr.metadata.name;
        const namespace = sr.metadata.namespace;

        try {
            await this.appsApi.deleteNamespacedDeployment(`${name}-maxine`, namespace);
            await this.coreApi.deleteNamespacedService(`${name}-maxine`, namespace);
        } catch (err) {
            console.error('Error deleting resources:', err);
        }
    }

    watchServiceInstances() {
        const watch = new k8s.Watch(this.kc);
        watch.watch('/apis/maxine.io/v1/serviceinstances', {}, (type, obj) => {
            if (type === 'ADDED' || type === 'MODIFIED') {
                this.reconcileServiceInstance(obj);
            } else if (type === 'DELETED') {
                this.deleteServiceInstance(obj);
            }
        }, (err) => {
            console.error('Error watching ServiceInstances:', err);
        });
    }

    async reconcileServiceInstance(si) {
        const spec = si.spec;
        const registryService = await this.getRegistryService(si.metadata.namespace);

        if (!registryService) return;

        const registryUrl = `http://${registryService.spec.clusterIP}:${registryService.spec.ports[0].port}`;

        try {
            const response = await axios.post(`${registryUrl}/register`, {
                serviceName: spec.serviceName,
                host: spec.host,
                port: spec.port,
                metadata: spec.metadata || {},
                tags: spec.tags || []
            });

            // Update status
            const status = {
                nodeId: response.data.nodeId,
                registered: true,
                lastHeartbeat: new Date().toISOString()
            };

            await this.customApi.patchNamespacedCustomObjectStatus(
                'maxine.io', 'v1', si.metadata.namespace, 'serviceinstances', si.metadata.name,
                { status },
                undefined, undefined, undefined, { headers: { 'Content-Type': 'application/merge-patch+json' } }
            );
        } catch (err) {
            console.error('Error registering service:', err);
        }
    }

    async deleteServiceInstance(si) {
        const spec = si.spec;
        const registryService = await this.getRegistryService(si.metadata.namespace);

        if (!registryService) return;

        const registryUrl = `http://${registryService.spec.clusterIP}:${registryService.spec.ports[0].port}`;

        try {
            await axios.delete(`${registryUrl}/deregister`, {
                data: { nodeId: si.status?.nodeId }
            });
        } catch (err) {
            console.error('Error deregistering service:', err);
        }
    }

    watchServicePolicies() {
        const watch = new k8s.Watch(this.kc);
        watch.watch('/apis/maxine.io/v1/servicepolicies', {}, (type, obj) => {
            if (type === 'ADDED' || type === 'MODIFIED') {
                this.reconcileServicePolicy(obj);
            } else if (type === 'DELETED') {
                this.deleteServicePolicy(obj);
            }
        }, (err) => {
            console.error('Error watching ServicePolicies:', err);
        });
    }

    async reconcileServicePolicy(sp) {
        const spec = sp.spec;
        const registryService = await this.getRegistryService(sp.metadata.namespace);

        if (!registryService) return;

        const registryUrl = `http://${registryService.spec.clusterIP}:${registryService.spec.ports[0].port}`;

        try {
            // Set load balancing
            if (spec.loadBalancing) {
                await axios.post(`${registryUrl}/config/set`, {
                    serviceName: spec.serviceName,
                    key: 'loadBalancing',
                    value: spec.loadBalancing
                });
            }

            // Set traffic distribution
            if (spec.trafficDistribution) {
                await axios.post(`${registryUrl}/traffic/set`, {
                    serviceName: spec.serviceName,
                    distribution: spec.trafficDistribution
                });
            }

            // Set ACL
            if (spec.acl) {
                await axios.post(`${registryUrl}/acl/set`, {
                    serviceName: spec.serviceName,
                    allow: spec.acl.allow,
                    deny: spec.acl.deny
                });
            }

            // Update status
            const status = {
                applied: true,
                lastUpdated: new Date().toISOString()
            };

            await this.customApi.patchNamespacedCustomObjectStatus(
                'maxine.io', 'v1', sp.metadata.namespace, 'servicepolicies', sp.metadata.name,
                { status },
                undefined, undefined, undefined, { headers: { 'Content-Type': 'application/merge-patch+json' } }
            );
        } catch (err) {
            console.error('Error applying policy:', err);
        }
    }

    async deleteServicePolicy(sp) {
        // Reset to defaults or remove policies
        // For simplicity, just mark as not applied
        const status = {
            applied: false,
            lastUpdated: new Date().toISOString()
        };

        await this.customApi.patchNamespacedCustomObjectStatus(
            'maxine.io', 'v1', sp.metadata.namespace, 'servicepolicies', sp.metadata.name,
            { status },
            undefined, undefined, undefined, { headers: { 'Content-Type': 'application/merge-patch+json' } }
        );
    }

    async getRegistryService(namespace) {
        try {
            const services = await this.coreApi.listNamespacedService(namespace, undefined, undefined, undefined, 'app=maxine');
            return services.body.items[0]; // Assume one registry per namespace for simplicity
        } catch (err) {
            console.error('Error getting registry service:', err);
            return null;
        }
    }
}

// Start the operator
const operator = new MaxineOperator();
console.log('Maxine Operator started');