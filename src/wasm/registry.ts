// WebAssembly Service Registry

let currentTime: f64 = 0;

export function setCurrentTime(time: f64): void {
  currentTime = time;
}

let services: Map<string, string[]> = new Map();
let instances: Map<string, string> = new Map();
let heartbeats: Map<string, f64> = new Map();
let allInstances: string[] = [];
let serviceNames: string[] = [];

export function register(
  serviceName: string,
  instanceId: string,
  address: string,
  port: i32
): boolean {
  if (heartbeats.has(instanceId)) {
    return false;
  }
  if (!services.has(serviceName)) {
    services.set(serviceName, []);
    serviceNames.push(serviceName);
  }
  services.get(serviceName).push(instanceId);
  allInstances.push(instanceId);
  instances.set(instanceId, address + ':' + port.toString());
  heartbeats.set(instanceId, currentTime);
  return true;
}

export function discover(serviceName: string): string {
  if (!services.has(serviceName)) {
    return '';
  }
  const ids = services.get(serviceName);
  let result = '';
  for (let i = 0, len = ids.length; i < len; i++) {
    if (i > 0) result += ',';
    result += instances.get(ids[i]);
  }
  return result;
}

export function heartbeat(instanceId: string): boolean {
  if (!heartbeats.has(instanceId)) {
    return false;
  }
  heartbeats.set(instanceId, currentTime);
  return true;
}

export function deregister(serviceName: string, instanceId: string): boolean {
  if (!services.has(serviceName) || !heartbeats.has(instanceId)) {
    return false;
  }
  const ids = services.get(serviceName);
  const index = ids.indexOf(instanceId);
  if (index == -1) return false;
  ids.splice(index, 1);
  if (ids.length == 0) {
    services.delete(serviceName);
    const sIndex = serviceNames.indexOf(serviceName);
    if (sIndex != -1) serviceNames.splice(sIndex, 1);
  }
  const aIndex = allInstances.indexOf(instanceId);
  if (aIndex != -1) allInstances.splice(aIndex, 1);
  instances.delete(instanceId);
  heartbeats.delete(instanceId);
  return true;
}

export function cleanup(timeoutMs: f64): void {
  for (let i = allInstances.length - 1; i >= 0; i--) {
    const id = allInstances[i];
    if (currentTime - heartbeats.get(id) > timeoutMs) {
      allInstances.splice(i, 1);
      instances.delete(id);
      heartbeats.delete(id);
      // remove from services
      for (let j = 0; j < serviceNames.length; j++) {
        const service = serviceNames[j];
        const ids = services.get(service);
        const index = ids.indexOf(id);
        if (index != -1) {
          ids.splice(index, 1);
          if (ids.length == 0) {
            services.delete(service);
            serviceNames.splice(j, 1);
            j--;
          }
          break;
        }
      }
    }
  }
}

export function getServiceCount(): i32 {
  return serviceNames.length;
}

export function getInstanceCount(serviceName: string): i32 {
  return services.has(serviceName) ? services.get(serviceName).length : 0;
}
