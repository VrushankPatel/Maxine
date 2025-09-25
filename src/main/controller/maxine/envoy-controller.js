const { serviceRegistry } = require('../../entity/service-registry');
const config = require('../../config/config');

// Service mesh observability metrics
const serviceMeshMetrics = {
  envoyConfigsGenerated: 0,
  istioConfigsGenerated: 0,
  linkerdConfigsGenerated: 0,
  circuitBreakerTrips: 0,
  retryAttempts: 0,
  serviceMeshErrors: 0,
  lastConfigGeneration: 0,
};

const updateServiceMeshMetrics = (type) => {
  serviceMeshMetrics.lastConfigGeneration = Date.now();
  switch (type) {
    case 'envoy':
      serviceMeshMetrics.envoyConfigsGenerated++;
      break;
    case 'istio':
      serviceMeshMetrics.istioConfigsGenerated++;
      break;
    case 'linkerd':
      serviceMeshMetrics.linkerdConfigsGenerated++;
      break;
  }
};

const getServiceMeshMetrics = () => {
  return {
    ...serviceMeshMetrics,
    activeServices: serviceRegistry.getServiceCount ? serviceRegistry.getServiceCount() : 0,
    totalNodes: serviceRegistry.getNodeCount ? serviceRegistry.getNodeCount() : 0,
    healthyNodes: serviceRegistry.getHealthyNodeCount ? serviceRegistry.getHealthyNodeCount() : 0,
  };
};

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
              port_value: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
            },
          },
        });
      }
    }

    if (endpoints.length > 0) {
      clusters.push({
        name: serviceName,
        connect_timeout: '5s',
        type: 'STRICT_DNS',
        dns_lookup_family: 'V4_ONLY',
        lb_policy: 'ROUND_ROBIN',
        health_checks: [
          {
            timeout: '3s',
            interval: '10s',
            unhealthy_threshold: 3,
            healthy_threshold: 2,
            http_health_check: {
              path: '/health',
            },
          },
        ],
        circuit_breakers: {
          thresholds: [
            {
              max_connections: 1024,
              max_pending_requests: 1024,
              max_requests: 1024,
              max_retries: 3,
            },
          ],
        },
        outlier_detection: {
          consecutive_5xx: 5,
          interval: '10s',
          base_ejection_time: '30s',
          max_ejection_percent: 50,
        },
        load_assignment: {
          cluster_name: serviceName,
          endpoints: [
            {
              lb_endpoints: endpoints,
            },
          ],
        },
      });

      routes.push({
        match: {
          prefix: `/${serviceName}`,
        },
        route: {
          cluster: serviceName,
          prefix_rewrite: '/',
          retry_policy: {
            retry_on: '5xx,connect-failure,refused-stream',
            num_retries: 3,
            per_try_timeout: '2s',
          },
          timeout: '15s',
        },
      });
    }
  }

  const envoyConfig = {
    static_resources: {
      clusters: clusters,
      listeners: [
        {
          name: 'listener_0',
          address: {
            socket_address: {
              address: '0.0.0.0',
              port_value: 10000,
            },
          },
          filter_chains: [
            {
              filters: [
                {
                  name: 'envoy.filters.network.http_connection_manager',
                  typed_config: {
                    '@type':
                      'type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager',
                    codec_type: 'AUTO',
                    stat_prefix: 'ingress_http',
                    // Enhanced observability
                    access_log: [
                      {
                        name: 'envoy.access_loggers.file',
                        typed_config: {
                          '@type':
                            'type.googleapis.com/envoy.extensions.access_loggers.file.v3.FileAccessLog',
                          path: '/var/log/envoy/access.log',
                          log_format: {
                            text_format:
                              '[%START_TIME%] "%REQ(:METHOD)% %REQ(X-ENVOY-ORIGINAL-PATH?:PATH)% %PROTOCOL%" %RESPONSE_CODE% %RESPONSE_FLAGS% %BYTES_RECEIVED% %BYTES_SENT% %DURATION% "%REQ(X-FORWARDED-FOR)%" "%REQ(USER-AGENT)%" "%REQ(X-REQUEST-ID)%" "%REQ(:AUTHORITY)%" "%UPSTREAM_HOST%"\n',
                          },
                        },
                      },
                    ],
                    route_config: {
                      name: 'local_route',
                      virtual_hosts: [
                        {
                          name: 'backend',
                          domains: ['*'],
                          routes: routes,
                        },
                      ],
                    },
                    http_filters: [
                      // Service mesh observability filter
                      {
                        name: 'envoy.filters.http.lua',
                        typed_config: {
                          '@type': 'type.googleapis.com/envoy.extensions.filters.http.lua.v3.Lua',
                          inline_code: `
function envoy_on_request(request_handle)
    request_handle:headers():add("x-service-mesh", "maxine")
    request_handle:headers():add("x-request-start", tostring(envoy_now()))
end

function envoy_on_response(response_handle)
    local duration = envoy_now() - tonumber(response_handle:headers():get("x-request-start") or 0)
    response_handle:headers():add("x-response-time", tostring(duration))
end
                                        `,
                        },
                      },
                      {
                        name: 'envoy.filters.http.router',
                        typed_config: {
                          '@type':
                            'type.googleapis.com/envoy.extensions.filters.http.router.v3.Router',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    // Observability configuration
    admin: {
      address: {
        socket_address: {
          address: '0.0.0.0',
          port_value: 9901,
        },
      },
    },
    stats_config: {
      stats_matcher: {
        inclusion_list: {
          patterns: [
            {
              prefix: 'cluster.',
              suffix: '.upstream_rq_',
            },
            {
              prefix: 'http.',
              suffix: '_rq_',
            },
          ],
        },
      },
      use_all_default_tags: true,
    },
  };

  updateServiceMeshMetrics('envoy');
  res.json(envoyConfig);
};

const serviceMeshMetricsController = (req, res) => {
  res.json(getServiceMeshMetrics());
};

module.exports = {
  envoyConfigController,
  serviceMeshMetricsController,
};
