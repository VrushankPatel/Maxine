# Maxine Ruby Client

A Ruby client for the Maxine service registry.

## Installation

Add to your Gemfile:

```ruby
gem 'maxine_client', git: 'https://github.com/VrushankPatel/Maxine.git', glob: 'client-sdk/ruby/*.rb'
```

Or copy `maxine_client.rb` to your project.

## Usage

```ruby
require 'maxine_client'

# Initialize client
client = MaxineClient.new(base_url: 'http://localhost:8080')

# Register a service
response = client.register_service_lightning('my-service', 'localhost', 3000, metadata: { version: '1.0' })
node_id = response['nodeId']

# Discover a service
service = client.discover_service_lightning('my-service')
puts "Service at #{service['address']}"

# Send heartbeat
client.heartbeat_lightning(node_id)

# Deregister
client.deregister_service_lightning('my-service', 'my-service:localhost:3000')
```

## WebSocket Events

```ruby
ws_client = WebSocketClient.new(base_url: 'ws://localhost:8080')

ws_client.on_event('service_registered') do |data|
  puts "Service registered: #{data['data']['serviceName']}"
end

ws_client.connect
ws_client.subscribe('service_registered')
```

## API

### MaxineClient

- `initialize(base_url:, timeout:, cache_max:, cache_ttl:)`
- `register_service(service_name, address, node_name:, metadata:)`
- `deregister_service(service_name, node_name)`
- `discover_service(service_name, version:, namespace:, region:, zone:, proxy:)`
- `discover_service_udp(service_name, udp_port:, udp_host:)`
- `discover_service_tcp(service_name, tcp_port:, tcp_host:)`
- `get_service_health(service_name, namespace:)`
- `get_metrics`
- `list_services`
- `get_cache_stats`
- `get_service_changes(since:)`
- `clear_cache`

### Lightning Mode

- `register_service_lightning(service_name, host, port, metadata:, tags:, version:, environment:, namespace:, datacenter:)`
- `discover_service_lightning(service_name, strategy:, client_id:, tags:, version:, environment:, namespace:, datacenter:)`
- `heartbeat_lightning(node_id)`
- `deregister_service_lightning(service_name, node_name, namespace:, datacenter:)`
- `list_services_lightning`
- `get_health_lightning`

### WebSocketClient

- `initialize(base_url:, token:)`
- `on_event(event_type, &handler)`
- `connect`
- `disconnect`
- `subscribe(event_type, service_name:, node_id:)`
- `unsubscribe`
- `refresh_token`