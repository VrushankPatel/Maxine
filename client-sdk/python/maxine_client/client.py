import requests
import json
import time
import socket
from typing import Dict, List, Optional, Any
from urllib.parse import urljoin


class MaxineClient:
    """
    Python client for Maxine Service Registry
    """

    def __init__(self, base_url: str = "http://localhost:8080", timeout: int = 5, cache_max: int = 100, cache_ttl: int = 30):
        """
        Initialize the Maxine client

        Args:
            base_url: Base URL of the Maxine server
            timeout: Request timeout in seconds
            cache_max: Maximum cache size
            cache_ttl: Cache TTL in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.cache_max = cache_max
        self.cache_ttl = cache_ttl
        self.discovery_cache: Dict[str, Dict[str, Any]] = {}
        self.cache_timestamps: Dict[str, float] = {}
        self.cache_order: List[str] = []

    def _make_request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request to Maxine API"""
        url = urljoin(self.base_url + '/api/maxine/serviceops/', endpoint)
        kwargs.setdefault('timeout', self.timeout)

        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()

    def _get_cache(self, key: str) -> Optional[Dict[str, Any]]:
        """Get cached data if valid"""
        if key in self.discovery_cache:
            if time.time() - self.cache_timestamps.get(key, 0) < self.cache_ttl:
                return self.discovery_cache[key]
            else:
                del self.discovery_cache[key]
                del self.cache_timestamps[key]
        return None

    def _set_cache(self, key: str, data: Dict[str, Any]):
        """Set cache data"""
        if len(self.discovery_cache) >= self.cache_max:
            # Simple LRU: remove oldest
            oldest_key = min(self.cache_timestamps.keys(), key=lambda k: self.cache_timestamps[k])
            del self.discovery_cache[oldest_key]
            del self.cache_timestamps[oldest_key]
            if oldest_key in self.cache_order:
                self.cache_order.remove(oldest_key)
        if key in self.discovery_cache:
            self.cache_order.remove(key)
        self.cache_order.append(key)
        self.discovery_cache[key] = data
        self.cache_timestamps[key] = time.time()

    def clear_cache(self):
        """Clear discovery cache"""
        self.discovery_cache.clear()
        self.cache_timestamps.clear()

    def register_service(self, service_name: str, address: str, node_name: Optional[str] = None,
                        metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Register a service with the registry

        Args:
            service_name: Name of the service
            address: Service address (e.g., http://localhost:3000)
            node_name: Unique node identifier (auto-generated if not provided)
            metadata: Additional service metadata

        Returns:
            Registration response
        """
        if not node_name:
            import uuid
            node_name = f"{service_name}-{str(uuid.uuid4())[:8]}"

        payload = {
            "serviceName": service_name,
            "address": address,
            "nodeName": node_name,
            "metadata": metadata or {}
        }

        return self._make_request('POST', 'register', json=payload)

    def deregister_service(self, service_name: str, node_name: str) -> Dict[str, Any]:
        """
        Deregister a service from the registry

        Args:
            service_name: Name of the service
            node_name: Node identifier

        Returns:
            Deregistration response
        """
        payload = {
            "serviceName": service_name,
            "nodeName": node_name
        }

        return self._make_request('DELETE', 'deregister', json=payload)

    def discover_service(self, service_name: str, version: Optional[str] = None, namespace: str = "default",
                         region: str = "default", zone: str = "default", proxy: bool = False) -> Dict[str, Any]:
        """
        Discover a service instance

        Args:
            service_name: Name of the service to discover
            version: Service version
            namespace: Service namespace
            region: Service region
            zone: Service zone
            proxy: Whether to proxy the request

        Returns:
            Service discovery response
        """
        params = {
            "serviceName": service_name,
            "namespace": namespace,
            "region": region,
            "zone": zone,
            "proxy": proxy
        }
        if version:
            params["version"] = version

        cache_key = json.dumps(params, sort_keys=True)
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        if proxy:
            result = self._make_request('GET', 'discover', params=params)
        else:
            result = self._make_request('GET', 'discover/info', params=params)

        self._set_cache(cache_key, result)
        return result

    def discover_service_udp(self, service_name: str, udp_port: int = 8081, udp_host: str = 'localhost') -> Dict[str, Any]:
        """
        Discover a service instance via UDP for ultra-fast lookups

        Args:
            service_name: Name of the service to discover
            udp_port: UDP port of the Maxine server
            udp_host: UDP host of the Maxine server

        Returns:
            Service discovery response
        """
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(self.timeout)
        try:
            sock.sendto(service_name.encode(), (udp_host, udp_port))
            data, _ = sock.recvfrom(1024)
            return json.loads(data.decode())
        finally:
            sock.close()

    def discover_service_tcp(self, service_name: str, tcp_port: int = 8082, tcp_host: str = 'localhost') -> Dict[str, Any]:
        """
        Discover a service instance via TCP for ultra-fast lookups

        Args:
            service_name: Name of the service to discover
            tcp_port: TCP port of the Maxine server
            tcp_host: TCP host of the Maxine server

        Returns:
            Service discovery response
        """
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        try:
            sock.connect((tcp_host, tcp_port))
            sock.sendall(service_name.encode() + b'\n')
            data = sock.recv(1024)
            return json.loads(data.decode().strip())
        finally:
            sock.close()

    def get_service_health(self, service_name: str, namespace: str = "default") -> Dict[str, Any]:
        """
        Get health status of all nodes for a service

        Args:
            service_name: Name of the service
            namespace: Service namespace

        Returns:
            Health status response
        """
        params = {
            "serviceName": service_name,
            "namespace": namespace
        }

        return self._make_request('GET', 'health', params=params)

    def get_metrics(self) -> Dict[str, Any]:
        """
        Get service registry metrics

        Returns:
            Metrics response
        """
        return self._make_request('GET', 'metrics')

    def list_services(self) -> Dict[str, Any]:
        """
        List all registered services

        Returns:
            Services list response
        """
        return self._make_request('GET', 'servers')

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get discovery cache statistics

        Returns:
            Cache stats response
        """
        return self._make_request('GET', 'cache/stats')

    def get_service_changes(self, since: int = 0) -> Dict[str, Any]:
        """
        Get registry changes since timestamp

        Args:
            since: Timestamp to get changes since

        Returns:
            Changes response
        """
        params = {"since": since}
        return self._make_request('GET', 'changes', params=params)

    def add_alias(self, alias: str, primary_service_name: str) -> Dict[str, Any]:
        """
        Add a service alias

        Args:
            alias: Alias name
            primary_service_name: Primary service name

        Returns:
            Response
        """
        payload = {"alias": alias, "primaryServiceName": primary_service_name}
        return self._make_request('POST', 'aliases/add', json=payload)

    def remove_alias(self, alias: str) -> Dict[str, Any]:
        """
        Remove a service alias

        Args:
            alias: Alias name

        Returns:
            Response
        """
        payload = {"alias": alias}
        return self._make_request('DELETE', 'aliases/remove', json=payload)

    def get_aliases(self, service_name: str) -> Dict[str, Any]:
        """
        Get aliases for a service

        Args:
            service_name: Service name

        Returns:
            Response
        """
        params = {"serviceName": service_name}
        return self._make_request('GET', 'aliases', params=params)

    def add_webhook(self, service_name: str, url: str) -> Dict[str, Any]:
        """
        Add a webhook for service changes

        Args:
            service_name: Service name
            url: Webhook URL

        Returns:
            Response
        """
        payload = {"serviceName": service_name, "url": url}
        return self._make_request('POST', 'webhooks/add', json=payload)

    def remove_webhook(self, service_name: str, url: str) -> Dict[str, Any]:
        """
        Remove a webhook

        Args:
            service_name: Service name
            url: Webhook URL

        Returns:
            Response
        """
        payload = {"serviceName": service_name, "url": url}
        return self._make_request('DELETE', 'webhooks/remove', json=payload)

    def get_webhooks(self, service_name: str) -> Dict[str, Any]:
        """
        Get webhooks for a service

        Args:
            service_name: Service name

        Returns:
            Response
        """
        params = {"serviceName": service_name}
        return self._make_request('GET', 'webhooks', params=params)

    def set_kv(self, key: str, value: Any) -> Dict[str, Any]:
        """
        Set a key-value pair

        Args:
            key: Key
            value: Value

        Returns:
            Response
        """
        payload = {"key": key, "value": value}
        return self._make_request('POST', 'kv/set', json=payload)

    def get_kv(self, key: str) -> Any:
        """
        Get a key-value pair

        Args:
            key: Key

        Returns:
            Value
        """
        params = {"key": key}
        response = self._make_request('GET', 'kv/get', params=params)
        return response.get('value')

    def delete_kv(self, key: str) -> Dict[str, Any]:
        """
        Delete a key-value pair

        Args:
            key: Key

        Returns:
            Response
        """
        payload = {"key": key}
        return self._make_request('DELETE', 'kv/delete', json=payload)

    def get_all_kv(self) -> Dict[str, Any]:
        """
        Get all key-value pairs

        Returns:
            Response
        """
        return self._make_request('GET', 'kv/all')

    # Lightning Mode API Methods (for ultra-fast operations)

    def register_service_lightning(self, service_name: str, host: str, port: int,
                                   metadata: Optional[Dict[str, Any]] = None,
                                   tags: Optional[List[str]] = None,
                                   version: Optional[str] = None,
                                   environment: Optional[str] = None,
                                   namespace: str = "default",
                                   datacenter: str = "default") -> Dict[str, Any]:
        """
        Register a service using Lightning Mode API for maximum speed

        Args:
            service_name: Name of the service
            host: Service host
            port: Service port
            metadata: Additional metadata
            tags: Service tags
            version: Service version
            environment: Environment (dev/staging/prod)
            namespace: Service namespace
            datacenter: Service datacenter

        Returns:
            Registration response
        """
        payload = {
            "serviceName": service_name,
            "host": host,
            "port": port,
            "metadata": metadata or {},
            "tags": tags or [],
            "version": version,
            "environment": environment,
            "namespace": namespace,
            "datacenter": datacenter
        }
        url = urljoin(self.base_url + '/', 'register')
        response = self.session.post(url, json=payload, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def discover_service_lightning(self, service_name: str,
                                   strategy: str = 'round-robin',
                                   client_id: Optional[str] = None,
                                   tags: Optional[List[str]] = None,
                                   version: Optional[str] = None,
                                   environment: Optional[str] = None,
                                   namespace: str = "default",
                                   datacenter: str = "default") -> Dict[str, Any]:
        """
        Discover a service using Lightning Mode API

        Args:
            service_name: Name of the service
            strategy: Load balancing strategy
            client_id: Client identifier for sticky sessions
            tags: Required tags
            version: Service version
            environment: Environment filter
            namespace: Service namespace
            datacenter: Service datacenter

        Returns:
            Discovery response
        """
        params = {
            "serviceName": service_name,
            "strategy": strategy,
            "namespace": namespace,
            "datacenter": datacenter
        }
        if client_id:
            params["clientId"] = client_id
        if tags:
            params["tags"] = ','.join(tags)
        if version:
            params["version"] = version
        if environment:
            params["environment"] = environment

        url = urljoin(self.base_url + '/', 'discover')
        response = self.session.get(url, params=params, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def heartbeat_lightning(self, node_id: str) -> Dict[str, Any]:
        """
        Send heartbeat using Lightning Mode API

        Args:
            node_id: Node identifier

        Returns:
            Heartbeat response
        """
        payload = {"nodeId": node_id}
        url = urljoin(self.base_url + '/', 'heartbeat')
        response = self.session.post(url, json=payload, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def deregister_service_lightning(self, service_name: str, node_name: str,
                                     namespace: str = "default",
                                     datacenter: str = "default") -> Dict[str, Any]:
        """
        Deregister a service using Lightning Mode API

        Args:
            service_name: Name of the service
            node_name: Node name
            namespace: Service namespace
            datacenter: Service datacenter

        Returns:
            Deregistration response
        """
        payload = {
            "serviceName": service_name,
            "nodeName": node_name,
            "namespace": namespace,
            "datacenter": datacenter
        }
        url = urljoin(self.base_url + '/', 'deregister')
        response = self.session.delete(url, json=payload, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def list_services_lightning(self) -> Dict[str, Any]:
        """
        List all services using Lightning Mode API

        Returns:
            Services list
        """
        url = urljoin(self.base_url + '/', 'servers')
        response = self.session.get(url, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def get_health_lightning(self) -> Dict[str, Any]:
        """
        Get health status using Lightning Mode API

        Returns:
            Health status
        """
        url = urljoin(self.base_url + '/', 'health')
        response = self.session.get(url, timeout=self.timeout)
        response.raise_for_status()
        return response.json()