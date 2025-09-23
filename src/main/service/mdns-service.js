const mdns = require('multicast-dns');
const { serviceRegistry } = require('../entity/service-registry');
const config = require('../config/config');

class MDNSService {
    constructor() {
        if (config.mdnsEnabled) {
            this.mdns = mdns();
            this.advertisedServices = new Set();
            this.startAdvertising();
        }
    }

    startAdvertising() {
        // Advertise all current services
        for (const [serviceName, service] of serviceRegistry.registry) {
            this.advertiseService(serviceName);
        }

        // Listen for registry changes to advertise new services
        serviceRegistry.addChange = (function(originalAddChange) {
            return function(type, serviceName, nodeName, data) {
                originalAddChange.call(serviceRegistry, type, serviceName, nodeName, data);
                if (type === 'register') {
                    this.advertiseService(serviceName);
                } else if (type === 'deregister') {
                    // Check if no more nodes for this service
                    const nodes = serviceRegistry.getNodes(serviceName);
                    if (!nodes || Object.keys(nodes).length === 0) {
                        this.unadvertiseService(serviceName);
                    }
                }
            }.bind(this);
        }.bind(this))(serviceRegistry.addChange);
    }

    advertiseService(serviceName) {
        if (this.advertisedServices.has(serviceName)) return;

        const nodes = serviceRegistry.getHealthyNodes(serviceName);
        if (nodes.length === 0) return;

        // Advertise the service with the first healthy node's address
        const node = nodes[0];
        const url = new URL(node.address);
        const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);

        this.mdns.on('query', (query) => {
            const questions = query.questions || [];
            for (const question of questions) {
                if (question.name === `_${serviceName}._tcp.local` && question.type === 'PTR') {
                    // Respond with service instance
                    this.mdns.respond({
                        answers: [{
                            name: `_${serviceName}._tcp.local`,
                            type: 'PTR',
                            data: `${serviceName}._${serviceName}._tcp.local`
                        }, {
                            name: `${serviceName}._${serviceName}._tcp.local`,
                            type: 'SRV',
                            data: {
                                priority: 0,
                                weight: 0,
                                port: port,
                                target: url.hostname
                            }
                        }, {
                            name: `${serviceName}._${serviceName}._tcp.local`,
                            type: 'TXT',
                            data: [`serviceName=${serviceName}`, `address=${node.address}`]
                        }]
                    });
                }
            }
        });

        this.advertisedServices.add(serviceName);
        console.log(`Advertised service ${serviceName} via mDNS`);
    }

    unadvertiseService(serviceName) {
        if (!this.advertisedServices.has(serviceName)) return;
        // mDNS doesn't have unadvertise, but we can stop responding
        this.advertisedServices.delete(serviceName);
        console.log(`Unadvertised service ${serviceName} via mDNS`);
    }
}

const mdnsService = new MDNSService();

module.exports = {
    mdnsService
};