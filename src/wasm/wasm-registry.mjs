import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let exports = null;

async function loadExports() {
  if (!exports) {
    exports = await import('./build/registry.mjs');
  }
  return exports;
}

class WasmRegistry {
  async init() {
    this.exports = await loadExports();
  }

  setCurrentTime(time) {
    this.exports.setCurrentTime(time);
  }

  register(serviceName, instanceId, address, port) {
    return this.exports.register(serviceName, instanceId, address, port);
  }

  discover(serviceName) {
    const str = this.exports.discover(serviceName);
    return str ? str.split(',') : [];
  }

  heartbeat(instanceId) {
    return this.exports.heartbeat(instanceId);
  }

  deregister(serviceName, instanceId) {
    return this.exports.deregister(serviceName, instanceId);
  }

  cleanup(timeoutMs) {
    this.exports.cleanup(timeoutMs);
  }

  getServiceCount() {
    return this.exports.getServiceCount();
  }

  getInstanceCount(serviceName) {
    return this.exports.getInstanceCount(serviceName);
  }
}

export default WasmRegistry;
