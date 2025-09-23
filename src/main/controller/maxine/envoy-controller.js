const { serviceRegistry } = require("../../entity/service-registry");
const config = require("../../config/config");

const envoyConfigController = (req, res) => {
    const services = serviceRegistry.getRegServers();
    const clusters = [];
    const routes = [];

    for (const [serviceName, serviceData] of Object.entries(services)) {
        const nodes = serviceData.nodes || {};
        const endpoints = [];

        for (const [nodeName, node] of Object.entries(nodes)) {
            if (node.healthy !== false) {
                const url = new URL(node.address);
                endpoints.push({
                    address: {
                        socket_address: {
                            address: url.hostname,
                            port_value: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80)
                        }
                    }
                });
            }
        }

        if (endpoints.length > 0) {
            clusters.push({
                name: serviceName,
                connect_timeout: "5s",
                type: "STRICT_DNS",
                dns_lookup_family: "V4_ONLY",
                load_assignment: {
                    cluster_name: serviceName,
                    endpoints: [{
                        lb_endpoints: endpoints
                    }]
                }
            });

            routes.push({
                match: {
                    prefix: `/${serviceName}`
                },
                route: {
                    cluster: serviceName,
                    prefix_rewrite: "/"
                }
            });
        }
    }

    const envoyConfig = {
        static_resources: {
            clusters: clusters,
            listeners: [{
                name: "listener_0",
                address: {
                    socket_address: {
                        address: "0.0.0.0",
                        port_value: 10000
                    }
                },
                filter_chains: [{
                    filters: [{
                        name: "envoy.filters.network.http_connection_manager",
                        typed_config: {
                            "@type": "type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager",
                            codec_type: "AUTO",
                            stat_prefix: "ingress_http",
                            route_config: {
                                name: "local_route",
                                virtual_hosts: [{
                                    name: "backend",
                                    domains: ["*"],
                                    routes: routes
                                }]
                            },
                            http_filters: [{
                                name: "envoy.filters.http.router",
                                typed_config: {
                                    "@type": "type.googleapis.com/envoy.extensions.filters.http.router.v3.Router"
                                }
                            }]
                        }
                    }]
                }]
            }]
        }
    };

    res.json(envoyConfig);
}

module.exports = envoyConfigController