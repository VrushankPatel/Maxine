use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ServiceNode {
    pub address: String,
    pub node_name: String,
    pub healthy: bool,
    pub weight: Option<i32>,
    pub connections: Option<i32>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Service {
    pub service_name: String,
    pub nodes: Vec<ServiceNode>,
    pub versions: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct HealthScore {
    pub node_id: String,
    pub score: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Anomaly {
    pub service_name: String,
    pub anomaly_type: String,
    pub value: Option<f64>,
    pub threshold: Option<f64>,
    pub severity: String,
}

pub struct MaxineClient {
    base_url: String,
    client: Client,
    api_key: Option<String>,
}

impl MaxineClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: Client::new(),
            api_key: None,
        }
    }

    pub fn with_api_key(mut self, api_key: &str) -> Self {
        self.api_key = Some(api_key.to_string());
        self
    }

    fn build_request(&self, method: reqwest::Method, url: &str) -> reqwest::RequestBuilder {
        let mut request = self.client.request(method, url);
        if let Some(ref key) = self.api_key {
            request = request.header("X-API-Key", key);
        }
        request
    }

    // Lightning Mode APIs
    pub async fn discover_lightning(&self, service_name: &str, load_balancing: Option<&str>, version: Option<&str>, tags: Option<&[&str]>) -> Result<ServiceNode, Box<dyn Error>> {
        let mut url = format!("{}/discover?serviceName={}", self.base_url, service_name);
        if let Some(lb) = load_balancing {
            url.push_str(&format!("&loadBalancing={}", lb));
        }
        if let Some(v) = version {
            url.push_str(&format!("&version={}", v));
        }
        if let Some(t) = tags {
            url.push_str(&format!("&tags={}", t.join(",")));
        }
        let response = self.build_request(reqwest::Method::GET, &url).send().await?;
        let node: ServiceNode = response.json().await?;
        Ok(node)
    }

    pub async fn register_lightning(&self, service_name: &str, host: &str, port: u16, metadata: Option<HashMap<String, serde_json::Value>>) -> Result<String, Box<dyn Error>> {
        let mut payload = serde_json::json!({
            "serviceName": service_name,
            "host": host,
            "port": port
        });
        if let Some(meta) = metadata {
            payload["metadata"] = serde_json::Value::Object(meta.into_iter().collect());
        }
        let url = format!("{}/register", self.base_url);
        let response = self.build_request(reqwest::Method::POST, &url)
            .json(&payload)
            .send()
            .await?;
        let result: serde_json::Value = response.json().await?;
        Ok(result["nodeId"].as_str().unwrap_or("").to_string())
    }

    pub async fn heartbeat_lightning(&self, node_id: &str) -> Result<bool, Box<dyn Error>> {
        let payload = serde_json::json!({ "nodeId": node_id });
        let url = format!("{}/heartbeat", self.base_url);
        let response = self.build_request(reqwest::Method::POST, &url)
            .json(&payload)
            .send()
            .await?;
        let result: serde_json::Value = response.json().await?;
        Ok(result["success"].as_bool().unwrap_or(false))
    }

    pub async fn deregister_lightning(&self, node_id: &str) -> Result<(), Box<dyn Error>> {
        let payload = serde_json::json!({ "nodeId": node_id });
        let url = format!("{}/deregister", self.base_url);
        self.build_request(reqwest::Method::DELETE, &url)
            .json(&payload)
            .send()
            .await?;
        Ok(())
    }

    pub async fn servers_lightning(&self) -> Result<Vec<String>, Box<dyn Error>> {
        let url = format!("{}/servers", self.base_url);
        let response = self.build_request(reqwest::Method::GET, &url).send().await?;
        let result: serde_json::Value = response.json().await?;
        let services = result["services"].as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|s| s.as_str())
            .map(|s| s.to_string())
            .collect();
        Ok(services)
    }

    pub async fn health_lightning(&self) -> Result<serde_json::Value, Box<dyn Error>> {
        let url = format!("{}/health", self.base_url);
        let response = self.build_request(reqwest::Method::GET, &url).send().await?;
        let health: serde_json::Value = response.json().await?;
        Ok(health)
    }

    pub async fn metrics_lightning(&self) -> Result<serde_json::Value, Box<dyn Error>> {
        let url = format!("{}/metrics", self.base_url);
        let response = self.build_request(reqwest::Method::GET, &url).send().await?;
        let metrics: serde_json::Value = response.json().await?;
        Ok(metrics)
    }

    // Full Mode APIs
    pub async fn services(&self) -> Result<Vec<Service>, Box<dyn Error>> {
        let url = format!("{}/api/maxine/serviceops/services", self.base_url);
        let response = self.build_request(reqwest::Method::GET, &url).send().await?;
        let services: Vec<Service> = response.json().await?;
        Ok(services)
    }

    pub async fn service(&self, service_name: &str) -> Result<Option<Service>, Box<dyn Error>> {
        let url = format!("{}/api/maxine/serviceops/service?serviceName={}", self.base_url, service_name);
        let response = self.build_request(reqwest::Method::GET, &url).send().await?;
        if response.status() == 404 {
            return Ok(None);
        }
        let service: Service = response.json().await?;
        Ok(Some(service))
    }

    pub async fn health_scores(&self, service_name: &str) -> Result<Vec<HealthScore>, Box<dyn Error>> {
        let url = format!("{}/api/maxine/serviceops/health-score?serviceName={}", self.base_url, service_name);
        let response = self.build_request(reqwest::Method::GET, &url).send().await?;
        let scores: Vec<HealthScore> = response.json().await?;
        Ok(scores)
    }

    pub async fn anomalies(&self) -> Result<Vec<Anomaly>, Box<dyn Error>> {
        let url = format!("{}/api/maxine/serviceops/anomalies", self.base_url);
        let response = self.build_request(reqwest::Method::GET, &url).send().await?;
        let result: serde_json::Value = response.json().await?;
        let anomalies: Vec<Anomaly> = serde_json::from_value(result["anomalies"].clone())?;
        Ok(anomalies)
    }

    pub async fn versions(&self, service_name: &str) -> Result<Vec<String>, Box<dyn Error>> {
        let url = format!("{}/api/maxine/serviceops/versions?serviceName={}", self.base_url, service_name);
        let response = self.build_request(reqwest::Method::GET, &url).send().await?;
        let result: serde_json::Value = response.json().await?;
        let versions: Vec<String> = result["versions"].as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|v| v.as_str())
            .map(|v| v.to_string())
            .collect();
        Ok(versions)
    }

    // Legacy methods for backward compatibility
    pub async fn discover(&self, service_name: &str) -> Result<ServiceNode, Box<dyn Error>> {
        self.discover_lightning(service_name, None, None, None).await
    }

    pub async fn register(&self, service_name: &str, node_name: &str, address: &str) -> Result<(), Box<dyn Error>> {
        let parts: Vec<&str> = address.split(':').collect();
        if parts.len() != 2 {
            return Err("Invalid address format".into());
        }
        let host = parts[0];
        let port: u16 = parts[1].parse().map_err(|_| "Invalid port")?;
        self.register_lightning(service_name, host, port, None).await?;
        Ok(())
    }

    pub async fn deregister(&self, service_name: &str, node_name: &str) -> Result<(), Box<dyn Error>> {
        let node_id = format!("{}:{}", service_name, node_name); // Assuming node_id format
        self.deregister_lightning(&node_id).await
    }
}