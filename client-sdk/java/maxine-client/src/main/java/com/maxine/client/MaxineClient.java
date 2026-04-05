package com.maxine.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Objects;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Java client for the current Maxine API.
 */
public class MaxineClient {
    private static final Logger LOGGER = Logger.getLogger(MaxineClient.class.getName());
    private final String baseUrl;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private String accessToken;

    public MaxineClient(String baseUrl) {
        this(baseUrl, null);
    }

    public MaxineClient(String baseUrl, String accessToken) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.accessToken = accessToken;
        this.objectMapper = new ObjectMapper();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public void setAccessToken(String accessToken) {
        this.accessToken = accessToken;
    }

    public String signIn(String userName, String password) throws IOException, InterruptedException {
        JsonNode response = sendJson("POST", "/api/maxine/signin", Map.of(
                "userName", userName,
                "password", password
        ), false);
        this.accessToken = response.get("accessToken").asText();
        return this.accessToken;
    }

    public JsonNode changePassword(String password, String newPassword) throws IOException, InterruptedException {
        return sendJson("PUT", "/api/maxine/change-password", Map.of(
                "password", password,
                "newPassword", newPassword
        ), true);
    }

    public JsonNode register(Map<String, Object> serviceData) throws IOException, InterruptedException {
        return sendJson("POST", "/api/maxine/serviceops/register", serviceData, false);
    }

    public HeartbeatHandle startHeartbeat(Map<String, Object> serviceData) {
        return startHeartbeat(serviceData, null, true);
    }

    public HeartbeatHandle startHeartbeat(Map<String, Object> serviceData, Duration interval) {
        return startHeartbeat(serviceData, interval, true);
    }

    public HeartbeatHandle startHeartbeat(Map<String, Object> serviceData, Duration interval, boolean immediately) {
        Objects.requireNonNull(serviceData, "serviceData");
        Duration resolvedInterval = resolveHeartbeatInterval(serviceData, interval);
        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(new HeartbeatThreadFactory());
        AtomicBoolean stopped = new AtomicBoolean(false);
        Runnable task = () -> {
            if (stopped.get()) {
                return;
            }
            try {
                register(serviceData);
            } catch (IOException ex) {
                LOGGER.log(Level.WARNING, "Maxine heartbeat failed: " + ex.getMessage(), ex);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                LOGGER.log(Level.WARNING, "Maxine heartbeat interrupted", ex);
            } catch (RuntimeException ex) {
                LOGGER.log(Level.WARNING, "Unexpected Maxine heartbeat failure", ex);
            }
        };

        ScheduledFuture<?> future = executor.scheduleWithFixedDelay(
                task,
                immediately ? 0 : resolvedInterval.toMillis(),
                resolvedInterval.toMillis(),
                TimeUnit.MILLISECONDS
        );

        return new HeartbeatHandle(resolvedInterval, executor, future, stopped);
    }

    public Optional<String> discoverLocation(String serviceName, String endPoint) throws IOException, InterruptedException {
        String query = "serviceName=" + encode(serviceName);
        if (endPoint != null && !endPoint.isEmpty()) {
            query += "&endPoint=" + encode(endPoint);
        }

        HttpRequest request = requestBuilder("/api/maxine/serviceops/discover?" + query, false)
                .GET()
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 302) {
            return response.headers().firstValue("location");
        }
        if (response.statusCode() == 400 || response.statusCode() == 503) {
            return Optional.empty();
        }

        throw new IOException("Unexpected discovery response status: " + response.statusCode());
    }

    public JsonNode listServers() throws IOException, InterruptedException {
        return sendJson("GET", "/api/maxine/serviceops/servers", null, true);
    }

    public JsonNode getConfig() throws IOException, InterruptedException {
        return sendJson("GET", "/api/maxine/control/config", null, true);
    }

    public JsonNode updateConfig(Map<String, Object> configPatch) throws IOException, InterruptedException {
        return sendJson("PUT", "/api/maxine/control/config", configPatch, true);
    }

    public JsonNode listLogFiles() throws IOException, InterruptedException {
        return sendJson("GET", "/api/logs/download", null, true);
    }

    public JsonNode recentLogs() throws IOException, InterruptedException {
        return sendJson("GET", "/api/logs/recent", null, true);
    }

    public int clearRecentLogs() throws IOException, InterruptedException {
        HttpRequest request = requestBuilder("/api/logs/recent/clear", true)
                .GET()
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    public JsonNode actuatorHealth() throws IOException, InterruptedException {
        return sendJson("GET", "/api/actuator/health", null, false);
    }

    public JsonNode actuatorInfo() throws IOException, InterruptedException {
        return sendJson("GET", "/api/actuator/info", null, false);
    }

    public JsonNode actuatorMetrics() throws IOException, InterruptedException {
        return sendJson("GET", "/api/actuator/metrics", null, false);
    }

    public String actuatorPerformance() throws IOException, InterruptedException {
        HttpRequest request = requestBuilder("/api/actuator/performance", false)
                .GET()
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IOException("Performance report request failed with status " + response.statusCode());
        }
        return response.body();
    }

    private JsonNode sendJson(String method, String route, Map<String, Object> body, boolean authRequired) throws IOException, InterruptedException {
        HttpRequest.Builder builder = requestBuilder(route, authRequired);

        if ("GET".equals(method)) {
            builder.GET();
        } else {
            String payload = objectMapper.writeValueAsString(body == null ? Map.of() : body);
            builder.method(method, HttpRequest.BodyPublishers.ofString(payload));
        }

        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IOException("Request to " + route + " failed with status " + response.statusCode() + ": " + response.body());
        }
        return objectMapper.readTree(response.body());
    }

    private HttpRequest.Builder requestBuilder(String route, boolean authRequired) {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + route))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json");

        if (authRequired && accessToken != null && !accessToken.isBlank()) {
            builder.header("Authorization", "Bearer " + accessToken);
        }

        return builder;
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private Duration resolveHeartbeatInterval(Map<String, Object> serviceData, Duration requestedInterval) {
        if (requestedInterval != null) {
            return requestedInterval.isNegative() || requestedInterval.isZero()
                    ? Duration.ofSeconds(1)
                    : requestedInterval;
        }

        long timeoutSeconds = 5;
        Object timeOutValue = serviceData.get("timeOut");
        if (timeOutValue instanceof Number) {
            timeoutSeconds = ((Number) timeOutValue).longValue();
        } else if (timeOutValue instanceof String && !((String) timeOutValue).isBlank()) {
            timeoutSeconds = Long.parseLong((String) timeOutValue);
        }

        return Duration.ofSeconds(Math.max(1, timeoutSeconds / 2));
    }

    public static final class HeartbeatHandle implements AutoCloseable {
        private final Duration interval;
        private final ScheduledExecutorService executor;
        private final ScheduledFuture<?> future;
        private final AtomicBoolean stopped;

        private HeartbeatHandle(Duration interval, ScheduledExecutorService executor, ScheduledFuture<?> future, AtomicBoolean stopped) {
            this.interval = interval;
            this.executor = executor;
            this.future = future;
            this.stopped = stopped;
        }

        public Duration getInterval() {
            return interval;
        }

        public boolean isRunning() {
            return !stopped.get() && !future.isCancelled();
        }

        public void stop() {
            close();
        }

        @Override
        public void close() {
            if (stopped.compareAndSet(false, true)) {
                future.cancel(true);
                executor.shutdownNow();
            }
        }
    }

    private static final class HeartbeatThreadFactory implements ThreadFactory {
        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "maxine-heartbeat");
            thread.setDaemon(true);
            return thread;
        }
    }
}
