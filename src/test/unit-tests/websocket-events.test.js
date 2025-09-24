const WebSocket = require('ws');
const http = require('http');
const { expect } = require('chai');

describe('WebSocket Event Streaming', () => {
  let server;
  let port = 8081; // Use different port for tests

  before((done) => {
     // Start server on test port
     process.env.PORT = port;
     process.env.LIGHTNING_MODE = 'true';
     process.env.WEBSOCKET_ENABLED = 'true';

     server = require('../../../index');
     server.listen(port, () => {
       done();
     });
   });

   after((done) => {
     server.close(done);
   });

  it('should connect to WebSocket and receive events', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.on('open', () => {
      // Subscribe to events
      ws.send(JSON.stringify({ subscribe: true }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data);
      expect(message).to.have.property('event');
      expect(message).to.have.property('timestamp');
      ws.close();
      done();
    });

    ws.on('error', (err) => {
      done(err);
    });

    // Trigger an event by registering a service
    setTimeout(() => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: '/register',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }, (res) => {
        // Event should be sent via WebSocket
      });

      req.write(JSON.stringify({
        serviceName: 'test-service',
        host: '127.0.0.1',
        port: 3000
      }));
      req.end();
    }, 100);
  });

  it('should handle authentication', (done) => {
    process.env.AUTH_ENABLED = 'true';
    process.env.JWT_SECRET = 'test-secret';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD_HASH = '$2b$10$test.hash'; // bcrypt hash for 'password'

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.on('open', () => {
      // Try to authenticate
      ws.send(JSON.stringify({ auth: 'invalid-token' }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.type === 'auth_failed') {
        ws.close();
        done();
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should filter events by service name', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.on('open', () => {
      // Subscribe to specific service
      ws.send(JSON.stringify({
        subscribe: { serviceName: 'specific-service' }
      }));
    });

    let receivedEvent = false;
    ws.on('message', (data) => {
      const message = JSON.parse(data);
      if (message.event === 'service_registered') {
        expect(message.data.serviceName).to.equal('specific-service');
        receivedEvent = true;
        ws.close();
        done();
      }
    });

    // Register different services
    setTimeout(() => {
      // Register non-matching service
      const req1 = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: '/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      req1.write(JSON.stringify({
        serviceName: 'other-service',
        host: 'localhost',
        port: 3001
      }));
      req1.end();

      // Register matching service
      setTimeout(() => {
        const req2 = http.request({
          hostname: '127.0.0.1',
          port: port,
          path: '/register',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        req2.write(JSON.stringify({
          serviceName: 'specific-service',
          host: 'localhost',
          port: 3002
        }));
        req2.end();
      }, 50);
    }, 100);

    ws.on('error', (err) => {
      if (!receivedEvent) done(err);
    });
  });
});