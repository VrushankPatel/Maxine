const AWS = require('aws-sdk');
const { serviceRegistry } = require('../entity/service-registry');
const { registryService } = require('./registry-service');
const config = require('../config/config');

class EcsService {
    constructor() {
        if (!config.ecsEnabled) return;

        this.ecs = new AWS.ECS({ region: process.env.AWS_REGION || 'us-east-1' });
        this.ec2 = new AWS.EC2({ region: process.env.AWS_REGION || 'us-east-1' });
        this.registeredServices = new Map(); // ecs service arn -> maxine service name

        this.watchServices();
    }

    async watchServices() {
        // Poll for services every 30 seconds
        setInterval(async () => {
            try {
                await this.updateServices();
            } catch (err) {
                console.error('Error updating ECS services:', err);
            }
        }, 30000);
    }

    async updateServices() {
        const clusters = await this.ecs.listClusters().promise();
        for (const clusterArn of clusters.clusterArns) {
            const services = await this.ecs.listServices({ cluster: clusterArn }).promise();
            for (const serviceArn of services.serviceArns) {
                const serviceDesc = await this.ecs.describeServices({ cluster: clusterArn, services: [serviceArn] }).promise();
                const service = serviceDesc.services[0];
                if (service) {
                    await this.registerEcsService(service, clusterArn);
                }
            }
        }
    }

    async registerEcsService(ecsService, clusterArn) {
        const serviceArn = ecsService.serviceArn;
        const maxineServiceName = `ecs-${ecsService.serviceName}`;
        this.registeredServices.set(serviceArn, maxineServiceName);

        // Get tasks
        const tasks = await this.ecs.listTasks({ cluster: clusterArn, serviceName: ecsService.serviceName }).promise();
        if (tasks.taskArns.length > 0) {
            const taskDesc = await this.ecs.describeTasks({ cluster: clusterArn, tasks: tasks.taskArns }).promise();
            for (const task of taskDesc.tasks) {
                await this.registerTask(task, maxineServiceName, clusterArn);
            }
        }
    }

    async registerTask(task, maxineServiceName, clusterArn) {
        // Get ENI for task
        const eniId = task.attachments.find(att => att.type === 'ElasticNetworkInterface')?.details.find(d => d.name === 'networkInterfaceId')?.value;
        if (eniId) {
            const eniDesc = await this.ec2.describeNetworkInterfaces({ NetworkInterfaceIds: [eniId] }).promise();
            const eni = eniDesc.NetworkInterfaces[0];
            if (eni && eni.PrivateIpAddress) {
                const port = 80; // Default, or get from task definition
                const nodeName = `${eni.PrivateIpAddress}:${port}`;
                const fullAddress = `http://${eni.PrivateIpAddress}:${port}`;

                registryService.registryService({
                    serviceName: maxineServiceName,
                    nodeName,
                    address: fullAddress,
                    timeOut: 30,
                    weight: 1,
                    metadata: {
                        ecs: true,
                        cluster: clusterArn,
                        taskArn: task.taskArn,
                        taskDefinition: task.taskDefinitionArn
                    },
                    aliases: []
                });
            }
        }
    }
}

const ecsService = new EcsService();

module.exports = {
    ecsService
};