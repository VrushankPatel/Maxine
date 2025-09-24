#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <nlohmann/json.hpp>
#include "httplib.h"

namespace maxine {

struct ServiceNode {
    std::string address;
    std::string node_name;
    bool healthy;
    std::shared_ptr<int> weight;
    std::shared_ptr<int> connections;
    std::shared_ptr<nlohmann::json> metadata;

    ServiceNode() : healthy(false), weight(nullptr), connections(nullptr), metadata(nullptr) {}
};

struct Service {
    std::string service_name;
    std::vector<ServiceNode> nodes;
    std::vector<std::string> versions;
};

struct HealthScore {
    std::string node_id;
    double score;
};

struct Anomaly {
    std::string service_name;
    std::string anomaly_type;
    std::shared_ptr<double> value;
    std::shared_ptr<double> threshold;
    std::string severity;

    Anomaly() : value(nullptr), threshold(nullptr) {}
};

class MaxineClient {
public:
    MaxineClient(const std::string& base_url);
    MaxineClient& withApiKey(const std::string& api_key);

    // Lightning Mode APIs
    std::shared_ptr<ServiceNode> discoverLightning(
        const std::string& service_name,
        const std::string& load_balancing = "",
        const std::string& version = "",
        const std::vector<std::string>& tags = {}
    );

    std::string registerLightning(
        const std::string& service_name,
        const std::string& host,
        int port,
        const nlohmann::json& metadata = nlohmann::json()
    );

    bool heartbeatLightning(const std::string& node_id);

    bool deregisterLightning(const std::string& node_id);

    std::vector<std::string> serversLightning();

    nlohmann::json healthLightning();

    nlohmann::json metricsLightning();

    // Full Mode APIs
    std::vector<Service> services();

    std::shared_ptr<Service> service(const std::string& service_name);

    std::vector<HealthScore> healthScores(const std::string& service_name);

    std::vector<Anomaly> anomalies();

    std::vector<std::string> versions(const std::string& service_name);

    // Legacy methods for backward compatibility
    std::shared_ptr<ServiceNode> discover(const std::string& service_name);

    bool registerService(const std::string& service_name, const std::string& node_name, const std::string& address);

    bool deregisterService(const std::string& service_name, const std::string& node_name);

private:
    std::string base_url_;
    httplib::Client client_;
    std::string api_key_;

    httplib::Headers buildHeaders() const;
};

} // namespace maxine