import json
import threading
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional
from urllib import error, parse, request


class MaxineClientError(RuntimeError):
    def __init__(self, status: int, body: str):
        super().__init__(f"Maxine request failed with status {status}: {body}")
        self.status = status
        self.body = body


class _NoRedirectHandler(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@dataclass
class HeartbeatHandle:
    interval_seconds: float
    _tick: Callable[[], Optional[Dict[str, Any]]]
    _stop_event: threading.Event
    _thread: threading.Thread

    def tick(self) -> Optional[Dict[str, Any]]:
        if self._stop_event.is_set():
            return None
        return self._tick()

    def stop(self) -> None:
        self._stop_event.set()
        self._thread.join(timeout=1)


class MaxineClient:
    def __init__(self, base_url: str, access_token: Optional[str] = None, timeout: float = 10.0):
        if not base_url:
            raise ValueError("MaxineClient requires a base_url.")

        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._access_token = access_token
        self._no_redirect_opener = request.build_opener(_NoRedirectHandler)

    def set_access_token(self, token: Optional[str]) -> None:
        self._access_token = token or None

    def sign_in(self, user_name: str, password: str) -> str:
        response = self._request(
            "POST",
            "/api/maxine/signin",
            body={"userName": user_name, "password": password},
            response_type="json",
        )
        token = response["accessToken"]
        self.set_access_token(token)
        return token

    def change_password(self, password: str, new_password: str) -> Dict[str, Any]:
        return self._request(
            "PUT",
            "/api/maxine/change-password",
            body={"password": password, "newPassword": new_password},
            auth_required=True,
            response_type="json",
        )

    def register(self, service_data: Dict[str, Any]) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/api/maxine/serviceops/register",
            body=service_data,
            response_type="json",
        )

    def discover_location(self, service_name: str, end_point: str = "") -> Dict[str, Any]:
        query = {"serviceName": service_name}
        if end_point:
            query["endPoint"] = end_point

        route = "/api/maxine/serviceops/discover?" + parse.urlencode(query)
        status, headers, payload = self._request_raw(
            "GET",
            route,
            expected_statuses={302, 400, 503},
            response_type="auto",
            no_redirect=True,
        )
        return {
            "status": status,
            "location": headers.get("Location"),
            "data": payload,
        }

    def list_servers(self) -> Dict[str, Any]:
        return self._request("GET", "/api/maxine/serviceops/servers", auth_required=True, response_type="json")

    def get_config(self) -> Dict[str, Any]:
        return self._request("GET", "/api/maxine/control/config", auth_required=True, response_type="json")

    def update_config(self, config_patch: Dict[str, Any]) -> Dict[str, Any]:
        return self._request(
            "PUT",
            "/api/maxine/control/config",
            body=config_patch,
            auth_required=True,
            response_type="json",
        )

    def list_log_files(self) -> Dict[str, Any]:
        return self._request("GET", "/api/logs/download", auth_required=True, response_type="json")

    def recent_logs(self) -> Dict[str, Any]:
        return self._request("GET", "/api/logs/recent", auth_required=True, response_type="json")

    def clear_recent_logs(self) -> int:
        status, _headers, _payload = self._request_raw(
            "GET",
            "/api/logs/recent/clear",
            auth_required=True,
            response_type="auto",
        )
        return status

    def actuator_health(self) -> Dict[str, Any]:
        return self._request("GET", "/api/actuator/health", response_type="json")

    def actuator_info(self) -> Dict[str, Any]:
        return self._request("GET", "/api/actuator/info", response_type="json")

    def actuator_metrics(self) -> Dict[str, Any]:
        return self._request("GET", "/api/actuator/metrics", response_type="json")

    def actuator_performance(self) -> str:
        return self._request("GET", "/api/actuator/performance", response_type="text")

    def start_heartbeat(
        self,
        service_data: Dict[str, Any],
        interval_seconds: Optional[float] = None,
        immediately: bool = True,
        on_error: Optional[Callable[[Exception], None]] = None,
    ) -> HeartbeatHandle:
        resolved_interval = interval_seconds or self._resolve_heartbeat_interval(service_data)
        stop_event = threading.Event()

        def tick() -> Optional[Dict[str, Any]]:
            if stop_event.is_set():
                return None
            return self.register(service_data)

        def safe_tick() -> None:
            try:
                tick()
            except Exception as exc:  # pragma: no cover - delegated to on_error
                if on_error:
                    on_error(exc)

        def run() -> None:
            if immediately and not stop_event.is_set():
                safe_tick()

            while not stop_event.wait(resolved_interval):
                safe_tick()

        thread = threading.Thread(target=run, name="maxine-heartbeat", daemon=True)
        thread.start()
        return HeartbeatHandle(resolved_interval, tick, stop_event, thread)

    def _request(
        self,
        method: str,
        route: str,
        body: Optional[Dict[str, Any]] = None,
        auth_required: bool = False,
        response_type: str = "json",
    ) -> Any:
        _status, _headers, payload = self._request_raw(
            method,
            route,
            body=body,
            auth_required=auth_required,
            response_type=response_type,
        )
        return payload

    def _request_raw(
        self,
        method: str,
        route: str,
        body: Optional[Dict[str, Any]] = None,
        auth_required: bool = False,
        expected_statuses: Optional[set[int]] = None,
        response_type: str = "json",
        no_redirect: bool = False,
    ) -> tuple[int, Dict[str, str], Any]:
        url = f"{self.base_url}{route}"
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if auth_required and self._access_token:
            headers["Authorization"] = f"Bearer {self._access_token}"

        req = request.Request(url, data=data, headers=headers, method=method)
        opener = self._no_redirect_opener if no_redirect else request.build_opener()

        try:
            with opener.open(req, timeout=self.timeout) as response:
                status = response.getcode()
                response_headers = dict(response.info())
                content = response.read().decode("utf-8")
        except error.HTTPError as exc:
            status = exc.code
            response_headers = dict(exc.headers)
            content = exc.read().decode("utf-8")
            if not expected_statuses or status not in expected_statuses:
                raise MaxineClientError(status, content) from exc
            return status, response_headers, self._decode_payload(content, response_headers, response_type)
        except error.URLError as exc:
            raise MaxineClientError(0, str(exc.reason)) from exc

        if expected_statuses and status not in expected_statuses:
            raise MaxineClientError(status, content)

        return status, response_headers, self._decode_payload(content, response_headers, response_type)

    def _decode_payload(self, content: str, headers: Dict[str, str], response_type: str) -> Any:
        if response_type == "text":
            return content

        if not content:
            return {}

        if response_type == "json":
            return json.loads(content)

        content_type = headers.get("Content-Type", "")
        if "application/json" in content_type:
            return json.loads(content)

        return content

    def _resolve_heartbeat_interval(self, service_data: Dict[str, Any]) -> float:
        raw_timeout = service_data.get("timeOut", 5)
        try:
            timeout_seconds = float(raw_timeout)
        except (TypeError, ValueError):
            timeout_seconds = 5.0
        return max(1.0, timeout_seconds / 2.0)

    signIn = sign_in
    changePassword = change_password
    discoverLocation = discover_location
    listServers = list_servers
    getConfig = get_config
    updateConfig = update_config
    listLogFiles = list_log_files
    getRecentLogs = recent_logs
    clearRecentLogs = clear_recent_logs
    actuatorHealth = actuator_health
    actuatorInfo = actuator_info
    actuatorMetrics = actuator_metrics
    actuatorPerformance = actuator_performance
    startHeartbeat = start_heartbeat
