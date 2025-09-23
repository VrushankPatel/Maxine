use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Serialize, Deserialize, Debug)]
pub struct ServiceNode {
    pub address: String,
    pub node_name: String,
    pub healthy: bool,
}

pub struct MaxineClient {
    base_url: String,
    client: Client,
}

impl MaxineClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.to_string(),
            client: Client::new(),
        }
    }

    pub async fn discover(&self, service_name: &str) -> Result<ServiceNode, Box<dyn Error>> {
        let url = format!("{}/api/maxine/serviceops/discover?serviceName={}", self.base_url, service_name);
        let response = self.client.get(&url).send().await?;
        let node: ServiceNode = response.json().await?;
        Ok(node)
    }

    pub async fn register(&self, service_name: &str, node_name: &str, address: &str) -> Result<(), Box<dyn Error>> {
        let payload = serde_json::json!({
            "serviceName": service_name,
            "nodeName": node_name,
            "address": address
        });
        let url = format!("{}/api/maxine/serviceops/register", self.base_url);
        self.client.post(&url).json(&payload).send().await?;
        Ok(())
    }

    pub async fn deregister(&self, service_name: &str, node_name: &str) -> Result<(), Box<dyn Error>> {
        let payload = serde_json::json!({
            "serviceName": service_name,
            "nodeName": node_name
        });
        let url = format!("{}/api/maxine/serviceops/deregister", self.base_url);
        self.client.post(&url).json(&payload).send().await?;
        Ok(())
    }
}