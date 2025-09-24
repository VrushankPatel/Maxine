const k8s = require('@kubernetes/client-node');
const axios = require('axios');

class MaxineOperator {
    constructor() {
        this.kc = new k8s.KubeConfig();
        this.kc.loadFromDefault();

        this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
        this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
        this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);

        this.maxineUrl = process.env.MAXINE_URL || 'http://maxine-service:8080';

        this.watchServiceRegistries();
        this.watchServiceInstances();
        this.watchServicePolicies();
        this.watchServiceMeshOperators();
        this.watchTrafficPolicies();
        this.watchServiceEndpoints();
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

    // Service Mesh Operator methods
    watchServiceMeshOperators() {
        const watch = new k8s.Watch(this.kc);
        watch.watch('/apis/maxine.io/v1/servicemeshoperators', {}, (type, obj) => {
            if (type === 'ADDED' || type === 'MODIFIED') {
                this.reconcileServiceMeshOperator(obj);
            } else if (type === 'DELETED') {
                this.deleteServiceMeshOperator(obj);
            }
        }, (err) => {
            console.error('Error watching ServiceMeshOperators:', err);
        });
    }

    async reconcileServiceMeshOperator(smo) {
        const { meshType, namespace, serviceSelector, policies } = smo.spec;

        await this.updateServiceMeshOperatorStatus(smo, 'Configuring', 'Configuring service mesh');

        try {
            switch (meshType) {
                case 'istio':
                    await this.configureIstio(smo);
                    break;
                case 'linkerd':
                    await this.configureLinkerd(smo);
                    break;
                case 'envoy':
                    await this.configureEnvoy(smo);
                    break;
                default:
                    throw new Error(`Unsupported mesh type: ${meshType}`);
            }

            await this.updateServiceMeshOperatorStatus(smo, 'Running', 'Service mesh configured successfully');
        } catch (error) {
            await this.updateServiceMeshOperatorStatus(smo, 'Failed', error.message);
        }
    }

    async configureIstio(smo) {
        const { namespace, serviceSelector, policies } = smo.spec;

        // Get services from Maxine
        const services = await this.getMaxineServices();

        // Generate Istio configurations
        const configurations = [];

        for (const [serviceName, serviceData] of Object.entries(services)) {
            // VirtualService
            const virtualService = {
                apiVersion: 'networking.istio.io/v1beta1',
                kind: 'VirtualService',
                metadata: {
                    name: `${serviceName}-operator`,
                    namespace: namespace
                },
                spec: {
                    hosts: [serviceName],
                    http: [{
                        route: [{
                            destination: {
                                host: serviceName
                            }
                        }],
                        timeout: policies?.circuitBreaker?.timeout || '30s',
                        retries: {
                            attempts: policies?.retry?.attempts || 3,
                            perTryTimeout: policies?.retry?.timeout || '2s'
                        }
                    }]
                }
            };

            // DestinationRule
            const destinationRule = {
                apiVersion: 'networking.istio.io/v1beta1',
                kind: 'DestinationRule',
                metadata: {
                    name: `${serviceName}-operator`,
                    namespace: namespace
                },
                spec: {
                    host: serviceName,
                    trafficPolicy: {
                        loadBalancer: {
                            simple: this.mapLoadBalancingStrategy(policies?.loadBalancing)
                        },
                        connectionPool: {
                            http: {
                                http1MaxPendingRequests: policies?.circuitBreaker?.maxRequests || 100,
                                maxRequestsPerConnection: 10
                            }
                        },
                        outlierDetection: {
                            consecutive5xxErrors: 5,
                            interval: '10s',
                            baseEjectionTime: '30s',
                            maxEjectionPercent: 50
                        }
                    }
                }
            };

            configurations.push(virtualService, destinationRule);
        }

        // Apply configurations to Kubernetes
        for (const config of configurations) {
            await this.applyKubernetesResource(config);
        }
    }

    async configureLinkerd(smo) {
        const { namespace, serviceSelector, policies } = smo.spec;

        // Get services from Maxine
        const services = await this.getMaxineServices();

        // Generate Linkerd configurations
        const configurations = [];

        for (const [serviceName, serviceData] of Object.entries(services)) {
            const serviceProfile = {
                apiVersion: 'linkerd.io/v1alpha2',
                kind: 'ServiceProfile',
                metadata: {
                    name: `${serviceName}-operator`,
                    namespace: namespace
                },
                spec: {
                    routes: [{
                        name: 'default',
                        condition: {
                            all: true
                        },
                        responseClasses: [{
                            condition: {
                                status: {
                                    min: 500,
                                    max: 599
                                }
                            },
                            isFailure: true
                        }],
                        timeout: policies?.circuitBreaker?.timeout || '30s',
                        retries: {
                            limit: policies?.retry?.attempts || 3,
                            timeout: policies?.retry?.timeout || '2s'
                        }
                    }]
                }
            };

            configurations.push(serviceProfile);
        }

        // Apply configurations to Kubernetes
        for (const config of configurations) {
            await this.applyKubernetesResource(config);
        }
    }

    async configureEnvoy(smo) {
        const { namespace, serviceSelector, policies } = smo.spec;

        // Generate Envoy configurations
        const envoyConfig = {
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: {
                name: 'envoy-config-operator',
                namespace: namespace
            },
            data: {
                'envoy.yaml': this.generateEnvoyConfig(smo)
            }
        };

        await this.applyKubernetesResource(envoyConfig);
    }

    generateEnvoyConfig(smo) {
        const { policies } = smo.spec;

        // Simplified Envoy configuration
        return `
static_resources:
  listeners:
  - name: listener_0
    address:
      socket_address:
        address: 0.0.0.0
        port_value: 10000
    filter_chains:
    - filters:
      - name: envoy.filters.network.http_connection_manager
        typed_config:
          "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
          stat_prefix: ingress_http
          route_config:
            name: local_route
            virtual_hosts:
            - name: local_service
              domains: ["*"]
              routes:
              - match:
                  prefix: "/"
                route:
                  cluster: service_cluster
                  timeout: ${policies?.circuitBreaker?.timeout || '30s'}
          http_filters:
          - name: envoy.filters.http.router
            typed_config:
              "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router

  clusters:
  - name: service_cluster
    type: STRICT_DNS
    lb_policy: ${this.mapEnvoyLoadBalancing(policies?.loadBalancing)}
    circuit_breakers:
      thresholds:
      - max_requests: ${policies?.circuitBreaker?.maxRequests || 100}
    http2_protocol_options: {}
    upstream_connection_options:
      tcp_keepalive:
        keepalive_probes: 3
        keepalive_time: 600
        keepalive_interval: 60
`;
    }

    mapLoadBalancingStrategy(strategy) {
        switch (strategy) {
            case 'least_request': return 'LEAST_REQUEST';
            case 'consistent_hash': return 'RING_HASH';
            default: return 'ROUND_ROBIN';
        }
    }

    mapEnvoyLoadBalancing(strategy) {
        switch (strategy) {
            case 'least_request': return 'LEAST_REQUEST';
            case 'consistent_hash': return 'RING_HASH';
            default: return 'ROUND_ROBIN';
        }
    }

    async applyKubernetesResource(resource) {
        try {
            const { apiVersion, kind, metadata, spec } = resource;

            // Use appropriate Kubernetes API
            if (kind === 'VirtualService' || kind === 'DestinationRule') {
                // Istio CRDs
                await this.customApi.createNamespacedCustomObject(
                    'networking.istio.io',
                    'v1beta1',
                    metadata.namespace,
                    kind.toLowerCase() + 's',
                    resource
                );
            } else if (kind === 'ServiceProfile') {
                // Linkerd CRDs
                await this.customApi.createNamespacedCustomObject(
                    'linkerd.io',
                    'v1alpha2',
                    metadata.namespace,
                    'serviceprofiles',
                    resource
                );
            } else {
                // Standard Kubernetes resources
                await this.coreApi.createNamespacedConfigMap(metadata.namespace, resource);
            }
        } catch (error) {
            console.error('Failed to apply Kubernetes resource:', error);
            throw error;
        }
    }

    async getMaxineServices() {
        const response = await axios.get(`${this.maxineUrl}/api/maxine/servers`, {
            headers: {
                'Authorization': `Bearer ${process.env.MAXINE_API_KEY || 'admin'}`
            }
        });

        return response.data;
    }

    async updateServiceMeshOperatorStatus(smo, phase, message) {
        const status = {
            phase,
            conditions: [{
                type: 'Ready',
                status: phase === 'Running' ? 'True' : 'False',
                lastTransitionTime: new Date().toISOString(),
                reason: phase,
                message
            }]
        };

        await this.customApi.patchNamespacedCustomObjectStatus(
            'maxine.io',
            'v1',
            smo.metadata.namespace,
            'servicemeshoperators',
            smo.metadata.name,
            { status },
            undefined,
            undefined,
            undefined,
            { headers: { 'Content-Type': 'application/merge-patch+json' } }
        );
    }

    async deleteServiceMeshOperator(smo) {
        // Cleanup logic for when SMO is deleted
        console.log(`Cleaning up ServiceMeshOperator: ${smo.metadata.name}`);
        // Remove associated Kubernetes resources
    }

    watchTrafficPolicies() {
        const watch = new k8s.Watch(this.kc);
        watch.watch('/apis/maxine.io/v1/trafficpolicies', {}, (type, obj) => {
            if (type === 'ADDED' || type === 'MODIFIED') {
                this.reconcileTrafficPolicy(obj);
            } else if (type === 'DELETED') {
                this.deleteTrafficPolicy(obj);
            }
        }, (err) => {
            console.error('Error watching TrafficPolicies:', err);
        });
    }

    async reconcileTrafficPolicy(tp) {
        const { serviceName, rules } = tp.spec;

        await this.updateTrafficPolicyStatus(tp, 'Applying', 'Applying traffic policy');

        try {
            // Apply traffic rules to Maxine
            await this.applyTrafficRulesToMaxine(serviceName, rules);
            await this.updateTrafficPolicyStatus(tp, 'Applied', 'Traffic policy applied successfully');
        } catch (error) {
            await this.updateTrafficPolicyStatus(tp, 'Failed', error.message);
        }
    }

    async applyTrafficRulesToMaxine(serviceName, rules) {
        // Send traffic rules to Maxine service mesh AI optimization
        const response = await axios.post(`${this.maxineUrl}/api/maxine/service-mesh/ai/optimize/istio`, {
            serviceName,
            rules
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.MAXINE_API_KEY || 'admin'}`
            }
        });

        return response.data;
    }

    async updateTrafficPolicyStatus(tp, phase, message) {
        const status = {
            phase,
            appliedAt: new Date().toISOString()
        };

        await this.customApi.patchNamespacedCustomObjectStatus(
            'maxine.io',
            'v1',
            tp.metadata.namespace,
            'trafficpolicies',
            tp.metadata.name,
            { status },
            undefined,
            undefined,
            undefined,
            { headers: { 'Content-Type': 'application/merge-patch+json' } }
        );
    }

    async deleteTrafficPolicy(tp) {
        // Cleanup logic for when TrafficPolicy is deleted
        console.log(`Cleaning up TrafficPolicy: ${tp.metadata.name}`);
    }

    watchServiceEndpoints() {
        const watch = new k8s.Watch(this.kc);
        watch.watch('/apis/maxine.io/v1/serviceendpoints', {}, (type, obj) => {
            if (type === 'ADDED' || type === 'MODIFIED') {
                this.reconcileServiceEndpoint(obj);
            } else if (type === 'DELETED') {
                this.deleteServiceEndpoint(obj);
            }
        }, (err) => {
            console.error('Error watching ServiceEndpoints:', err);
        });
    }

    async reconcileServiceEndpoint(se) {
        const { serviceName, endpoints } = se.spec;

        await this.updateServiceEndpointStatus(se, 'Registering', 'Registering service endpoints');

        try {
            // Register endpoints with Maxine
            for (const endpoint of endpoints) {
                await this.registerEndpointWithMaxine(serviceName, endpoint);
            }

            await this.updateServiceEndpointStatus(se, 'Registered', 'Service endpoints registered successfully', endpoints.length);
        } catch (error) {
            await this.updateServiceEndpointStatus(se, 'Failed', error.message);
        }
    }

    async registerEndpointWithMaxine(serviceName, endpoint) {
        // Register endpoint with Maxine
        const response = await axios.post(`${this.maxineUrl}/api/maxine/register`, {
            serviceName,
            hostName: endpoint.address,
            nodeName: `${serviceName}-${endpoint.address.replace(/\./g, '-')}`,
            port: endpoint.port,
            weight: 1
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.MAXINE_API_KEY || 'admin'}`
            }
        });

        return response.data;
    }

    async updateServiceEndpointStatus(se, phase, message, endpointCount = 0) {
        const status = {
            phase,
            registeredAt: new Date().toISOString(),
            endpointCount
        };

        await this.customApi.patchNamespacedCustomObjectStatus(
            'maxine.io',
            'v1',
            se.metadata.namespace,
            'serviceendpoints',
            se.metadata.name,
            { status },
            undefined,
            undefined,
            undefined,
            { headers: { 'Content-Type': 'application/merge-patch+json' } }
        );
    }

    async deleteServiceEndpoint(se) {
        // Cleanup logic for when ServiceEndpoint is deleted
        console.log(`Cleaning up ServiceEndpoint: ${se.metadata.name}`);
        // Deregister endpoints from Maxine
    }
}

// Start the operator
const operator = new MaxineOperator();
console.log('Maxine Operator started');