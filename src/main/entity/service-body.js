const config = require('../config/config');
const { statusAndMsgs, constants } = require('../util/constants/constants');
const { error } = require('../util/logging/logging-util');

class Service {
  hostName;
  nodeName;
  serviceName;
  version;
  namespace;
  region;
  zone;
  datacenter;
  tenantId;
  timeOut;
  weight;
  address;
  metadata;

  static buildByObj(obj) {
    let {
      host,
      hostName,
      nodeName,
      port,
      serviceName,
      version,
      namespace,
      region,
      zone,
      datacenter,
      tenantId,
      timeOut,
      weight,
      ssl,
      path,
      metadata,
      aliases,
      apiSpec,
    } = obj;
    const service = new Service();
    service.hostName = host || hostName;
    service.nodeName = nodeName;
    service.serviceName = serviceName;
    service.version = version;
    service.namespace = namespace || 'default';
    service.region = region || 'default';
    service.zone = zone || 'default';
    service.datacenter = datacenter || 'default';
    service.tenantId = tenantId || 'default';
    service.timeOut = Math.abs(parseInt(timeOut)) || config.heartBeatTimeout;
    service.weight = Math.abs(parseInt(weight)) || 1;
    service.metadata = metadata || {};
    service.aliases = aliases || [];
    service.apiSpec = apiSpec;
    hostName = hostName || '';
    port = port === undefined || (typeof port === 'string' && !port) ? '' : `:${port}`;
    path = path || '';
    path = path[0] === '/' ? path : '/' + path;
    path = path[path.length - 1] == '/' ? path.slice(0, path.length - 1) : path;
    const httpOrS = ssl ? 'https://' : 'http://';
    const prefix = hostName.startsWith('http://') || hostName.startsWith('https://') ? '' : httpOrS;
    service.address = `${prefix}${hostName}${port}${path ? path : ''}`;
    return service.validate();
  }

  validate() {
    const areNotStrings = !(
      typeof this.hostName === 'string' &&
      typeof this.nodeName === 'string' &&
      typeof this.serviceName === 'string'
    );
    const isInvalidWeight = this.weight > constants.MAX_SERVER_WEIGHT;
    const areInvalidStrings = !this.serviceName || !this.hostName || !this.nodeName;
    if (areNotStrings || isInvalidWeight || areInvalidStrings) {
      error(statusAndMsgs.MSG_INVALID_SERVICE_DATA);
      return;
    }

    // Advanced validation for metadata
    if (this.metadata) {
      // Validate tags: must be array of strings
      if (this.metadata.tags !== undefined) {
        if (
          !Array.isArray(this.metadata.tags) ||
          !this.metadata.tags.every((tag) => typeof tag === 'string')
        ) {
          error('Invalid metadata.tags: must be an array of strings');
          return;
        }
      }

      // Validate healthCheck: must have url, interval, timeout
      if (this.metadata.healthCheck !== undefined) {
        const hc = this.metadata.healthCheck;
        if (typeof hc !== 'object' || !hc.url || typeof hc.url !== 'string') {
          error('Invalid metadata.healthCheck: must be an object with url string');
          return;
        }
        if (hc.interval !== undefined && (typeof hc.interval !== 'number' || hc.interval <= 0)) {
          error('Invalid metadata.healthCheck.interval: must be a positive number');
          return;
        }
        if (hc.timeout !== undefined && (typeof hc.timeout !== 'number' || hc.timeout <= 0)) {
          error('Invalid metadata.healthCheck.timeout: must be a positive number');
          return;
        }
      }

      // Validate version: must be semver compatible
      if (this.metadata.version !== undefined) {
        const semverRegex = /^\d+\.\d+\.\d+(-[\w\.\-]+)?(\+[\w\.\-]+)?$/;
        if (typeof this.metadata.version !== 'string' || !semverRegex.test(this.metadata.version)) {
          error('Invalid metadata.version: must be a valid semver string');
          return;
        }
      }

      // Validate weight: must be positive number
      if (this.metadata.weight !== undefined) {
        if (typeof this.metadata.weight !== 'number' || this.metadata.weight <= 0) {
          error('Invalid metadata.weight: must be a positive number');
          return;
        }
      }
    }

    return this;
  }
}

module.exports = Service;
