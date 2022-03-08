var JsonBuilder = require("../builders/json-builder");
var { statusAndMsgs } = require("../util/constants/constants");
var { logUtil } = require("../util/logging/logging-util");

class RegistryService {
    serviceRegistry = {};
    timeResetters = {};
    registryService = (serviceName, nodeName, address, timeOut, weight) => {

        serviceName = serviceName.toUpperCase();
        nodeName = nodeName.toUpperCase();
        const id = Date.now().toString(36);

        if (!this.serviceRegistry[serviceName]) {
            this.serviceRegistry[serviceName] = {
                offset: 0,
                nodes: {}
            };
        }

        if (this.serviceRegistry[serviceName]["nodes"][nodeName]) {
            clearTimeout(this.timeResetters[this.serviceRegistry[serviceName]["nodes"][nodeName]["id"]]);
        }

        [...Array(weight).keys()].forEach(index => {
            const tempNodeName = `${nodeName}-${index}`;
            this.serviceRegistry[serviceName]["nodes"][tempNodeName] = {
                "nodeName": tempNodeName,
                "address": address,
                "id": id,
                "timeOut": timeOut,
                "registeredAt": new Date().toLocaleString()
            }
            const timeResetter = setTimeout(() => {
                logUtil.info(this.getServiceInfoIson(serviceName, tempNodeName, statusAndMsgs.MSG_SERVICE_REMOVED));
                delete this.serviceRegistry[serviceName]["nodes"][tempNodeName];
                if (Object.keys(this.serviceRegistry[serviceName]["nodes"]).length === 0) {
                    delete this.serviceRegistry[serviceName];
                }
            }, ((timeOut) * 1000) + 500);

            this.timeResetters[id] = timeResetter;
        });

        return this.serviceRegistry[serviceName]["nodes"];
    }

    getCurrentlyRegisteredServers = () => this.serviceRegistry;

    getServers = (serviceName) => {
        return this.serviceRegistry[serviceName];
    }

    getNodes = (serviceName) => {
        const servers = this.getServers(serviceName) || {};
        return servers["nodes"];
    }

    getOffsetAndIncrement = (serviceName) => {
        const servers = this.getServers(serviceName) || {};
        return servers["offset"]++;
    }

    getNode = (serviceName) => {
        const nodes = this.getNodes(serviceName) || {};
        const offset = this.getOffsetAndIncrement(serviceName) || 0;
        const keys = Object.keys(nodes);
        const key = keys[offset % keys.length];
        return nodes[key];
    }

    getServiceInfoIson = (serviceName, nodeName, status) => {
        return JsonBuilder.createNewJson()
            .put("Status", status)
            .put(serviceName, JsonBuilder.createNewJson()
                .put(nodeName, this.serviceRegistry[serviceName]["nodes"][nodeName])
                .getJson())
            .getJson();
    }
}

export const registryService = new RegistryService();