//
//  MaxineClient.swift
//  Maxine Service Registry Swift Client
//
//  A Swift client for interacting with the Maxine service registry and discovery server.
//  Supports iOS, macOS, watchOS, and tvOS with offline caching capabilities.
//

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Maxine Service Registry Client
public class MaxineClient {
    /// Base URL of the Maxine server
    public let baseURL: URL
    /// Request timeout in seconds
    public let timeout: TimeInterval
    /// Maximum cache size
    public let cacheMaxSize: Int
    /// Cache TTL in seconds
    public let cacheTTL: TimeInterval

    private let session: URLSession
    private var discoveryCache: [String: (data: [String: Any], timestamp: Date)] = [:]
    private var cacheOrder: [String] = []
    private let cacheQueue = DispatchQueue(label: "com.maxine.cache")

    /// Initialize the Maxine client
    /// - Parameters:
    ///   - baseURL: Base URL of the Maxine server (default: http://localhost:8080)
    ///   - timeout: Request timeout in seconds (default: 5)
    ///   - cacheMaxSize: Maximum cache size (default: 100)
    ///   - cacheTTL: Cache TTL in seconds (default: 30)
    public init(baseURL: URL = URL(string: "http://localhost:8080")!,
                timeout: TimeInterval = 5,
                cacheMaxSize: Int = 100,
                cacheTTL: TimeInterval = 30) {
        self.baseURL = baseURL
        self.timeout = timeout
        self.cacheMaxSize = cacheMaxSize
        self.cacheTTL = cacheTTL

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout
        self.session = URLSession(configuration: config)
    }

    /// Make HTTP request to Maxine API
    private func makeRequest(method: String, endpoint: String, parameters: [String: Any]? = nil, body: [String: Any]? = nil) async throws -> [String: Any] {
        var url = baseURL.appendingPathComponent(endpoint)
        if let parameters = parameters {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            components.queryItems = parameters.map { URLQueryItem(name: $0.key, value: "\($0.value)") }
            url = components.url!
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let body = body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }

        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    /// Get cached data if valid
    private func getCache(key: String) -> [String: Any]? {
        return cacheQueue.sync {
            if let cached = discoveryCache[key] {
                if Date().timeIntervalSince(cached.timestamp) < cacheTTL {
                    return cached.data
                } else {
                    discoveryCache.removeValue(forKey: key)
                    if let index = cacheOrder.firstIndex(of: key) {
                        cacheOrder.remove(at: index)
                    }
                }
            }
            return nil
        }
    }

    /// Set cache data
    private func setCache(key: String, data: [String: Any]) {
        cacheQueue.sync {
            if discoveryCache.count >= cacheMaxSize {
                // Simple LRU: remove oldest
                if let oldestKey = cacheOrder.first {
                    discoveryCache.removeValue(forKey: oldestKey)
                    cacheOrder.removeFirst()
                }
            }
            if discoveryCache[key] != nil {
                if let index = cacheOrder.firstIndex(of: key) {
                    cacheOrder.remove(at: index)
                }
            }
            cacheOrder.append(key)
            discoveryCache[key] = (data: data, timestamp: Date())
        }
    }

    /// Clear discovery cache
    public func clearCache() {
        cacheQueue.sync {
            discoveryCache.removeAll()
            cacheOrder.removeAll()
        }
    }

    /// Register a service with the registry
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - host: Service host
    ///   - port: Service port
    ///   - metadata: Additional service metadata
    ///   - tags: Service tags
    ///   - version: Service version
    ///   - environment: Environment (dev/staging/prod)
    ///   - namespace: Service namespace
    ///   - datacenter: Service datacenter
    /// - Returns: Registration response
    public func registerService(serviceName: String,
                               host: String,
                               port: Int,
                               metadata: [String: Any]? = nil,
                               tags: [String]? = nil,
                               version: String? = nil,
                               environment: String? = nil,
                               namespace: String = "default",
                               datacenter: String = "default") async throws -> [String: Any] {
        let payload: [String: Any] = [
            "serviceName": serviceName,
            "host": host,
            "port": port,
            "metadata": metadata ?? [:],
            "tags": tags ?? [],
            "version": version as Any,
            "environment": environment as Any,
            "namespace": namespace,
            "datacenter": datacenter
        ]

        return try await makeRequest(method: "POST", endpoint: "register", body: payload)
    }

    /// Discover a service instance
    /// - Parameters:
    ///   - serviceName: Name of the service to discover
    ///   - strategy: Load balancing strategy (default: round-robin)
    ///   - clientId: Client identifier for sticky sessions
    ///   - tags: Required tags
    ///   - version: Service version
    ///   - environment: Environment filter
    ///   - namespace: Service namespace
    ///   - datacenter: Service datacenter
    /// - Returns: Service discovery response
    public func discoverService(serviceName: String,
                               strategy: String = "round-robin",
                               clientId: String? = nil,
                               tags: [String]? = nil,
                               version: String? = nil,
                               environment: String? = nil,
                               namespace: String = "default",
                               datacenter: String = "default") async throws -> [String: Any] {
        var parameters: [String: Any] = [
            "serviceName": serviceName,
            "loadBalancing": strategy,
            "namespace": namespace,
            "datacenter": datacenter
        ]

        if let clientId = clientId { parameters["clientId"] = clientId }
        if let tags = tags { parameters["tags"] = tags.joined(separator: ",") }
        if let version = version { parameters["version"] = version }
        if let environment = environment { parameters["environment"] = environment }

        let cacheKey = parameters.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "&")
        if let cached = getCache(key: cacheKey) {
            return cached
        }

        let result = try await makeRequest(method: "GET", endpoint: "discover", parameters: parameters)
        setCache(key: cacheKey, data: result)
        return result
    }

    /// Send heartbeat for a service instance
    /// - Parameter nodeId: Node identifier
    /// - Returns: Heartbeat response
    public func heartbeat(nodeId: String) async throws -> [String: Any] {
        let payload = ["nodeId": nodeId]
        return try await makeRequest(method: "POST", endpoint: "heartbeat", body: payload)
    }

    /// Deregister a service from the registry
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - nodeName: Node name
    ///   - namespace: Service namespace
    ///   - datacenter: Service datacenter
    /// - Returns: Deregistration response
    public func deregisterService(serviceName: String,
                                 nodeName: String,
                                 namespace: String = "default",
                                 datacenter: String = "default") async throws -> [String: Any] {
        let payload: [String: Any] = [
            "serviceName": serviceName,
            "nodeName": nodeName,
            "namespace": namespace,
            "datacenter": datacenter
        ]
        return try await makeRequest(method: "DELETE", endpoint: "deregister", body: payload)
    }

    /// List all registered services
    /// - Returns: Services list response
    public func listServices() async throws -> [String: Any] {
        return try await makeRequest(method: "GET", endpoint: "servers")
    }

    /// Get health status
    /// - Returns: Health status response
    public func getHealth() async throws -> [String: Any] {
        return try await makeRequest(method: "GET", endpoint: "health")
    }

    /// Get service registry metrics
    /// - Returns: Metrics response
    public func getMetrics() async throws -> [String: Any] {
        return try await makeRequest(method: "GET", endpoint: "metrics")
    }

    /// Get service versions
    /// - Parameter serviceName: Name of the service
    /// - Returns: Versions response
    public func getVersions(serviceName: String) async throws -> [String: Any] {
        let parameters = ["serviceName": serviceName]
        return try await makeRequest(method: "GET", endpoint: "versions", parameters: parameters)
    }

    /// Record response time for predictive load balancing
    /// - Parameters:
    ///   - nodeId: Node identifier
    ///   - responseTime: Response time in milliseconds
    /// - Returns: Response
    public func recordResponseTime(nodeId: String, responseTime: Double) async throws -> [String: Any] {
        let payload: [String: Any] = [
            "nodeId": nodeId,
            "responseTime": responseTime
        ]
        return try await makeRequest(method: "POST", endpoint: "record-response-time", body: payload)
    }

    /// Record service call for dependency auto-detection
    /// - Parameters:
    ///   - callerService: Calling service name
    ///   - calledService: Called service name
    /// - Returns: Response
    public func recordCall(callerService: String, calledService: String) async throws -> [String: Any] {
        let payload: [String: Any] = [
            "callerService": callerService,
            "calledService": calledService
        ]
        return try await makeRequest(method: "POST", endpoint: "record-call", body: payload)
    }

    /// Get health scores for service nodes
    /// - Parameter serviceName: Name of the service
    /// - Returns: Health scores response
    public func getHealthScores(serviceName: String) async throws -> [String: Any] {
        let parameters = ["serviceName": serviceName]
        return try await makeRequest(method: "GET", endpoint: "health-score", parameters: parameters)
    }

    /// Predict service health
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - window: Prediction window in milliseconds (default: 300000)
    /// - Returns: Health prediction response
    public func predictHealth(serviceName: String, window: Double = 300000) async throws -> [String: Any] {
        let parameters: [String: Any] = [
            "serviceName": serviceName,
            "window": window
        ]
        return try await makeRequest(method: "GET", endpoint: "predict-health", parameters: parameters)
    }

    /// Get anomalies
    /// - Returns: Anomalies response
    public func getAnomalies() async throws -> [String: Any] {
        return try await makeRequest(method: "GET", endpoint: "anomalies")
    }

    /// Set traffic distribution for canary deployments
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - distribution: Traffic distribution map (version -> percentage)
    /// - Returns: Response
    public func setTrafficDistribution(serviceName: String, distribution: [String: Double]) async throws -> [String: Any] {
        let payload: [String: Any] = [
            "serviceName": serviceName,
            "distribution": distribution
        ]
        return try await makeRequest(method: "POST", endpoint: "traffic/set", body: payload)
    }

    /// Promote a service version
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - version: Version to promote
    /// - Returns: Response
    public func promoteVersion(serviceName: String, version: String) async throws -> [String: Any] {
        let payload: [String: Any] = [
            "serviceName": serviceName,
            "version": version
        ]
        return try await makeRequest(method: "POST", endpoint: "version/promote", body: payload)
    }

    /// Retire a service version
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - version: Version to retire
    /// - Returns: Response
    public func retireVersion(serviceName: String, version: String) async throws -> [String: Any] {
        let payload: [String: Any] = [
            "serviceName": serviceName,
            "version": version
        ]
        return try await makeRequest(method: "POST", endpoint: "version/retire", body: payload)
    }

    /// Shift traffic gradually between versions
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - fromVersion: Source version
    ///   - toVersion: Target version
    ///   - percentage: Percentage to shift
    /// - Returns: Response
    public func shiftTraffic(serviceName: String, fromVersion: String, toVersion: String, percentage: Double) async throws -> [String: Any] {
        let payload: [String: Any] = [
            "serviceName": serviceName,
            "fromVersion": fromVersion,
            "toVersion": toVersion,
            "percentage": percentage
        ]
        return try await makeRequest(method: "POST", endpoint: "traffic/shift", body: payload)
    }

    /// Set service configuration
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - key: Configuration key
    ///   - value: Configuration value
    ///   - namespace: Service namespace
    ///   - region: Service region
    ///   - zone: Service zone
    /// - Returns: Response
    public func setConfig(serviceName: String, key: String, value: Any, namespace: String = "default", region: String = "us-east", zone: String = "zone1") async throws -> [String: Any] {
        let payload: [String: Any] = [
            "serviceName": serviceName,
            "key": key,
            "value": value,
            "namespace": namespace,
            "region": region,
            "zone": zone
        ]
        return try await makeRequest(method: "POST", endpoint: "config/set", body: payload)
    }

    /// Get service configuration
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - key: Configuration key
    ///   - namespace: Service namespace
    ///   - region: Service region
    ///   - zone: Service zone
    /// - Returns: Configuration value
    public func getConfig(serviceName: String, key: String, namespace: String = "default", region: String = "us-east", zone: String = "zone1") async throws -> Any {
        let parameters: [String: Any] = [
            "serviceName": serviceName,
            "key": key,
            "namespace": namespace,
            "region": region,
            "zone": zone
        ]
        let response = try await makeRequest(method: "GET", endpoint: "config/get", parameters: parameters)
        return response["value"] as Any
    }

    /// Get all service configurations
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - namespace: Service namespace
    ///   - region: Service region
    ///   - zone: Service zone
    /// - Returns: All configurations
    public func getAllConfigs(serviceName: String, namespace: String = "default", region: String = "us-east", zone: String = "zone1") async throws -> [String: Any] {
        let parameters: [String: Any] = [
            "serviceName": serviceName,
            "namespace": namespace,
            "region": region,
            "zone": zone
        ]
        return try await makeRequest(method: "GET", endpoint: "config/all", parameters: parameters)
    }

    /// Delete service configuration
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - key: Configuration key
    ///   - namespace: Service namespace
    ///   - region: Service region
    ///   - zone: Service zone
    /// - Returns: Response
    public func deleteConfig(serviceName: String, key: String, namespace: String = "default", region: String = "us-east", zone: String = "zone1") async throws -> [String: Any] {
        let payload: [String: Any] = [
            "serviceName": serviceName,
            "key": key,
            "namespace": namespace,
            "region": region,
            "zone": zone
        ]
        return try await makeRequest(method: "DELETE", endpoint: "config/delete", body: payload)
    }

    /// Add service dependency
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - dependsOn: Service it depends on
    /// - Returns: Response
    public func addDependency(serviceName: String, dependsOn: String) async throws -> [String: Any] {
        let payload: [String: Any] = [
            "serviceName": serviceName,
            "dependsOn": dependsOn
        ]
        return try await makeRequest(method: "POST", endpoint: "dependency/add", body: payload)
    }

    /// Remove service dependency
    /// - Parameters:
    ///   - serviceName: Name of the service
    ///   - dependsOn: Service it depends on
    /// - Returns: Response
    public func removeDependency(serviceName: String, dependsOn: String) async throws -> [String: Any] {
        let payload: [String: Any] = [
            "serviceName": serviceName,
            "dependsOn": dependsOn
        ]
        return try await makeRequest(method: "POST", endpoint: "dependency/remove", body: payload)
    }

    /// Get service dependencies
    /// - Parameter serviceName: Name of the service
    /// - Returns: Dependencies response
    public func getDependencies(serviceName: String) async throws -> [String: Any] {
        let parameters = ["serviceName": serviceName]
        return try await makeRequest(method: "GET", endpoint: "dependency/get", parameters: parameters)
    }

    /// Get service dependents
    /// - Parameter serviceName: Name of the service
    /// - Returns: Dependents response
    public func getDependents(serviceName: String) async throws -> [String: Any] {
        let parameters = ["serviceName": serviceName]
        return try await makeRequest(method: "GET", endpoint: "dependency/dependents", parameters: parameters)
    }

    /// Get dependency graph
    /// - Returns: Dependency graph response
    public func getDependencyGraph() async throws -> [String: Any] {
        return try await makeRequest(method: "GET", endpoint: "dependency/graph")
    }

    /// Detect circular dependencies
    /// - Returns: Cycles response
    public func detectCycles() async throws -> [String: Any] {
        return try await makeRequest(method: "GET", endpoint: "dependency/cycles")
    }
}

/// WebSocket client for real-time Maxine service registry events
public class WebSocketClient: NSObject, URLSessionWebSocketDelegate {
    /// WebSocket URL
    public let baseURL: URL
    /// JWT token for authentication
    public var token: String?

    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession!
    private var isConnected = false
    private var eventHandlers: [String: [(String, [String: Any]) -> Void]] = [:]
    private var pingTimer: Timer?

    /// Initialize WebSocket client
    /// - Parameters:
    ///   - baseURL: WebSocket URL (ws:// or wss://)
    ///   - token: JWT token for authentication
    public init(baseURL: URL = URL(string: "ws://localhost:8080")!, token: String? = nil) {
        self.baseURL = baseURL
        self.token = token
        super.init()
        self.session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    }

    /// Connect to WebSocket
    public func connect() {
        webSocketTask = session.webSocketTask(with: baseURL)
        webSocketTask?.resume()
        receiveMessage()
        startPingTimer()
    }

    /// Disconnect from WebSocket
    public func disconnect() {
        pingTimer?.invalidate()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        isConnected = false
    }

    /// Register event handler
    /// - Parameters:
    ///   - eventType: Event type (e.g., 'service_registered')
    ///   - handler: Handler function that takes event type and data
    public func onEvent(eventType: String, handler: @escaping (String, [String: Any]) -> Void) {
        if eventHandlers[eventType] == nil {
            eventHandlers[eventType] = []
        }
        eventHandlers[eventType]?.append(handler)
    }

    /// Subscribe to specific events
    /// - Parameters:
    ///   - eventType: Event type to subscribe to
    ///   - serviceName: Filter by service name
    ///   - nodeId: Filter by node ID
    public func subscribe(eventType: String, serviceName: String? = nil, nodeId: String? = nil) {
        guard isConnected else { return }
        var subscription: [String: Any] = ["subscribe": ["event": eventType]]
        if let serviceName = serviceName {
            subscription["subscribe"] = (subscription["subscribe"] as? [String: Any] ?? [:]).merging(["serviceName": serviceName]) { $1 }
        }
        if let nodeId = nodeId {
            subscription["subscribe"] = (subscription["subscribe"] as? [String: Any] ?? [:]).merging(["nodeId": nodeId]) { $1 }
        }
        sendMessage(subscription)
    }

    /// Unsubscribe from events
    public func unsubscribe() {
        guard isConnected else { return }
        sendMessage(["unsubscribe": true])
    }

    /// Refresh JWT token
    public func refreshToken() {
        guard isConnected, token != nil else { return }
        sendMessage(["refresh_token": true])
    }

    private func sendMessage(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let string = String(data: data, encoding: .utf8) else { return }
        webSocketTask?.send(.string(string)) { error in
            if let error = error {
                print("WebSocket send error: \(error)")
            }
        }
    }

    private func receiveMessage() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    if let data = text.data(using: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        self.handleMessage(json)
                    }
                case .data(let data):
                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        self.handleMessage(json)
                    }
                @unknown default:
                    break
                }
                self.receiveMessage()
            case .failure(let error):
                print("WebSocket receive error: \(error)")
            }
        }
    }

    private func handleMessage(_ message: [String: Any]) {
        if let event = message["event"] as? String,
           let handlers = eventHandlers[event] {
            for handler in handlers {
                handler(event, message)
            }
        } else if let type = message["type"] as? String {
            if type == "authenticated" {
                isConnected = true
            }
        }
    }

    private func startPingTimer() {
        pingTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.webSocketTask?.sendPing { error in
                if let error = error {
                    print("WebSocket ping error: \(error)")
                }
            }
        }
    }

    // MARK: - URLSessionWebSocketDelegate

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        isConnected = true
        if let token = token {
            sendMessage(["auth": token])
        }
    }

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        isConnected = false
        pingTimer?.invalidate()
    }
}</content>
</xai:function_call">Now, create the README for Swift SDK. 

<xai:function_call name="write">
<parameter name="filePath">client-sdk/swift/README.md