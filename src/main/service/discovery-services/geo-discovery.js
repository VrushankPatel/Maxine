const { serviceRegistry } = require("../../entity/service-registry");
const geoip = require('geoip-lite');

class GeoDiscovery {
    /**
     * Retrieve a node based on geographical location for lowest latency
     * @param {string} serviceName
     * @param {string} ip
     * @param {string} group
     * @param {array} tags
     * @returns {object}
     */
    getNode = (fullServiceName, ip, group, tags, deployment, filter) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment, filter, advancedFilters);
        if (healthyNodes.length === 0) return null;

        // If IP is provided, try to find the closest node geographically
        if (ip) {
            const clientGeo = this.getGeoFromIP(ip);
            if (clientGeo) {
                let closestNode = null;
                let minDistance = Infinity;

                for (const node of healthyNodes) {
                    const nodeGeo = node.metadata.geo || this.getGeoFromIP(node.address.split(':')[0]) || { lat: 0, lon: 0 };
                    const distance = this.calculateDistance(clientGeo, nodeGeo);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestNode = node;
                    }
                }
                return closestNode || healthyNodes[0];
            }
        }

        // Fallback to random if no IP or geo data
        const randomIndex = Math.floor(Math.random() * healthyNodes.length);
        return healthyNodes[randomIndex];
    }

    getGeoFromIP = (ip) => {
        try {
            const geo = geoip.lookup(ip);
            if (geo) {
                return { lat: geo.ll[0], lon: geo.ll[1] };
            }
        } catch (err) {
            // Ignore errors
        }
        return null;
    }

    calculateDistance = (geo1, geo2) => {
        // Haversine formula for distance
        const R = 6371; // Earth's radius in km
        const dLat = (geo2.lat - geo1.lat) * Math.PI / 180;
        const dLon = (geo2.lon - geo1.lon) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(geo1.lat * Math.PI / 180) * Math.cos(geo2.lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    invalidateCache = (fullServiceName) => {
        // No cache
    }
}

module.exports = {
    GeoDiscovery
}