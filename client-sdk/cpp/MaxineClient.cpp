#include "MaxineClient.hpp"
#include <iostream>
#include <sstream>

namespace maxine {

MaxineClient::MaxineClient(const std::string& base_url)
    : base_url_(base_url), client_(base_url.c_str()) {}

MaxineClient& MaxineClient::withApiKey(const std::string& api_key) {
    api_key_ = api_key;
    return *this;
}

httplib::Headers MaxineClient::buildHeaders() const {
    httplib::Headers headers;
    if (!api_key_.empty()) {
        headers.insert({"X-API-Key", api_key_});
    }
    return headers;
}

std::shared_ptr<ServiceNode> MaxineClient::discoverLightning(
    const std::string& service_name,
    const std::string& load_balancing,
    const std::string& version,
    const std::vector<std::string>& tags
) {
    std::string url = "/discover?serviceName=" + service_name;
    if (!load_balancing.empty()) {
        url += "&loadBalancing=" + load_balancing;
    }
    if (!version.empty()) {
        url += "&version=" + version;
    }
    if (!tags.empty()) {
        url += "&tags=";
        for (size_t i = 0; i < tags.size(); ++i) {
            if (i > 0) url += ",";
            url += tags[i];
        }
    }

    auto res = client_.Get(url.c_str(), buildHeaders());
    if (res && res->status == 200) {
        try {
            auto json = nlohmann::json::parse(res->body);
            auto node = std::make_shared<ServiceNode>();
            node->address = json.value("address", "");
            node->node_name = json.value("nodeName", "");
            node->healthy = json.value("healthy", false);
            if (json.contains("weight")) node->weight = std::make_shared<int>(json["weight"]);
            if (json.contains("connections")) node->connections = std::make_shared<int>(json["connections"]);
            if (json.contains("metadata")) node->metadata = std::make_shared<nlohmann::json>(json["metadata"]);
            return node;
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return nullptr;
}

std::string MaxineClient::registerLightning(
    const std::string& service_name,
    const std::string& host,
    int port,
    const nlohmann::json& metadata
) {
    nlohmann::json payload = {
        {"serviceName", service_name},
        {"host", host},
        {"port", port}
    };
    if (!metadata.is_null()) {
        payload["metadata"] = metadata;
    }

    auto res = client_.Post("/register", buildHeaders(), payload.dump(), "application/json");
    if (res && res->status == 200) {
        try {
            auto json = nlohmann::json::parse(res->body);
            return json.value("nodeId", "");
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return "";
}

bool MaxineClient::heartbeatLightning(const std::string& node_id) {
    nlohmann::json payload = {{"nodeId", node_id}};

    auto res = client_.Post("/heartbeat", buildHeaders(), payload.dump(), "application/json");
    if (res && res->status == 200) {
        try {
            auto json = nlohmann::json::parse(res->body);
            return json.value("success", false);
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return false;
}

bool MaxineClient::deregisterLightning(const std::string& node_id) {
    nlohmann::json payload = {{"nodeId", node_id}};

    auto res = client_.Delete("/deregister", buildHeaders(), payload.dump(), "application/json");
    return res && res->status == 200;
}

std::vector<std::string> MaxineClient::serversLightning() {
    std::vector<std::string> services;
    auto res = client_.Get("/servers", buildHeaders());
    if (res && res->status == 200) {
        try {
            auto json = nlohmann::json::parse(res->body);
            if (json.contains("services") && json["services"].is_array()) {
                for (const auto& service : json["services"]) {
                    services.push_back(service);
                }
            }
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return services;
}

nlohmann::json MaxineClient::healthLightning() {
    auto res = client_.Get("/health", buildHeaders());
    if (res && res->status == 200) {
        try {
            return nlohmann::json::parse(res->body);
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return nlohmann::json();
}

nlohmann::json MaxineClient::metricsLightning() {
    auto res = client_.Get("/metrics", buildHeaders());
    if (res && res->status == 200) {
        try {
            return nlohmann::json::parse(res->body);
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return nlohmann::json();
}

std::vector<Service> MaxineClient::services() {
    std::vector<Service> services_list;
    auto res = client_.Get("/api/maxine/serviceops/services", buildHeaders());
    if (res && res->status == 200) {
        try {
            auto json = nlohmann::json::parse(res->body);
            // Parse services array
            for (const auto& service_json : json) {
                Service service;
                service.service_name = service_json.value("serviceName", "");
                if (service_json.contains("nodes")) {
                    for (const auto& node_json : service_json["nodes"]) {
                        ServiceNode node;
                        node.address = node_json.value("address", "");
                        node.node_name = node_json.value("nodeName", "");
                        node.healthy = node_json.value("healthy", false);
                        if (node_json.contains("weight")) node.weight = std::make_shared<int>(node_json["weight"]);
                        if (node_json.contains("connections")) node.connections = std::make_shared<int>(node_json["connections"]);
                        if (node_json.contains("metadata")) node.metadata = std::make_shared<nlohmann::json>(node_json["metadata"]);
                        service.nodes.push_back(node);
                    }
                }
                if (service_json.contains("versions")) {
                    for (const auto& version : service_json["versions"]) {
                        service.versions.push_back(version);
                    }
                }
                services_list.push_back(service);
            }
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return services_list;
}

std::shared_ptr<Service> MaxineClient::service(const std::string& service_name) {
    std::string url = "/api/maxine/serviceops/service?serviceName=" + service_name;
    auto res = client_.Get(url.c_str(), buildHeaders());
    if (res && res->status == 200) {
        try {
            auto json = nlohmann::json::parse(res->body);
            auto service = std::make_shared<Service>();
            service->service_name = json.value("serviceName", "");
            if (json.contains("nodes")) {
                for (const auto& node_json : json["nodes"]) {
                    ServiceNode node;
                    node.address = node_json.value("address", "");
                    node.node_name = node_json.value("nodeName", "");
                    node.healthy = node_json.value("healthy", false);
                    if (node_json.contains("weight")) node.weight = std::make_shared<int>(node_json["weight"]);
                    if (node_json.contains("connections")) node.connections = std::make_shared<int>(node_json["connections"]);
                    if (node_json.contains("metadata")) node.metadata = std::make_shared<nlohmann::json>(node_json["metadata"]);
                    service->nodes.push_back(node);
                }
            }
            if (json.contains("versions")) {
                for (const auto& version : json["versions"]) {
                    service->versions.push_back(version);
                }
            }
            return service;
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return nullptr;
}

std::vector<HealthScore> MaxineClient::healthScores(const std::string& service_name) {
    std::vector<HealthScore> scores;
    std::string url = "/api/maxine/serviceops/health-score?serviceName=" + service_name;
    auto res = client_.Get(url.c_str(), buildHeaders());
    if (res && res->status == 200) {
        try {
            auto json = nlohmann::json::parse(res->body);
            if (json.contains("scores")) {
                for (auto& [node_id, score] : json["scores"].items()) {
                    scores.push_back({node_id, score});
                }
            }
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return scores;
}

std::vector<Anomaly> MaxineClient::anomalies() {
    std::vector<Anomaly> anomalies_list;
    auto res = client_.Get("/api/maxine/serviceops/anomalies", buildHeaders());
    if (res && res->status == 200) {
        try {
            auto json = nlohmann::json::parse(res->body);
            if (json.contains("anomalies")) {
                for (const auto& anomaly_json : json["anomalies"]) {
                    Anomaly anomaly;
                    anomaly.service_name = anomaly_json.value("serviceName", "");
                    anomaly.anomaly_type = anomaly_json.value("type", "");
                    anomaly.severity = anomaly_json.value("severity", "");
                    if (anomaly_json.contains("value")) anomaly.value = std::make_shared<double>(anomaly_json["value"]);
                    if (anomaly_json.contains("threshold")) anomaly.threshold = std::make_shared<double>(anomaly_json["threshold"]);
                    anomalies_list.push_back(anomaly);
                }
            }
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return anomalies_list;
}

std::vector<std::string> MaxineClient::versions(const std::string& service_name) {
    std::vector<std::string> versions_list;
    std::string url = "/api/maxine/serviceops/versions?serviceName=" + service_name;
    auto res = client_.Get(url.c_str(), buildHeaders());
    if (res && res->status == 200) {
        try {
            auto json = nlohmann::json::parse(res->body);
            if (json.contains("versions")) {
                for (const auto& version : json["versions"]) {
                    versions_list.push_back(version);
                }
            }
        } catch (const std::exception& e) {
            std::cerr << "JSON parse error: " << e.what() << std::endl;
        }
    }
    return versions_list;
}

// Legacy methods
std::shared_ptr<ServiceNode> MaxineClient::discover(const std::string& service_name) {
    return discoverLightning(service_name);
}

bool MaxineClient::registerService(const std::string& service_name, const std::string& node_name, const std::string& address) {
    std::istringstream iss(address);
    std::string host;
    std::string port_str;
    if (std::getline(iss, host, ':') && std::getline(iss, port_str)) {
        try {
            int port = std::stoi(port_str);
            return !registerLightning(service_name, host, port).empty();
        } catch (const std::exception&) {
            return false;
        }
    }
    return false;
}

bool MaxineClient::deregisterService(const std::string& service_name, const std::string& node_name) {
    std::string node_id = service_name + ":" + node_name;
    return deregisterLightning(node_id);
}

} // namespace maxine