package maxine

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Client struct {
	BaseURL     string
	AccessToken string
	HTTPClient  *http.Client
}

type DiscoveryResponse struct {
	Status   int
	Location string
	Data     any
}

type HeartbeatHandle struct {
	Interval    time.Duration
	client      *Client
	serviceData map[string]any
	onError     func(error)
	stop        chan struct{}
	once        sync.Once
	stopped     atomic.Bool
}

func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTPClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *Client) SetAccessToken(token string) {
	c.AccessToken = token
}

func (c *Client) SignIn(userName, password string) (string, error) {
	response, err := c.doJSON(http.MethodPost, "/api/maxine/signin", map[string]any{
		"userName": userName,
		"password": password,
	}, false)
	if err != nil {
		return "", err
	}

	token, _ := response["accessToken"].(string)
	c.SetAccessToken(token)
	return token, nil
}

func (c *Client) ChangePassword(password, newPassword string) (map[string]any, error) {
	return c.doJSON(http.MethodPut, "/api/maxine/change-password", map[string]any{
		"password":    password,
		"newPassword": newPassword,
	}, true)
}

func (c *Client) Register(serviceData map[string]any) (map[string]any, error) {
	return c.doJSON(http.MethodPost, "/api/maxine/serviceops/register", serviceData, false)
}

func (c *Client) DiscoverLocation(serviceName, endPoint string) (*DiscoveryResponse, error) {
	query := url.Values{}
	query.Set("serviceName", serviceName)
	if endPoint != "" {
		query.Set("endPoint", endPoint)
	}

	status, headers, body, err := c.doRequest(
		http.MethodGet,
		"/api/maxine/serviceops/discover?"+query.Encode(),
		nil,
		false,
		[]int{http.StatusFound, http.StatusBadRequest, http.StatusServiceUnavailable},
		true,
	)
	if err != nil {
		return nil, err
	}

	payload, err := decodeAutoBody(body, headers.Get("Content-Type"))
	if err != nil {
		return nil, err
	}

	return &DiscoveryResponse{
		Status:   status,
		Location: headers.Get("Location"),
		Data:     payload,
	}, nil
}

func (c *Client) ListServers() (map[string]any, error) {
	return c.doJSON(http.MethodGet, "/api/maxine/serviceops/servers", nil, true)
}

func (c *Client) GetConfig() (map[string]any, error) {
	return c.doJSON(http.MethodGet, "/api/maxine/control/config", nil, true)
}

func (c *Client) UpdateConfig(configPatch map[string]any) (map[string]any, error) {
	return c.doJSON(http.MethodPut, "/api/maxine/control/config", configPatch, true)
}

func (c *Client) ListLogFiles() (map[string]any, error) {
	return c.doJSON(http.MethodGet, "/api/logs/download", nil, true)
}

func (c *Client) RecentLogs() (map[string]any, error) {
	return c.doJSON(http.MethodGet, "/api/logs/recent", nil, true)
}

func (c *Client) ClearRecentLogs() (int, error) {
	status, _, _, err := c.doRequest(http.MethodGet, "/api/logs/recent/clear", nil, true, nil, false)
	return status, err
}

func (c *Client) ActuatorHealth() (map[string]any, error) {
	return c.doJSON(http.MethodGet, "/api/actuator/health", nil, false)
}

func (c *Client) ActuatorInfo() (map[string]any, error) {
	return c.doJSON(http.MethodGet, "/api/actuator/info", nil, false)
}

func (c *Client) ActuatorMetrics() (map[string]any, error) {
	return c.doJSON(http.MethodGet, "/api/actuator/metrics", nil, false)
}

func (c *Client) ActuatorPerformance() (string, error) {
	_, headers, body, err := c.doRequest(http.MethodGet, "/api/actuator/performance", nil, false, nil, false)
	if err != nil {
		return "", err
	}
	return decodeTextBody(body, headers.Get("Content-Type")), nil
}

func (c *Client) StartHeartbeat(serviceData map[string]any, interval time.Duration, immediately bool, onError func(error)) *HeartbeatHandle {
	resolvedInterval := resolveHeartbeatInterval(serviceData, interval)
	handle := &HeartbeatHandle{
		Interval:    resolvedInterval,
		client:      c,
		serviceData: serviceData,
		onError:     onError,
		stop:        make(chan struct{}),
	}

	go func() {
		ticker := time.NewTicker(resolvedInterval)
		defer ticker.Stop()

		if immediately {
			handle.safeTick()
		}

		for {
			select {
			case <-ticker.C:
				handle.safeTick()
			case <-handle.stop:
				return
			}
		}
	}()

	return handle
}

func (h *HeartbeatHandle) Tick() (map[string]any, error) {
	if h.stopped.Load() {
		return nil, nil
	}
	return h.client.Register(h.serviceData)
}

func (h *HeartbeatHandle) Stop() {
	h.once.Do(func() {
		h.stopped.Store(true)
		close(h.stop)
	})
}

func (h *HeartbeatHandle) safeTick() {
	if _, err := h.Tick(); err != nil && h.onError != nil {
		h.onError(err)
	}
}

func (c *Client) doJSON(method, route string, body map[string]any, authRequired bool) (map[string]any, error) {
	_, headers, responseBody, err := c.doRequest(method, route, body, authRequired, nil, false)
	if err != nil {
		return nil, err
	}

	payload, err := decodeJSONBody(responseBody, headers.Get("Content-Type"))
	if err != nil {
		return nil, err
	}
	return payload, nil
}

func (c *Client) doRequest(method, route string, body map[string]any, authRequired bool, expectedStatuses []int, noRedirect bool) (int, http.Header, []byte, error) {
	var reader io.Reader
	if body != nil && method != http.MethodGet {
		payload, err := json.Marshal(body)
		if err != nil {
			return 0, nil, nil, err
		}
		reader = bytes.NewReader(payload)
	}

	req, err := http.NewRequest(method, c.BaseURL+route, reader)
	if err != nil {
		return 0, nil, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if authRequired && c.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.AccessToken)
	}

	client := c.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	if noRedirect {
		client = &http.Client{
			Timeout:   client.Timeout,
			Transport: client.Transport,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}

	response, err := client.Do(req)
	if err != nil {
		return 0, nil, nil, err
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return 0, nil, nil, err
	}

	if !statusAllowed(response.StatusCode, expectedStatuses) {
		return response.StatusCode, response.Header, responseBody, fmt.Errorf("maxine request failed with status %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
	}

	return response.StatusCode, response.Header, responseBody, nil
}

func decodeJSONBody(body []byte, contentType string) (map[string]any, error) {
	if len(body) == 0 {
		return map[string]any{}, nil
	}

	if !strings.Contains(contentType, "application/json") {
		return nil, fmt.Errorf("expected JSON response but got %q", contentType)
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func decodeAutoBody(body []byte, contentType string) (any, error) {
	if len(body) == 0 {
		return map[string]any{}, nil
	}

	if strings.Contains(contentType, "application/json") {
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			return nil, err
		}
		return payload, nil
	}

	return decodeTextBody(body, contentType), nil
}

func decodeTextBody(body []byte, _ string) string {
	return string(body)
}

func statusAllowed(status int, expectedStatuses []int) bool {
	if len(expectedStatuses) == 0 {
		return status >= 200 && status < 400
	}

	for _, expected := range expectedStatuses {
		if status == expected {
			return true
		}
	}
	return false
}

func resolveHeartbeatInterval(serviceData map[string]any, requested time.Duration) time.Duration {
	if requested > 0 {
		return requested
	}

	switch value := serviceData["timeOut"].(type) {
	case int:
		return maxDuration(time.Duration(value)*time.Second/2, time.Second)
	case int32:
		return maxDuration(time.Duration(value)*time.Second/2, time.Second)
	case int64:
		return maxDuration(time.Duration(value)*time.Second/2, time.Second)
	case float64:
		return maxDuration(time.Duration(value*float64(time.Second))/2, time.Second)
	case string:
		if seconds, err := time.ParseDuration(value + "s"); err == nil {
			return maxDuration(seconds/2, time.Second)
		}
		parsed, err := time.ParseDuration(value)
		if err == nil {
			return maxDuration(parsed/2, time.Second)
		}
	}

	return 2500 * time.Millisecond
}

func maxDuration(left, right time.Duration) time.Duration {
	if left > right {
		return left
	}
	return right
}
