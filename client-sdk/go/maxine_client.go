package maxine

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"time"
)

type MaxineClient struct {
	BaseURL string
}

type ServiceNode struct {
	NodeName string `json:"nodeName"`
	Address  string `json:"address"`
}

type RegisterPayload struct {
	ServiceName string                 `json:"serviceName"`
	NodeName    string                 `json:"nodeName"`
	HostName    string                 `json:"hostName"`
	Port        int                    `json:"port"`
	Weight      int                    `json:"weight,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

func NewMaxineClient(baseURL string) *MaxineClient {
	return &MaxineClient{BaseURL: baseURL}
}

func (c *MaxineClient) Register(payload RegisterPayload) error {
	url := c.BaseURL + "/api/maxine/serviceops/register"
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(data))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := ioutil.ReadAll(resp.Body)
		return fmt.Errorf("registration failed: %s", string(body))
	}
	return nil
}

func (c *MaxineClient) Discover(serviceName string) (*ServiceNode, error) {
	url := c.BaseURL + "/api/maxine/serviceops/discover?serviceName=" + serviceName + "&proxy=false"
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("discovery failed: %s", string(body))
	}
	var node ServiceNode
	err = json.NewDecoder(resp.Body).Decode(&node)
	return &node, err
}

func (c *MaxineClient) DiscoverUDP(serviceName string, udpPort int, udpHost string) (*ServiceNode, error) {
	conn, err := net.Dial("udp", fmt.Sprintf("%s:%d", udpHost, udpPort))
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	_, err = conn.Write([]byte(serviceName))
	if err != nil {
		return nil, err
	}
	buffer := make([]byte, 1024)
	n, err := conn.Read(buffer)
	if err != nil {
		return nil, err
	}
	var node ServiceNode
	err = json.Unmarshal(buffer[:n], &node)
	return &node, err
}

func (c *MaxineClient) DiscoverTCP(serviceName string, tcpPort int, tcpHost string) (*ServiceNode, error) {
	conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", tcpHost, tcpPort))
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	_, err = conn.Write([]byte(serviceName + "\n"))
	if err != nil {
		return nil, err
	}
	buffer := make([]byte, 1024)
	n, err := conn.Read(buffer)
	if err != nil {
		return nil, err
	}
	var node ServiceNode
	err = json.Unmarshal(bytes.TrimSpace(buffer[:n]), &node)
	return &node, err
}

func (c *MaxineClient) Deregister(serviceName, nodeName string) error {
	url := c.BaseURL + "/api/maxine/serviceops/deregister"
	payload := map[string]string{"serviceName": serviceName, "nodeName": nodeName}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("DELETE", url, bytes.NewBuffer(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := ioutil.ReadAll(resp.Body)
		return fmt.Errorf("deregistration failed: %s", string(body))
	}
	return nil
}

func (c *MaxineClient) SendHeartbeat(payload RegisterPayload) {
	go func() {
		for {
			err := c.Register(payload)
			if err != nil {
				fmt.Printf("Heartbeat failed: %v\n", err)
			}
			time.Sleep(5 * time.Second)
		}
	}()
}
