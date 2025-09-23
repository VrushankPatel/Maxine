const AWS = require('aws-sdk');
const { serviceRegistry } = require('../entity/service-registry');
const { registryService } = require('./registry-service');
const config = require('../config/config');
const { consoleError } = require('../util/logging/logging-util');

class CloudMapService {
    constructor() {
        if (!config.cloudMapEnabled) return;

        this.cloudMap = new AWS.ServiceDiscovery({
            region: process.env.AWS_REGION || 'us-east-1'
        });

        this.discoverServices();
    }

    async discoverServices() {
        try {
            const namespaces = await this.cloudMap.listNamespaces().promise();
            for (const ns of namespaces.Namespaces || []) {
                const services = await this.cloudMap.listServices({ NamespaceId: ns.Id }).promise();
                for (const service of services.Services || []) {
                    await this.registerCloudMapService(service, ns);
                }
            }
        } catch (err) {
            consoleError('Error discovering CloudMap services:', err);
        }
    }

    async registerCloudMapService(service, namespace) {
        try {
            const instances = await this.cloudMap.listInstances({
                ServiceId: service.Id,
                NamespaceId: namespace.Id
            }).promise();

            for (const instance of instances.Instances || []) {
                const nodeName = `${service.Name}-${instance.Id}`;
                const address = instance.Attributes.IPv4 || instance.Attributes.IPv6 || 'unknown';
                const port = instance.Attributes.Port || 80;
                const fullAddress = `${address}:${port}`;

                await registryService.register({
                    serviceName: service.Name,
                    nodeName,
                    hostName: address,
                    port: parseInt(port),
                    weight: 1,
                    metadata: {
                        source: 'cloudmap',
                        namespace: namespace.Name,
                        attributes: instance.Attributes
                    }
                });
            }
        } catch (err) {
            consoleError('Error registering CloudMap service:', err);
        }
    }
}

module.exports = CloudMapService;