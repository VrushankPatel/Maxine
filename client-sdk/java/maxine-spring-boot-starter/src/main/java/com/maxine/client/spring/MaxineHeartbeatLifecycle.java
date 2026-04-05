package com.maxine.client.spring;

import com.maxine.client.MaxineClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.context.WebServerApplicationContext;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.Environment;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

public class MaxineHeartbeatLifecycle implements ApplicationListener<ApplicationReadyEvent>, DisposableBean {
    private static final Logger LOGGER = LoggerFactory.getLogger(MaxineHeartbeatLifecycle.class);

    private final MaxineClientProperties properties;
    private final MaxineClient maxineClient;
    private final Environment environment;
    private final ApplicationContext applicationContext;

    private volatile MaxineClient.HeartbeatHandle heartbeatHandle;

    public MaxineHeartbeatLifecycle(MaxineClientProperties properties, MaxineClient maxineClient, Environment environment, ApplicationContext applicationContext) {
        this.properties = properties;
        this.maxineClient = maxineClient;
        this.environment = environment;
        this.applicationContext = applicationContext;
    }

    @Override
    public synchronized void onApplicationEvent(ApplicationReadyEvent event) {
        if (heartbeatHandle != null || !properties.isEnabled()) {
            return;
        }

        Map<String, Object> registration = buildRegistrationPayload();
        Duration interval = properties.getHeartbeatInterval();
        heartbeatHandle = maxineClient.startHeartbeat(registration, interval, true);
        LOGGER.info("Started Maxine heartbeat for service {} with interval {}", registration.get("serviceName"), heartbeatHandle.getInterval());
    }

    @Override
    public synchronized void destroy() {
        if (heartbeatHandle != null) {
            heartbeatHandle.close();
            heartbeatHandle = null;
        }
    }

    private Map<String, Object> buildRegistrationPayload() {
        String serviceName = coalesce(properties.getServiceName(), environment.getProperty("spring.application.name"));
        if (serviceName == null || serviceName.isBlank()) {
            throw new IllegalStateException("maxine.client.service-name or spring.application.name must be configured.");
        }

        String hostName = coalesce(properties.getHostName(), environment.getProperty("server.address"), resolveLocalHostName());
        int port = properties.getPort() != null ? properties.getPort() : resolvePort();
        boolean ssl = properties.getSsl() != null ? properties.getSsl() : environment.getProperty("server.ssl.enabled", Boolean.class, false);
        String path = coalesce(properties.getPath(), environment.getProperty("server.servlet.context-path"), "");
        int timeOut = properties.getTimeOut() != null ? properties.getTimeOut() : 5;
        int weight = properties.getWeight() != null ? properties.getWeight() : 1;
        String nodeName = coalesce(properties.getNodeName(), serviceName + "-" + hostName + "-" + port);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("hostName", hostName);
        payload.put("nodeName", nodeName);
        payload.put("serviceName", serviceName);
        payload.put("port", port);
        payload.put("ssl", ssl);
        payload.put("path", path);
        payload.put("timeOut", timeOut);
        payload.put("weight", weight);
        return payload;
    }

    private int resolvePort() {
        if (applicationContext instanceof WebServerApplicationContext) {
            WebServerApplicationContext webServerApplicationContext = (WebServerApplicationContext) applicationContext;
            if (webServerApplicationContext.getWebServer() != null && webServerApplicationContext.getWebServer().getPort() > 0) {
                return webServerApplicationContext.getWebServer().getPort();
            }
        }

        return environment.getProperty("local.server.port", Integer.class,
                environment.getProperty("server.port", Integer.class, 8080));
    }

    private String resolveLocalHostName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException ex) {
            LOGGER.warn("Unable to resolve local host name for Maxine registration, defaulting to localhost");
            return "localhost";
        }
    }

    private String coalesce(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
