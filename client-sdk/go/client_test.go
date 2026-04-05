package maxine

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestClientSignInRegisterDiscoverAndConfig(t *testing.T) {
	var registerCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/maxine/signin":
			writeJSON(t, w, http.StatusOK, map[string]any{"accessToken": "token-123"})
		case r.Method == http.MethodGet && r.URL.Path == "/api/maxine/control/config":
			if r.Header.Get("Authorization") != "Bearer token-123" {
				writeJSON(t, w, http.StatusUnauthorized, map[string]any{"message": "Unauthorized"})
				return
			}
			writeJSON(t, w, http.StatusOK, map[string]any{"heartBeatTimeout": float64(5)})
		case r.Method == http.MethodPost && r.URL.Path == "/api/maxine/serviceops/register":
			registerCount.Add(1)
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode register payload: %v", err)
			}
			payload["registeredAt"] = "2026-04-05T00:00:00Z"
			writeJSON(t, w, http.StatusOK, payload)
		case r.Method == http.MethodGet && r.URL.Path == "/api/maxine/serviceops/discover":
			w.Header().Set("Location", "http://orders.internal/health")
			w.WriteHeader(http.StatusFound)
		default:
			writeJSON(t, w, http.StatusNotFound, map[string]any{"message": "unknown path"})
		}
	}))
	defer server.Close()

	client := NewClient(server.URL)

	token, err := client.SignIn("admin", "admin")
	if err != nil {
		t.Fatalf("sign in failed: %v", err)
	}
	if token != "token-123" {
		t.Fatalf("unexpected token: %s", token)
	}

	config, err := client.GetConfig()
	if err != nil {
		t.Fatalf("get config failed: %v", err)
	}
	if config["heartBeatTimeout"] != float64(5) {
		t.Fatalf("unexpected config payload: %#v", config)
	}

	registration, err := client.Register(map[string]any{
		"hostName":    "127.0.0.1",
		"nodeName":    "orders-node",
		"serviceName": "orders-service",
		"port":        8081,
		"ssl":         false,
		"timeOut":     10,
		"weight":      1,
	})
	if err != nil {
		t.Fatalf("register failed: %v", err)
	}
	if registration["serviceName"] != "orders-service" {
		t.Fatalf("unexpected registration payload: %#v", registration)
	}

	discovery, err := client.DiscoverLocation("orders-service", "/health")
	if err != nil {
		t.Fatalf("discover failed: %v", err)
	}
	if discovery.Status != http.StatusFound || discovery.Location != "http://orders.internal/health" {
		t.Fatalf("unexpected discovery response: %#v", discovery)
	}

	if registerCount.Load() != 1 {
		t.Fatalf("expected 1 registration, got %d", registerCount.Load())
	}
}

func TestStartHeartbeat(t *testing.T) {
	var registerCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/api/maxine/serviceops/register" {
			registerCount.Add(1)
			writeJSON(t, w, http.StatusOK, map[string]any{"serviceName": "orders-service"})
			return
		}
		writeJSON(t, w, http.StatusNotFound, map[string]any{"message": "unknown path"})
	}))
	defer server.Close()

	client := NewClient(server.URL)
	handle := client.StartHeartbeat(map[string]any{
		"hostName":    "127.0.0.1",
		"nodeName":    "orders-node",
		"serviceName": "orders-service",
		"port":        8081,
		"ssl":         false,
		"timeOut":     1,
		"weight":      1,
	}, 40*time.Millisecond, true, func(err error) {
		t.Fatalf("heartbeat error: %v", err)
	})

	time.Sleep(180 * time.Millisecond)
	handle.Stop()

	if registerCount.Load() < 2 {
		t.Fatalf("expected heartbeat to register multiple times, got %d", registerCount.Load())
	}
}

func writeJSON(t *testing.T, w http.ResponseWriter, status int, payload map[string]any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}
