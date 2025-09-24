#include "MaxineClient.hpp"
#include <iostream>

int main() {
    maxine::MaxineClient client("http://localhost:8080");

    // Discover a service (Lightning Mode)
    auto node = client.discoverLightning("my-service");
    if (node) {
        std::cout << "Found service at: " << node->address << std::endl;
    } else {
        std::cout << "Service not found" << std::endl;
    }

    // Register a service
    std::string nodeId = client.registerLightning("my-service", "localhost", 3000);
    if (!nodeId.empty()) {
        std::cout << "Registered with node ID: " << nodeId << std::endl;

        // Heartbeat
        bool success = client.heartbeatLightning(nodeId);
        if (success) {
            std::cout << "Heartbeat sent successfully" << std::endl;
        }

        // Deregister
        success = client.deregisterLightning(nodeId);
        if (success) {
            std::cout << "Deregistered successfully" << std::endl;
        }
    }

    // Get servers
    auto services = client.serversLightning();
    std::cout << "Registered services: ";
    for (const auto& service : services) {
        std::cout << service << " ";
    }
    std::cout << std::endl;

    // Get health
    auto health = client.healthLightning();
    if (!health.is_null()) {
        std::cout << "Health status: " << health.dump() << std::endl;
    }

    return 0;
}