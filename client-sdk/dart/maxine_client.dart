import 'dart:convert';
import 'dart:io';

/// Maxine Service Registry Client for Dart/Flutter
class MaxineClient {
  final String baseUrl;
  final String? apiKey;
  final HttpClient _httpClient = HttpClient();

  MaxineClient(this.baseUrl, {this.apiKey});

  /// Discover a service instance (Lightning Mode)
  Future<Map<String, dynamic>?> discoverLightning(
    String serviceName, {
    String loadBalancing = 'round-robin',
    String? version,
    List<String>? tags,
  }) async {
    final uri = Uri.parse('$baseUrl/discover').replace(queryParameters: {
      'serviceName': serviceName,
      'loadBalancing': loadBalancing,
      if (version != null) 'version': version,
      if (tags != null && tags.isNotEmpty) 'tags': tags.join(','),
    });

    final request = await _httpClient.getUrl(uri);
    _addHeaders(request);

    final response = await request.close();
    if (response.statusCode == 200) {
      final data = await response.transform(utf8.decoder).join();
      return json.decode(data);
    }
    return null;
  }

  /// Register a service instance (Lightning Mode)
  Future<String?> registerLightning(
    String serviceName,
    String host,
    int port, {
    Map<String, dynamic>? metadata,
  }) async {
    final uri = Uri.parse('$baseUrl/register');
    final request = await _httpClient.postUrl(uri);
    _addHeaders(request);
    request.headers.contentType = ContentType.json;

    final body = {
      'serviceName': serviceName,
      'host': host,
      'port': port,
      if (metadata != null) 'metadata': metadata,
    };

    request.write(json.encode(body));
    final response = await request.close();

    if (response.statusCode == 200) {
      final data = await response.transform(utf8.decoder).join();
      final result = json.decode(data);
      return result['nodeId'];
    }
    return null;
  }

  /// Send heartbeat for a service instance
  Future<bool> heartbeatLightning(String nodeId) async {
    final uri = Uri.parse('$baseUrl/heartbeat');
    final request = await _httpClient.postUrl(uri);
    _addHeaders(request);
    request.headers.contentType = ContentType.json;

    request.write(json.encode({'nodeId': nodeId}));
    final response = await request.close();

    return response.statusCode == 200;
  }

  /// Deregister a service instance
  Future<bool> deregisterLightning(String nodeId) async {
    final uri = Uri.parse('$baseUrl/deregister');
    final request = await _httpClient.deleteUrl(uri);
    _addHeaders(request);
    request.headers.contentType = ContentType.json;

    request.write(json.encode({'nodeId': nodeId}));
    final response = await request.close();

    return response.statusCode == 200;
  }

  /// Get all services
  Future<Map<String, dynamic>?> serversLightning() async {
    final uri = Uri.parse('$baseUrl/servers');
    final request = await _httpClient.getUrl(uri);
    _addHeaders(request);

    final response = await request.close();
    if (response.statusCode == 200) {
      final data = await response.transform(utf8.decoder).join();
      return json.decode(data);
    }
    return null;
  }

  /// Get health status
  Future<Map<String, dynamic>?> healthLightning() async {
    final uri = Uri.parse('$baseUrl/health');
    final request = await _httpClient.getUrl(uri);
    _addHeaders(request);

    final response = await request.close();
    if (response.statusCode == 200) {
      final data = await response.transform(utf8.decoder).join();
      return json.decode(data);
    }
    return null;
  }

  /// Get metrics
  Future<Map<String, dynamic>?> metricsLightning() async {
    final uri = Uri.parse('$baseUrl/metrics');
    final request = await _httpClient.getUrl(uri);
    _addHeaders(request);

    final response = await request.close();
    if (response.statusCode == 200) {
      final data = await response.transform(utf8.decoder).join();
      return json.decode(data);
    }
    return null;
  }

  /// Get service versions
  Future<Map<String, dynamic>?> versions(String serviceName) async {
    final uri = Uri.parse('$baseUrl/versions').replace(queryParameters: {
      'serviceName': serviceName,
    });
    final request = await _httpClient.getUrl(uri);
    _addHeaders(request);

    final response = await request.close();
    if (response.statusCode == 200) {
      final data = await response.transform(utf8.decoder).join();
      return json.decode(data);
    }
    return null;
  }

  /// Get health scores for service nodes
  Future<Map<String, dynamic>?> healthScores(String serviceName) async {
    final uri = Uri.parse('$baseUrl/health-score').replace(queryParameters: {
      'serviceName': serviceName,
    });
    final request = await _httpClient.getUrl(uri);
    _addHeaders(request);

    final response = await request.close();
    if (response.statusCode == 200) {
      final data = await response.transform(utf8.decoder).join();
      return json.decode(data);
    }
    return null;
  }

  /// Get detected anomalies
  Future<Map<String, dynamic>?> anomalies() async {
    final uri = Uri.parse('$baseUrl/anomalies');
    final request = await _httpClient.getUrl(uri);
    _addHeaders(request);

    final response = await request.close();
    if (response.statusCode == 200) {
      final data = await response.transform(utf8.decoder).join();
      return json.decode(data);
    }
    return null;
  }

  void _addHeaders(HttpClientRequest request) {
    if (apiKey != null) {
      request.headers.add('X-API-Key', apiKey!);
    }
  }

  void close() {
    _httpClient.close();
  }
}