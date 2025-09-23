using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace Maxine
{
    /// <summary>
    /// C# client for Maxine service registry
    /// </summary>
    public class MaxineClient : IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly string _registryUrl;

        public MaxineClient(string registryUrl)
        {
            _registryUrl = registryUrl.TrimEnd('/');
            _httpClient = new HttpClient();
        }

        /// <summary>
        /// Discover a service node
        /// </summary>
        /// <param name="serviceName">The service name to discover</param>
        /// <returns>ServiceNode or null if not found</returns>
        public async Task<ServiceNode?> DiscoverAsync(string serviceName)
        {
            return await DiscoverAsync(serviceName, null, null, null);
        }

        /// <summary>
        /// Discover a service node with parameters
        /// </summary>
        /// <param name="serviceName">The service name</param>
        /// <param name="namespace">The namespace (default: default)</param>
        /// <param name="version">The version</param>
        /// <param name="proxy">Whether to proxy or return address</param>
        /// <returns>ServiceNode or null if not found</returns>
        public async Task<ServiceNode?> DiscoverAsync(string serviceName, string? @namespace, string? version, bool? proxy)
        {
            try
            {
                string url = $"{_registryUrl}/api/maxine/serviceops/discover?serviceName={serviceName}";
                if (@namespace != null) url += $"&namespace={@namespace}";
                if (version != null) url += $"&version={version}";
                if (proxy != null) url += $"&proxy={proxy}";

                HttpResponseMessage response = await _httpClient.GetAsync(url);
                if (response.IsSuccessStatusCode)
                {
                    string json = await response.Content.ReadAsStringAsync();
                    var node = JsonSerializer.Deserialize<ServiceNode>(json);
                    return node;
                }
                else
                {
                    Console.WriteLine($"Service discovery failed for {serviceName}: {response.StatusCode}");
                    return null;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error discovering service {serviceName}: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Discover a service node via UDP for ultra-fast lookups
        /// </summary>
        /// <param name="serviceName">The service name to discover</param>
        /// <param name="udpPort">The UDP port of the Maxine server</param>
        /// <param name="udpHost">The UDP host of the Maxine server</param>
        /// <returns>ServiceNode or null if not found</returns>
        public async Task<ServiceNode?> DiscoverUDPAsync(string serviceName, int udpPort = 8081, string udpHost = "localhost")
        {
            try
            {
                using var udpClient = new System.Net.Sockets.UdpClient();
                udpClient.Client.ReceiveTimeout = 1000; // 1 second timeout
                var sendBytes = System.Text.Encoding.UTF8.GetBytes(serviceName);
                await udpClient.SendAsync(sendBytes, sendBytes.Length, udpHost, udpPort);

                var receiveResult = await udpClient.ReceiveAsync();
                var response = System.Text.Encoding.UTF8.GetString(receiveResult.Buffer);
                var node = System.Text.Json.JsonSerializer.Deserialize<ServiceNode>(response);
                return node;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error discovering service {serviceName} via UDP: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Discover a service node via TCP for ultra-fast lookups
        /// </summary>
        /// <param name="serviceName">The service name to discover</param>
        /// <param name="tcpPort">The TCP port of the Maxine server</param>
        /// <param name="tcpHost">The TCP host of the Maxine server</param>
        /// <returns>ServiceNode or null if not found</returns>
        public async Task<ServiceNode?> DiscoverTCPAsync(string serviceName, int tcpPort = 8082, string tcpHost = "localhost")
        {
            try
            {
                using var tcpClient = new System.Net.Sockets.TcpClient();
                await tcpClient.ConnectAsync(tcpHost, tcpPort);
                tcpClient.ReceiveTimeout = 1000; // 1 second timeout

                var stream = tcpClient.GetStream();
                var sendBytes = System.Text.Encoding.UTF8.GetBytes(serviceName + "\n");
                await stream.WriteAsync(sendBytes, 0, sendBytes.Length);

                var buffer = new byte[1024];
                var bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length);
                var response = System.Text.Encoding.UTF8.GetString(buffer, 0, bytesRead).Trim();
                var node = System.Text.Json.JsonSerializer.Deserialize<ServiceNode>(response);
                return node;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error discovering service {serviceName} via TCP: {ex.Message}");
                return null;
            }
        }

        public void Dispose()
        {
            _httpClient.Dispose();
        }
    }

    /// <summary>
    /// Service node representation
    /// </summary>
    public class ServiceNode
    {
        public string Address { get; set; } = "";
        public string NodeName { get; set; } = "";

        public override string ToString()
        {
            return $"ServiceNode{{Address='{Address}', NodeName='{NodeName}'}}";
        }
    }
}