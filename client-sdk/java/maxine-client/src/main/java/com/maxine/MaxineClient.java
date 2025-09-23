package com.maxine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Java client for Maxine service registry
 */
public class MaxineClient {
    private static final Logger logger = LoggerFactory.getLogger(MaxineClient.class);

    private final String registryUrl;
    private final CloseableHttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final Map<String, ServiceNode> cache;

    public MaxineClient(String registryUrl) {
        this.registryUrl = registryUrl.endsWith("/") ? registryUrl.substring(0, registryUrl.length() - 1) : registryUrl;
        this.httpClient = HttpClients.createDefault();
        this.objectMapper = new ObjectMapper();
        this.cache = new ConcurrentHashMap<>();
    }

    /**
     * Discover a service node
     * @param serviceName The service name to discover
     * @return ServiceNode or null if not found
     */
    public ServiceNode discover(String serviceName) {
        return discover(serviceName, null, null, null);
    }

    /**
     * Discover a service node with parameters
     * @param serviceName The service name
     * @param namespace The namespace (default: default)
     * @param version The version
     * @param proxy Whether to proxy or return address
     * @return ServiceNode or null if not found
     */
    public ServiceNode discover(String serviceName, String namespace, String version, Boolean proxy) {
        String cacheKey = serviceName + ":" + (namespace != null ? namespace : "default") + ":" + (version != null ? version : "") + ":" + (proxy != null ? proxy : "");
        ServiceNode cached = cache.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        try {
            String url = registryUrl + "/api/maxine/serviceops/discover?serviceName=" + serviceName;
            if (namespace != null) url += "&namespace=" + namespace;
            if (version != null) url += "&version=" + version;
            if (proxy != null) url += "&proxy=" + proxy;

            HttpGet request = new HttpGet(url);
            try (CloseableHttpResponse response = httpClient.execute(request)) {
                int statusCode = response.getStatusLine().getStatusCode();
                if (statusCode == 200) {
                    String json = EntityUtils.toString(response.getEntity());
                    JsonNode node = objectMapper.readTree(json);
                    String address = node.get("address").asText();
                    String nodeName = node.get("nodeName").asText();
                    ServiceNode serviceNode = new ServiceNode(address, nodeName);
                    cache.put(cacheKey, serviceNode);
                    return serviceNode;
                } else {
                    logger.warn("Service discovery failed for {}: {}", serviceName, statusCode);
                    return null;
                }
            }
        } catch (IOException e) {
            logger.error("Error discovering service {}", serviceName, e);
            return null;
        }
    }

    /**
     * Discover a service node via UDP for ultra-fast lookups
     * @param serviceName The service name to discover
     * @param udpPort The UDP port of the Maxine server
     * @param udpHost The UDP host of the Maxine server
     * @return ServiceNode or null if not found
     */
    public ServiceNode discoverUDP(String serviceName, int udpPort, String udpHost) {
        try {
            java.net.DatagramSocket socket = new java.net.DatagramSocket();
            socket.setSoTimeout((int) (1000)); // 1 second timeout
            byte[] sendData = serviceName.getBytes();
            java.net.InetAddress address = java.net.InetAddress.getByName(udpHost);
            java.net.DatagramPacket sendPacket = new java.net.DatagramPacket(sendData, sendData.length, address, udpPort);
            socket.send(sendPacket);

            byte[] receiveData = new byte[1024];
            java.net.DatagramPacket receivePacket = new java.net.DatagramPacket(receiveData, receiveData.length);
            socket.receive(receivePacket);
            socket.close();

            String response = new String(receivePacket.getData(), 0, receivePacket.getLength());
            JsonNode node = objectMapper.readTree(response);
            String addr = node.get("address").asText();
            String nodeName = node.get("nodeName").asText();
            return new ServiceNode(addr, nodeName);
        } catch (Exception e) {
            logger.error("Error discovering service {} via UDP", serviceName, e);
            return null;
        }
    }

    /**
     * Discover a service node via TCP for ultra-fast lookups
     * @param serviceName The service name to discover
     * @param tcpPort The TCP port of the Maxine server
     * @param tcpHost The TCP host of the Maxine server
     * @return ServiceNode or null if not found
     */
    public ServiceNode discoverTCP(String serviceName, int tcpPort, String tcpHost) {
        try {
            java.net.Socket socket = new java.net.Socket(tcpHost, tcpPort);
            socket.setSoTimeout(1000); // 1 second timeout
            java.io.OutputStream out = socket.getOutputStream();
            out.write((serviceName + "\n").getBytes());
            out.flush();

            java.io.BufferedReader in = new java.io.BufferedReader(new java.io.InputStreamReader(socket.getInputStream()));
            String response = in.readLine();
            socket.close();

            JsonNode node = objectMapper.readTree(response);
            String addr = node.get("address").asText();
            String nodeName = node.get("nodeName").asText();
            return new ServiceNode(addr, nodeName);
        } catch (Exception e) {
            logger.error("Error discovering service {} via TCP", serviceName, e);
            return null;
        }
    }

    /**
     * Register a service
     * @param serviceName The service name
     * @param address The service address
     * @param metadata Additional metadata
     * @return true if successful
     */
    public boolean register(String serviceName, String address, Map<String, Object> metadata) {
        // Implementation for registration would require POST request
        // For now, return false as this is a discovery client
        logger.warn("Registration not implemented in discovery client");
        return false;
    }

    /**
     * Deregister a service
     * @param serviceName The service name
     * @param nodeName The node name
     * @return true if successful
     */
    public boolean deregister(String serviceName, String nodeName) {
        // Implementation for deregistration would require DELETE request
        // For now, return false as this is a discovery client
        logger.warn("Deregistration not implemented in discovery client");
        return false;
    }

    /**
     * Close the client
     */
    public void close() {
        try {
            httpClient.close();
        } catch (IOException e) {
            logger.error("Error closing HTTP client", e);
        }
    }

    /**
     * Service node representation
     */
    public static class ServiceNode {
        private final String address;
        private final String nodeName;

        public ServiceNode(String address, String nodeName) {
            this.address = address;
            this.nodeName = nodeName;
        }

        public String getAddress() {
            return address;
        }

        public String getNodeName() {
            return nodeName;
        }

        @Override
        public String toString() {
            return "ServiceNode{" +
                    "address='" + address + '\'' +
                    ", nodeName='" + nodeName + '\'' +
                    '}';
        }
    }
}</content>
</xai:function_call"> 

Assistant: Now, create a README for the Java client. 

<xai:function_call name="write">
<parameter name="filePath">client-sdk/java/README.md