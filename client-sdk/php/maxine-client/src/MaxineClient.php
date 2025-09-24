<?php

namespace Maxine;

/**
 * PHP client for Maxine Service Registry
 */
class MaxineClient
{
    private string $baseUrl;
    private int $timeout;
    private int $cacheMax;
    private int $cacheTtl;
    private array $discoveryCache = [];
    private array $cacheTimestamps = [];
    private array $cacheOrder = [];

    /**
     * Initialize the Maxine client
     *
     * @param string $baseUrl Base URL of the Maxine server
     * @param int $timeout Request timeout in seconds
     * @param int $cacheMax Maximum cache size
     * @param int $cacheTtl Cache TTL in seconds
     */
    public function __construct(
        string $baseUrl = "http://localhost:8080",
        int $timeout = 5,
        int $cacheMax = 100,
        int $cacheTtl = 30
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->timeout = $timeout;
        $this->cacheMax = $cacheMax;
        $this->cacheTtl = $cacheTtl;
    }

    /**
     * Make HTTP request to Maxine API
     */
    private function makeRequest(string $method, string $endpoint, array $options = []): array
    {
        $url = $this->baseUrl . '/api/maxine/serviceops/' . ltrim($endpoint, '/');

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

        if (isset($options['json'])) {
            $json = json_encode($options['json']);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Content-Length: ' . strlen($json)
            ]);
        }

        if (isset($options['query'])) {
            $url .= '?' . http_build_query($options['query']);
            curl_setopt($ch, CURLOPT_URL, $url);
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 400) {
            throw new \Exception("HTTP $httpCode: $response");
        }

        return json_decode($response, true) ?: [];
    }

    /**
     * Get cached data if valid
     */
    private function getCache(string $key): ?array
    {
        if (isset($this->discoveryCache[$key])) {
            if (time() - ($this->cacheTimestamps[$key] ?? 0) < $this->cacheTtl) {
                return $this->discoveryCache[$key];
            } else {
                unset($this->discoveryCache[$key]);
                unset($this->cacheTimestamps[$key]);
                if (($key = array_search($key, $this->cacheOrder)) !== false) {
                    unset($this->cacheOrder[$key]);
                }
            }
        }
        return null;
    }

    /**
     * Set cache data
     */
    private function setCache(string $key, array $data): void
    {
        if (count($this->discoveryCache) >= $this->cacheMax) {
            // Simple LRU: remove oldest
            $oldestKey = null;
            $oldestTime = time();
            foreach ($this->cacheTimestamps as $k => $timestamp) {
                if ($timestamp < $oldestTime) {
                    $oldestTime = $timestamp;
                    $oldestKey = $k;
                }
            }
            if ($oldestKey) {
                unset($this->discoveryCache[$oldestKey]);
                unset($this->cacheTimestamps[$oldestKey]);
                if (($idx = array_search($oldestKey, $this->cacheOrder)) !== false) {
                    unset($this->cacheOrder[$idx]);
                }
            }
        }

        if (isset($this->discoveryCache[$key])) {
            if (($idx = array_search($key, $this->cacheOrder)) !== false) {
                unset($this->cacheOrder[$idx]);
            }
        }
        $this->cacheOrder[] = $key;
        $this->discoveryCache[$key] = $data;
        $this->cacheTimestamps[$key] = time();
    }

    /**
     * Clear discovery cache
     */
    public function clearCache(): void
    {
        $this->discoveryCache = [];
        $this->cacheTimestamps = [];
        $this->cacheOrder = [];
    }

    /**
     * Register a service with the registry
     *
     * @param string $serviceName Name of the service
     * @param string $address Service address (e.g., http://localhost:3000)
     * @param string|null $nodeName Unique node identifier
     * @param array|null $metadata Additional service metadata
     * @return array Registration response
     */
    public function registerService(
        string $serviceName,
        string $address,
        ?string $nodeName = null,
        ?array $metadata = null
    ): array {
        if (!$nodeName) {
            $nodeName = $serviceName . '-' . substr(md5(uniqid()), 0, 8);
        }

        $payload = [
            "serviceName" => $serviceName,
            "address" => $address,
            "nodeName" => $nodeName,
            "metadata" => $metadata ?? []
        ];

        return $this->makeRequest('POST', 'register', ['json' => $payload]);
    }

    /**
     * Deregister a service from the registry
     *
     * @param string $serviceName Name of the service
     * @param string $nodeName Node identifier
     * @return array Deregistration response
     */
    public function deregisterService(string $serviceName, string $nodeName): array
    {
        $payload = [
            "serviceName" => $serviceName,
            "nodeName" => $nodeName
        ];

        return $this->makeRequest('DELETE', 'deregister', ['json' => $payload]);
    }

    /**
     * Discover a service instance
     *
     * @param string $serviceName Name of the service to discover
     * @param string|null $version Service version
     * @param string $namespace Service namespace
     * @param string $region Service region
     * @param string $zone Service zone
     * @param bool $proxy Whether to proxy the request
     * @return array Service discovery response
     */
    public function discoverService(
        string $serviceName,
        ?string $version = null,
        string $namespace = "default",
        string $region = "default",
        string $zone = "default",
        bool $proxy = false
    ): array {
        $params = [
            "serviceName" => $serviceName,
            "namespace" => $namespace,
            "region" => $region,
            "zone" => $zone,
            "proxy" => $proxy
        ];
        if ($version) {
            $params["version"] = $version;
        }

        $cacheKey = json_encode($params);
        $cached = $this->getCache($cacheKey);
        if ($cached) {
            return $cached;
        }

        if ($proxy) {
            $result = $this->makeRequest('GET', 'discover', ['query' => $params]);
        } else {
            $result = $this->makeRequest('GET', 'discover/info', ['query' => $params]);
        }

        $this->setCache($cacheKey, $result);
        return $result;
    }

    /**
     * Get health status of all nodes for a service
     *
     * @param string $serviceName Name of the service
     * @param string $namespace Service namespace
     * @return array Health status response
     */
    public function getServiceHealth(string $serviceName, string $namespace = "default"): array
    {
        $params = [
            "serviceName" => $serviceName,
            "namespace" => $namespace
        ];

        return $this->makeRequest('GET', 'health', ['query' => $params]);
    }

    /**
     * Get service registry metrics
     *
     * @return array Metrics response
     */
    public function getMetrics(): array
    {
        return $this->makeRequest('GET', 'metrics');
    }

    /**
     * List all registered services
     *
     * @return array Services list response
     */
    public function listServices(): array
    {
        return $this->makeRequest('GET', 'servers');
    }

    /**
     * Register a service using Lightning Mode API for maximum speed
     *
     * @param string $serviceName Name of the service
     * @param string $host Service host
     * @param int $port Service port
     * @param array|null $metadata Additional metadata
     * @param array|null $tags Service tags
     * @param string|null $version Service version
     * @param string|null $environment Environment (dev/staging/prod)
     * @param string $namespace Service namespace
     * @param string $datacenter Service datacenter
     * @return array Registration response
     */
    public function registerServiceLightning(
        string $serviceName,
        string $host,
        int $port,
        ?array $metadata = null,
        ?array $tags = null,
        ?string $version = null,
        ?string $environment = null,
        string $namespace = "default",
        string $datacenter = "default"
    ): array {
        $payload = [
            "serviceName" => $serviceName,
            "host" => $host,
            "port" => $port,
            "metadata" => $metadata ?? [],
            "tags" => $tags ?? [],
            "version" => $version,
            "environment" => $environment,
            "namespace" => $namespace,
            "datacenter" => $datacenter
        ];

        return $this->makeLightningRequest('POST', 'register', ['json' => $payload]);
    }

    /**
     * Discover a service using Lightning Mode API
     *
     * @param string $serviceName Name of the service
     * @param string $strategy Load balancing strategy
     * @param string|null $clientId Client identifier for sticky sessions
     * @param array|null $tags Required tags
     * @param string|null $version Service version
     * @param string|null $environment Environment filter
     * @param string $namespace Service namespace
     * @param string $datacenter Service datacenter
     * @return array Discovery response
     */
    public function discoverServiceLightning(
        string $serviceName,
        string $strategy = 'round-robin',
        ?string $clientId = null,
        ?array $tags = null,
        ?string $version = null,
        ?string $environment = null,
        string $namespace = "default",
        string $datacenter = "default"
    ): array {
        $params = [
            "serviceName" => $serviceName,
            "strategy" => $strategy,
            "namespace" => $namespace,
            "datacenter" => $datacenter
        ];
        if ($clientId) {
            $params["clientId"] = $clientId;
        }
        if ($tags) {
            $params["tags"] = implode(',', $tags);
        }
        if ($version) {
            $params["version"] = $version;
        }
        if ($environment) {
            $params["environment"] = $environment;
        }

        return $this->makeLightningRequest('GET', 'discover', ['query' => $params]);
    }

    /**
     * Send heartbeat using Lightning Mode API
     *
     * @param string $nodeId Node identifier
     * @return array Heartbeat response
     */
    public function heartbeatLightning(string $nodeId): array
    {
        $payload = ["nodeId" => $nodeId];
        return $this->makeLightningRequest('POST', 'heartbeat', ['json' => $payload]);
    }

    /**
     * Deregister a service using Lightning Mode API
     *
     * @param string $serviceName Name of the service
     * @param string $nodeName Node name
     * @param string $namespace Service namespace
     * @param string $datacenter Service datacenter
     * @return array Deregistration response
     */
    public function deregisterServiceLightning(
        string $serviceName,
        string $nodeName,
        string $namespace = "default",
        string $datacenter = "default"
    ): array {
        $payload = [
            "serviceName" => $serviceName,
            "nodeName" => $nodeName,
            "namespace" => $namespace,
            "datacenter" => $datacenter
        ];
        return $this->makeLightningRequest('DELETE', 'deregister', ['json' => $payload]);
    }

    /**
     * List all services using Lightning Mode API
     *
     * @return array Services list
     */
    public function listServicesLightning(): array
    {
        return $this->makeLightningRequest('GET', 'servers');
    }

    /**
     * Get health status using Lightning Mode API
     *
     * @return array Health status
     */
    public function getHealthLightning(): array
    {
        return $this->makeLightningRequest('GET', 'health');
    }

    /**
     * Make HTTP request to Lightning Mode API
     */
    private function makeLightningRequest(string $method, string $endpoint, array $options = []): array
    {
        $url = $this->baseUrl . '/' . ltrim($endpoint, '/');

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

        if (isset($options['json'])) {
            $json = json_encode($options['json']);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Content-Length: ' . strlen($json)
            ]);
        }

        if (isset($options['query'])) {
            $url .= '?' . http_build_query($options['query']);
            curl_setopt($ch, CURLOPT_URL, $url);
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 400) {
            throw new \Exception("HTTP $httpCode: $response");
        }

        return json_decode($response, true) ?: [];
    }
}