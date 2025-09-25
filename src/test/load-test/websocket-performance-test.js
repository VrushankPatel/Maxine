import WebSocket from 'k6/ws';
import { check } from 'k6';
import http from 'k6/http';

const host = 'http://127.0.0.1:8080';
const wsHost = 'ws://127.0.0.1:8080';

export function setup() {
  // Register a service to generate events
  const registerResponse = http.post(
    `${host}/register`,
    JSON.stringify({
      serviceName: 'test-service',
      host: 'localhost',
      port: 3000,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
  check(registerResponse, { 'register status is 200': (r) => r.status === 200 });
}

export default function () {
  const ws = new WebSocket(wsHost);

  ws.on('open', () => {
    // Subscribe to events
    ws.send(JSON.stringify({ subscribe: true }));
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    check(message, {
      'has event': (msg) => msg.event,
      'has timestamp': (msg) => msg.timestamp,
    });
  });

  ws.on('error', (e) => {
    console.error('WebSocket error:', e);
  });

  // Keep connection open for duration
  ws.on('close', () => {
    // Connection closed
  });
}

export function teardown() {
  // Cleanup
}
