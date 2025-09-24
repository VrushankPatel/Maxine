const config = require('../config/config');
const { serviceRegistry } = require('../entity/service-registry');
const { consoleLog, consoleError } = require('../util/logging/logging-util');

if (config.mqttEnabled) {
    const mqtt = require('mqtt');
    const client = mqtt.connect(config.mqttBroker);

    client.on('connect', () => {
        consoleLog('MQTT service discovery client connected');
        // Subscribe to discovery requests
        client.subscribe('maxine/discovery/request', { qos: 1 });
    });

    client.on('message', async (topic, message) => {
        try {
            if (topic === 'maxine/discovery/request') {
                const { serviceName } = JSON.parse(message.toString());
                const node = await serviceRegistry.ultraFastGetRandomNode(serviceName);
                if (node) {
                    client.publish('maxine/discovery/response', JSON.stringify({
                        serviceName,
                        address: node.address,
                        nodeName: node.nodeName
                    }), { qos: 1 });
                }
            }
        } catch (err) {
            consoleError('MQTT message error:', err);
        }
    });

    client.on('error', (err) => {
        consoleError('MQTT service error:', err);
    });

    // Publish registry changes
    serviceRegistry.on('change', (change) => {
        client.publish('maxine/registry/changes', JSON.stringify(change), { qos: 1 }, (err) => {
            if (err) consoleError('MQTT publish error:', err);
        });
    });

    module.exports = client;
} else {
    module.exports = null;
}