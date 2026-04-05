import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from maxine_client import MaxineClient


class StubHandler(BaseHTTPRequestHandler):
    register_count = 0

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")

        if self.path == "/api/maxine/signin":
            self._write_json(200, {"accessToken": "token-123"})
            return

        if self.path == "/api/maxine/serviceops/register":
            StubHandler.register_count += 1
            body["registeredAt"] = "2026-04-05T00:00:00Z"
            self._write_json(200, body)
            return

        self._write_json(404, {"message": "unknown path"})

    def do_GET(self):
        if self.path == "/api/maxine/control/config":
            if self.headers.get("Authorization") != "Bearer token-123":
                self._write_json(401, {"message": "Unauthorized"})
                return
            self._write_json(200, {"heartBeatTimeout": 5})
            return

        if self.path.startswith("/api/maxine/serviceops/discover"):
            self.send_response(302)
            self.send_header("Location", "http://orders.internal/health")
            self.end_headers()
            return

        self._write_json(404, {"message": "unknown path"})

    def log_message(self, format, *args):
        return

    def _write_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class MaxineClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), StubHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        host, port = cls.server.server_address
        cls.base_url = f"http://{host}:{port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=1)

    def setUp(self):
        StubHandler.register_count = 0
        self.client = MaxineClient(self.base_url)

    def test_sign_in_register_discover_and_config(self):
        token = self.client.sign_in("admin", "admin")
        self.assertEqual(token, "token-123")

        config = self.client.get_config()
        self.assertEqual(config["heartBeatTimeout"], 5)

        registration = self.client.register(
            {
                "hostName": "127.0.0.1",
                "nodeName": "orders-node",
                "serviceName": "orders-service",
                "port": 8081,
                "ssl": False,
                "timeOut": 10,
                "weight": 1,
            }
        )
        self.assertEqual(registration["serviceName"], "orders-service")

        discovery = self.client.discover_location("orders-service", "/health")
        self.assertEqual(discovery["status"], 302)
        self.assertEqual(discovery["location"], "http://orders.internal/health")

    def test_background_heartbeat_re_registers_service(self):
        heartbeat = self.client.start_heartbeat(
            {
                "hostName": "127.0.0.1",
                "nodeName": "orders-node",
                "serviceName": "orders-service",
                "port": 8081,
                "ssl": False,
                "timeOut": 1,
                "weight": 1,
            },
            interval_seconds=0.05,
        )

        time.sleep(0.18)
        heartbeat.stop()
        self.assertGreaterEqual(StubHandler.register_count, 2)


if __name__ == "__main__":
    unittest.main()
