package com.maxine.client

import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import okio.IOException
import java.util.concurrent.TimeUnit
import kotlin.collections.LinkedHashMap

/**
 * Maxine Service Registry Kotlin Client
 *
 * A Kotlin client for interacting with the Maxine service registry and discovery server.
 * Supports Android with background sync and battery optimization.
 */
class MaxineClient(
    private val baseUrl: String = "http://localhost:8080",
    private val timeoutSeconds: Long = 5,
    private val cacheMaxSize: Int = 100,
    private val cacheTtlSeconds: Long = 30
) {
    private val client: OkHttpClient
    private val discoveryCache = LinkedHashMap<String, CacheEntry>()
    private val cacheMutex = Mutex()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    init {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        client = OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .readTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .writeTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .build()
    }

    private data class CacheEntry(
        val data: Map<String, Any>,
        val timestamp: Long
    )

    private suspend fun makeRequest(
        method: String,
        endpoint: String,
        params: Map<String, Any>? = null,
        body: Map<String, Any>? = null
    ): Map<String, Any> {
        val urlBuilder = StringBuilder("$baseUrl/$endpoint")

        params?.let { p ->
            val queryParams = p.entries.joinToString("&") { "${it.key}=${it.value}" }
            if (queryParams.isNotEmpty()) {
                urlBuilder.append("?").append(queryParams)
            }
        }

        val requestBody = body?.let {
            com.google.gson.Gson().toJson(it).toRequestBody(jsonMediaType)
        }

        val request = Request.Builder()
            .url(urlBuilder.toString())
            .method(method, requestBody)
            .build()

        return withContext(Dispatchers.IO) {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IOException("HTTP ${response.code}: ${response.message}")
                }

                val responseBody = response.body?.string()
                    ?: throw IOException("Empty response body")

                com.google.gson.Gson().fromJson(responseBody, Map::class.java) as Map<String, Any>
            }
        }
    }

    private suspend fun getCache(key: String): Map<String, Any>? {
        return cacheMutex.withLock {
            val entry = discoveryCache[key]
            if (entry != null) {
                val now = System.currentTimeMillis()
                if (now - entry.timestamp < cacheTtlSeconds * 1000) {
                    return entry.data
                } else {
                    discoveryCache.remove(key)
                }
            }
            null
        }
    }

    private suspend fun setCache(key: String, data: Map<String, Any>) {
        cacheMutex.withLock {
            if (discoveryCache.size >= cacheMaxSize) {
                // Remove oldest entry (LRU)
                discoveryCache.remove(discoveryCache.keys.first())
            }
            discoveryCache[key] = CacheEntry(data, System.currentTimeMillis())
        }
    }

    /**
     * Clear discovery cache
     */
    suspend fun clearCache() {
        cacheMutex.withLock {
            discoveryCache.clear()
        }
    }

    /**
     * Register a service with the registry
     *
     * @param serviceName Name of the service
     * @param host Service host
     * @param port Service port
     * @param metadata Additional service metadata
     * @param tags Service tags
     * @param version Service version
     * @param environment Environment (dev/staging/prod)
     * @param namespace Service namespace
     * @param datacenter Service datacenter
     * @return Registration response
     */
    suspend fun registerService(
        serviceName: String,
        host: String,
        port: Int,
        metadata: Map<String, Any>? = null,
        tags: List<String>? = null,
        version: String? = null,
        environment: String? = null,
        namespace: String = "default",
        datacenter: String = "default"
    ): Map<String, Any> {
        val payload = mutableMapOf<String, Any>(
            "serviceName" to serviceName,
            "host" to host,
            "port" to port,
            "metadata" to (metadata ?: emptyMap<String, Any>()),
            "tags" to (tags ?: emptyList<String>()),
            "namespace" to namespace,
            "datacenter" to datacenter
        )

        version?.let { payload["version"] = it }
        environment?.let { payload["environment"] = it }

        return makeRequest("POST", "register", body = payload)
    }

    /**
     * Discover a service instance
     *
     * @param serviceName Name of the service to discover
     * @param strategy Load balancing strategy (default: round-robin)
     * @param clientId Client identifier for sticky sessions
     * @param tags Required tags
     * @param version Service version
     * @param environment Environment filter
     * @param namespace Service namespace
     * @param datacenter Service datacenter
     * @return Service discovery response
     */
    suspend fun discoverService(
        serviceName: String,
        strategy: String = "round-robin",
        clientId: String? = null,
        tags: List<String>? = null,
        version: String? = null,
        environment: String? = null,
        namespace: String = "default",
        datacenter: String = "default"
    ): Map<String, Any> {
        val params = mutableMapOf<String, Any>(
            "serviceName" to serviceName,
            "loadBalancing" to strategy,
            "namespace" to namespace,
            "datacenter" to datacenter
        )

        clientId?.let { params["clientId"] = it }
        tags?.let { params["tags"] = it.joinToString(",") }
        version?.let { params["version"] = it }
        environment?.let { params["environment"] = it }

        val cacheKey = params.entries.sortedBy { it.key }.joinToString("&") { "${it.key}=${it.value}" }
        getCache(cacheKey)?.let { return it }

        val result = makeRequest("GET", "discover", params = params)
        setCache(cacheKey, result)
        return result
    }

    /**
     * Send heartbeat for a service instance
     *
     * @param nodeId Node identifier
     * @return Heartbeat response
     */
    suspend fun heartbeat(nodeId: String): Map<String, Any> {
        val payload = mapOf("nodeId" to nodeId)
        return makeRequest("POST", "heartbeat", body = payload)
    }

    /**
     * Deregister a service from the registry
     *
     * @param serviceName Name of the service
     * @param nodeName Node name
     * @param namespace Service namespace
     * @param datacenter Service datacenter
     * @return Deregistration response
     */
    suspend fun deregisterService(
        serviceName: String,
        nodeName: String,
        namespace: String = "default",
        datacenter: String = "default"
    ): Map<String, Any> {
        val payload = mapOf(
            "serviceName" to serviceName,
            "nodeName" to nodeName,
            "namespace" to namespace,
            "datacenter" to datacenter
        )
        return makeRequest("DELETE", "deregister", body = payload)
    }

    /**
     * List all registered services
     *
     * @return Services list response
     */
    suspend fun listServices(): Map<String, Any> {
        return makeRequest("GET", "servers")
    }

    /**
     * Get health status
     *
     * @return Health status response
     */
    suspend fun getHealth(): Map<String, Any> {
        return makeRequest("GET", "health")
    }

    /**
     * Get service registry metrics
     *
     * @return Metrics response
     */
    suspend fun getMetrics(): Map<String, Any> {
        return makeRequest("GET", "metrics")
    }

    /**
     * Get service versions
     *
     * @param serviceName Name of the service
     * @return Versions response
     */
    suspend fun getVersions(serviceName: String): Map<String, Any> {
        val params = mapOf("serviceName" to serviceName)
        return makeRequest("GET", "versions", params = params)
    }

    /**
     * Record response time for predictive load balancing
     *
     * @param nodeId Node identifier
     * @param responseTime Response time in milliseconds
     * @return Response
     */
    suspend fun recordResponseTime(nodeId: String, responseTime: Double): Map<String, Any> {
        val payload = mapOf(
            "nodeId" to nodeId,
            "responseTime" to responseTime
        )
        return makeRequest("POST", "record-response-time", body = payload)
    }

    /**
     * Record service call for dependency auto-detection
     *
     * @param callerService Calling service name
     * @param calledService Called service name
     * @return Response
     */
    suspend fun recordCall(callerService: String, calledService: String): Map<String, Any> {
        val payload = mapOf(
            "callerService" to callerService,
            "calledService" to calledService
        )
        return makeRequest("POST", "record-call", body = payload)
    }

    /**
     * Get health scores for service nodes
     *
     * @param serviceName Name of the service
     * @return Health scores response
     */
    suspend fun getHealthScores(serviceName: String): Map<String, Any> {
        val params = mapOf("serviceName" to serviceName)
        return makeRequest("GET", "health-score", params = params)
    }

    /**
     * Predict service health
     *
     * @param serviceName Name of the service
     * @param window Prediction window in milliseconds (default: 300000)
     * @return Health prediction response
     */
    suspend fun predictHealth(serviceName: String, window: Double = 300000.0): Map<String, Any> {
        val params = mapOf(
            "serviceName" to serviceName,
            "window" to window
        )
        return makeRequest("GET", "predict-health", params = params)
    }

    /**
     * Get anomalies
     *
     * @return Anomalies response
     */
    suspend fun getAnomalies(): Map<String, Any> {
        return makeRequest("GET", "anomalies")
    }

    /**
     * Set traffic distribution for canary deployments
     *
     * @param serviceName Name of the service
     * @param distribution Traffic distribution map (version -> percentage)
     * @return Response
     */
    suspend fun setTrafficDistribution(serviceName: String, distribution: Map<String, Double>): Map<String, Any> {
        val payload = mapOf(
            "serviceName" to serviceName,
            "distribution" to distribution
        )
        return makeRequest("POST", "traffic/set", body = payload)
    }

    /**
     * Promote a service version
     *
     * @param serviceName Name of the service
     * @param version Version to promote
     * @return Response
     */
    suspend fun promoteVersion(serviceName: String, version: String): Map<String, Any> {
        val payload = mapOf(
            "serviceName" to serviceName,
            "version" to version
        )
        return makeRequest("POST", "version/promote", body = payload)
    }

    /**
     * Retire a service version
     *
     * @param serviceName Name of the service
     * @param version Version to retire
     * @return Response
     */
    suspend fun retireVersion(serviceName: String, version: String): Map<String, Any> {
        val payload = mapOf(
            "serviceName" to serviceName,
            "version" to version
        )
        return makeRequest("POST", "version/retire", body = payload)
    }

    /**
     * Shift traffic gradually between versions
     *
     * @param serviceName Name of the service
     * @param fromVersion Source version
     * @param toVersion Target version
     * @param percentage Percentage to shift
     * @return Response
     */
    suspend fun shiftTraffic(serviceName: String, fromVersion: String, toVersion: String, percentage: Double): Map<String, Any> {
        val payload = mapOf(
            "serviceName" to serviceName,
            "fromVersion" to fromVersion,
            "toVersion" to toVersion,
            "percentage" to percentage
        )
        return makeRequest("POST", "traffic/shift", body = payload)
    }

    /**
     * Set service configuration
     *
     * @param serviceName Name of the service
     * @param key Configuration key
     * @param value Configuration value
     * @param namespace Service namespace
     * @param region Service region
     * @param zone Service zone
     * @return Response
     */
    suspend fun setConfig(
        serviceName: String,
        key: String,
        value: Any,
        namespace: String = "default",
        region: String = "us-east",
        zone: String = "zone1"
    ): Map<String, Any> {
        val payload = mapOf(
            "serviceName" to serviceName,
            "key" to key,
            "value" to value,
            "namespace" to namespace,
            "region" to region,
            "zone" to zone
        )
        return makeRequest("POST", "config/set", body = payload)
    }

    /**
     * Get service configuration
     *
     * @param serviceName Name of the service
     * @param key Configuration key
     * @param namespace Service namespace
     * @param region Service region
     * @param zone Service zone
     * @return Configuration value
     */
    suspend fun getConfig(
        serviceName: String,
        key: String,
        namespace: String = "default",
        region: String = "us-east",
        zone: String = "zone1"
    ): Any {
        val params = mapOf(
            "serviceName" to serviceName,
            "key" to key,
            "namespace" to namespace,
            "region" to region,
            "zone" to zone
        )
        val response = makeRequest("GET", "config/get", params = params)
        return response["value"] ?: throw IOException("Config not found")
    }

    /**
     * Get all service configurations
     *
     * @param serviceName Name of the service
     * @param namespace Service namespace
     * @param region Service region
     * @param zone Service zone
     * @return All configurations
     */
    suspend fun getAllConfigs(
        serviceName: String,
        namespace: String = "default",
        region: String = "us-east",
        zone: String = "zone1"
    ): Map<String, Any> {
        val params = mapOf(
            "serviceName" to serviceName,
            "namespace" to namespace,
            "region" to region,
            "zone" to zone
        )
        return makeRequest("GET", "config/all", params = params)
    }

    /**
     * Delete service configuration
     *
     * @param serviceName Name of the service
     * @param key Configuration key
     * @param namespace Service namespace
     * @param region Service region
     * @param zone Service zone
     * @return Response
     */
    suspend fun deleteConfig(
        serviceName: String,
        key: String,
        namespace: String = "default",
        region: String = "us-east",
        zone: String = "zone1"
    ): Map<String, Any> {
        val payload = mapOf(
            "serviceName" to serviceName,
            "key" to key,
            "namespace" to namespace,
            "region" to region,
            "zone" to zone
        )
        return makeRequest("DELETE", "config/delete", body = payload)
    }

    /**
     * Add service dependency
     *
     * @param serviceName Name of the service
     * @param dependsOn Service it depends on
     * @return Response
     */
    suspend fun addDependency(serviceName: String, dependsOn: String): Map<String, Any> {
        val payload = mapOf(
            "serviceName" to serviceName,
            "dependsOn" to dependsOn
        )
        return makeRequest("POST", "dependency/add", body = payload)
    }

    /**
     * Remove service dependency
     *
     * @param serviceName Name of the service
     * @param dependsOn Service it depends on
     * @return Response
     */
    suspend fun removeDependency(serviceName: String, dependsOn: String): Map<String, Any> {
        val payload = mapOf(
            "serviceName" to serviceName,
            "dependsOn" to dependsOn
        )
        return makeRequest("POST", "dependency/remove", body = payload)
    }

    /**
     * Get service dependencies
     *
     * @param serviceName Name of the service
     * @return Dependencies response
     */
    suspend fun getDependencies(serviceName: String): Map<String, Any> {
        val params = mapOf("serviceName" to serviceName)
        return makeRequest("GET", "dependency/get", params = params)
    }

    /**
     * Get service dependents
     *
     * @param serviceName Name of the service
     * @return Dependents response
     */
    suspend fun getDependents(serviceName: String): Map<String, Any> {
        val params = mapOf("serviceName" to serviceName)
        return makeRequest("GET", "dependency/dependents", params = params)
    }

    /**
     * Get dependency graph
     *
     * @return Dependency graph response
     */
    suspend fun getDependencyGraph(): Map<String, Any> {
        return makeRequest("GET", "dependency/graph")
    }

    /**
     * Detect circular dependencies
     *
     * @return Cycles response
     */
    suspend fun detectCycles(): Map<String, Any> {
        return makeRequest("GET", "dependency/cycles")
    }
}</content>
</xai:function_call">Now, create the README for Kotlin SDK. 

<xai:function_call name="write">
<parameter name="filePath">client-sdk/kotlin/README.md