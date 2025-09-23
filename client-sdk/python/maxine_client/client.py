import requests
import json
import time
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