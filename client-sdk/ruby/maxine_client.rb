require 'net/http'
require 'uri'
require 'json'
require 'time'
require 'socket'
require 'thread'
require 'websocket-client-simple'

class MaxineClient
  """
  Ruby client for Maxine Service Registry
  """

  def initialize(base_url: 'http://localhost:8080', timeout: 5, cache_max: 100, cache_ttl: 30)
    @base_url = base_url.chomp('/')
    @timeout = timeout
    @cache_max = cache_max
    @cache_ttl = cache_ttl
    @discovery_cache = {}
    @cache_timestamps = {}
    @cache_order = []
    @mutex = Mutex.new
  end

  private

  def make_request(method, endpoint, params: nil, body: nil, headers: {})
    url = URI.join(@base_url + '/api/maxine/serviceops/', endpoint)
    url.query = URI.encode_www_form(params) if params

    http = Net::HTTP.new(url.host, url.port)
    http.open_timeout = @timeout
    http.read_timeout = @timeout

    request_class = case method.upcase
                    when 'GET' then Net::HTTP::Get
                    when 'POST' then Net::HTTP::Post
                    when 'PUT' then Net::HTTP::Put
                    when 'DELETE' then Net::HTTP::Delete
                    else Net::HTTP::Get
                    end

    request = request_class.new(url)
    headers.each { |k, v| request[k] = v }
    request['Content-Type'] = 'application/json' if body
    request.body = body.to_json if body

    response = http.request(request)
    raise "HTTP #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  end

  def get_cache(key)
    @mutex.synchronize do
      if @discovery_cache.key?(key)
        if Time.now.to_f - @cache_timestamps[key] < @cache_ttl
          return @discovery_cache[key]
        else
          @discovery_cache.delete(key)
          @cache_timestamps.delete(key)
          @cache_order.delete(key)
        end
      end
    end
    nil
  end

  def set_cache(key, data)
    @mutex.synchronize do
      if @discovery_cache.size >= @cache_max
        oldest_key = @cache_timestamps.min_by { |_, v| v }&.first
        if oldest_key
          @discovery_cache.delete(oldest_key)
          @cache_timestamps.delete(oldest_key)
          @cache_order.delete(oldest_key)
        end
      end
      @cache_order.delete(key)
      @cache_order << key
      @discovery_cache[key] = data
      @cache_timestamps[key] = Time.now.to_f
    end
  end

  public

  def clear_cache
    @mutex.synchronize do
      @discovery_cache.clear
      @cache_timestamps.clear
      @cache_order.clear
    end
  end

  def register_service(service_name, address, node_name: nil, metadata: {})
    node_name ||= "#{service_name}-#{SecureRandom.hex(4)}"

    payload = {
      serviceName: service_name,
      address: address,
      nodeName: node_name,
      metadata: metadata
    }

    make_request('POST', 'register', body: payload)
  end

  def deregister_service(service_name, node_name)
    payload = {
      serviceName: service_name,
      nodeName: node_name
    }

    make_request('DELETE', 'deregister', body: payload)
  end

  def discover_service(service_name, version: nil, namespace: 'default', region: 'default', zone: 'default', proxy: false)
    params = {
      serviceName: service_name,
      namespace: namespace,
      region: region,
      zone: zone,
      proxy: proxy
    }
    params[:version] = version if version

    cache_key = params.to_json
    cached = get_cache(cache_key)
    return cached if cached

    endpoint = proxy ? 'discover' : 'discover/info'
    result = make_request('GET', endpoint, params: params)

    set_cache(cache_key, result)
    result
  end

  def discover_service_udp(service_name, udp_port: 8081, udp_host: 'localhost')
    socket = UDPSocket.new
    socket.connect(udp_host, udp_port)
    socket.send(service_name, 0)
    data = socket.recv(1024)
    socket.close
    JSON.parse(data)
  end

  def discover_service_tcp(service_name, tcp_port: 8082, tcp_host: 'localhost')
    socket = TCPSocket.new(tcp_host, tcp_port)
    socket.puts(service_name)
    data = socket.gets
    socket.close
    JSON.parse(data.strip)
  end

  def get_service_health(service_name, namespace: 'default')
    params = {
      serviceName: service_name,
      namespace: namespace
    }

    make_request('GET', 'health', params: params)
  end

  def get_metrics
    make_request('GET', 'metrics')
  end

  def list_services
    make_request('GET', 'servers')
  end

  def get_cache_stats
    make_request('GET', 'cache/stats')
  end

  def get_service_changes(since: 0)
    params = { since: since }
    make_request('GET', 'changes', params: params)
  end

  # Lightning Mode API Methods

  def register_service_lightning(service_name, host, port, metadata: {}, tags: [], version: nil, environment: nil, namespace: 'default', datacenter: 'default')
    payload = {
      serviceName: service_name,
      host: host,
      port: port,
      metadata: metadata,
      tags: tags,
      version: version,
      environment: environment,
      namespace: namespace,
      datacenter: datacenter
    }

    url = URI.join(@base_url + '/', 'register')
    http = Net::HTTP.new(url.host, url.port)
    http.open_timeout = @timeout
    http.read_timeout = @timeout

    request = Net::HTTP::Post.new(url)
    request['Content-Type'] = 'application/json'
    request.body = payload.to_json

    response = http.request(request)
    raise "HTTP #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  end

  def discover_service_lightning(service_name, strategy: 'round-robin', client_id: nil, tags: [], version: nil, environment: nil, namespace: 'default', datacenter: 'default')
    params = {
      serviceName: service_name,
      strategy: strategy,
      namespace: namespace,
      datacenter: datacenter
    }
    params[:clientId] = client_id if client_id
    params[:tags] = tags.join(',') unless tags.empty?
    params[:version] = version if version
    params[:environment] = environment if environment

    url = URI.join(@base_url + '/', 'discover')
    url.query = URI.encode_www_form(params)

    http = Net::HTTP.new(url.host, url.port)
    http.open_timeout = @timeout
    http.read_timeout = @timeout

    request = Net::HTTP::Get.new(url)
    response = http.request(request)
    raise "HTTP #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  end

  def heartbeat_lightning(node_id)
    payload = { nodeId: node_id }

    url = URI.join(@base_url + '/', 'heartbeat')
    http = Net::HTTP.new(url.host, url.port)
    http.open_timeout = @timeout
    http.read_timeout = @timeout

    request = Net::HTTP::Post.new(url)
    request['Content-Type'] = 'application/json'
    request.body = payload.to_json

    response = http.request(request)
    raise "HTTP #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  end

  def deregister_service_lightning(service_name, node_name, namespace: 'default', datacenter: 'default')
    payload = {
      serviceName: service_name,
      nodeName: node_name,
      namespace: namespace,
      datacenter: datacenter
    }

    url = URI.join(@base_url + '/', 'deregister')
    http = Net::HTTP.new(url.host, url.port)
    http.open_timeout = @timeout
    http.read_timeout = @timeout

    request = Net::HTTP::Delete.new(url)
    request['Content-Type'] = 'application/json'
    request.body = payload.to_json

    response = http.request(request)
    raise "HTTP #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  end

  def list_services_lightning
    url = URI.join(@base_url + '/', 'servers')
    http = Net::HTTP.new(url.host, url.port)
    http.open_timeout = @timeout
    http.read_timeout = @timeout

    request = Net::HTTP::Get.new(url)
    response = http.request(request)
    raise "HTTP #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  end

  def get_health_lightning
    url = URI.join(@base_url + '/', 'health')
    http = Net::HTTP.new(url.host, url.port)
    http.open_timeout = @timeout
    http.read_timeout = @timeout

    request = Net::HTTP::Get.new(url)
    response = http.request(request)
    raise "HTTP #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body)
  end
end

class WebSocketClient
  """
  WebSocket client for real-time Maxine service registry events
  """

  def initialize(base_url: 'ws://localhost:8080', token: nil)
    @base_url = base_url.chomp('/')
    @token = token
    @connected = false
    @event_handlers = {}
    @ws = nil
    @thread = nil
  end

  def on_event(event_type, &handler)
    @event_handlers[event_type] ||= []
    @event_handlers[event_type] << handler
  end

  private

  def on_message(data)
    begin
      parsed = JSON.parse(data)
      event_type = parsed['event']
      if event_type && @event_handlers[event_type]
        @event_handlers[event_type].each { |handler| handler.call(parsed) }
      end
    rescue JSON::ParserError
      # Ignore invalid JSON
    end
  end

  def on_open
    @connected = true
    @ws.send({ auth: @token }.to_json) if @token
  end

  def on_close
    @connected = false
  end

  def on_error(error)
    puts "WebSocket error: #{error}"
  end

  public

  def connect
    @ws = WebSocket::Client::Simple.connect(@base_url) do |ws|
      ws.on :message do |msg|
        on_message(msg.data)
      end

      ws.on :open do
        on_open
      end

      ws.on :close do
        on_close
      end

      ws.on :error do |e|
        on_error(e)
      end
    end
  end

  def disconnect
    @ws.close if @ws
  end

  def subscribe(event_type, service_name: nil, node_id: nil)
    if @ws && @connected
      subscription = { subscribe: { event: event_type } }
      subscription[:subscribe][:serviceName] = service_name if service_name
      subscription[:subscribe][:nodeId] = node_id if node_id
      @ws.send(subscription.to_json)
    end
  end

  def unsubscribe
    @ws.send({ unsubscribe: true }.to_json) if @ws && @connected
  end

  def refresh_token
    @ws.send({ refresh_token: true }.to_json) if @ws && @connected && @token
  end
end