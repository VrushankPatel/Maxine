class DependencyService {
  constructor() {
    this.dependencies = new Map(); // serviceName -> Set of dependent services
    this.reverseDependencies = new Map(); // serviceName -> Set of services it depends on
  }

  addDependency(serviceName, dependsOn) {
    if (!this.dependencies.has(serviceName)) {
      this.dependencies.set(serviceName, new Set());
    }
    this.dependencies.get(serviceName).add(dependsOn);

    if (!this.reverseDependencies.has(dependsOn)) {
      this.reverseDependencies.set(dependsOn, new Set());
    }
    this.reverseDependencies.get(dependsOn).add(serviceName);
  }

  removeDependency(serviceName, dependsOn) {
    if (this.dependencies.has(serviceName)) {
      this.dependencies.get(serviceName).delete(dependsOn);
    }
    if (this.reverseDependencies.has(dependsOn)) {
      this.reverseDependencies.get(dependsOn).delete(serviceName);
    }
  }

  getDependencies(serviceName) {
    return Array.from(this.dependencies.get(serviceName) || []);
  }

  getDependents(serviceName) {
    return Array.from(this.reverseDependencies.get(serviceName) || []);
  }

  detectCircularDependencies() {
    const visited = new Set();
    const recStack = new Set();
    const cycles = [];

    const dfs = (node, path) => {
      if (recStack.has(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push(path.slice(cycleStart));
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      recStack.add(node);
      path.push(node);

      const deps = this.dependencies.get(node) || [];
      for (const dep of deps) {
        dfs(dep, [...path]);
      }

      path.pop();
      recStack.delete(node);
    };

    for (const service of this.dependencies.keys()) {
      if (!visited.has(service)) {
        dfs(service, []);
      }
    }

    return cycles;
  }

  getDependencyGraph() {
    const graph = {};
    for (const [service, deps] of this.dependencies) {
      graph[service] = Array.from(deps);
    }
    return graph;
  }
}

const dependencyService = new DependencyService();

module.exports = {
  dependencyService,
};
