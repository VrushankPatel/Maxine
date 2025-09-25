const config = require('../../config/config');
const { serviceRegistry: registry } = require('../../entity/service-registry');

// Simple ML-inspired fault injection based on service metrics
const predictFaultInjection = (serviceName) => {
  const nodes = registry.getNodes(serviceName);
  if (!nodes || Object.keys(nodes).length === 0) return null;

  let totalRequests = 0;
  let totalErrors = 0;
  let totalLatency = 0;
  let nodeCount = 0;

  for (const [nodeId, node] of Object.entries(nodes)) {
    const metrics = node.metrics || {};
    totalRequests += metrics.requests || 0;
    totalErrors += metrics.errors || 0;
    totalLatency += metrics.avgResponseTime || 0;
    nodeCount++;
  }

  if (totalRequests === 0) return null;

  const errorRate = totalErrors / totalRequests;
  const avgLatency = totalLatency / nodeCount;

  // ML-inspired: predict failure probability based on error rate and latency
  // Using simple logistic regression-like formula
  const failureProbability = Math.min(
    1,
    Math.max(0, errorRate * 2 + (avgLatency > 1000 ? 0.3 : 0) + (nodeCount < 2 ? 0.2 : 0))
  );

  return {
    serviceName,
    failureProbability,
    errorRate,
    avgLatency,
    nodeCount,
    recommendedAction:
      failureProbability > 0.7
        ? 'inject_failure'
        : failureProbability > 0.4
          ? 'inject_latency'
          : 'monitor',
  };
};

const injectLatency = (req, res) => {
  const { serviceName, delay, auto = false } = req.body;
  if (!serviceName || (!delay && !auto)) {
    return res.status(400).json({ error: 'serviceName and delay required, or auto=true' });
  }

  let finalDelay = delay;
  if (auto) {
    const prediction = predictFaultInjection(serviceName);
    if (prediction && prediction.recommendedAction === 'inject_latency') {
      finalDelay = Math.min(5000, Math.max(100, prediction.avgLatency * 2)); // 2x current latency
    } else {
      return res.status(400).json({ error: 'Auto-injection not recommended for this service' });
    }
  }

  registry.injectLatency(serviceName, parseInt(finalDelay));
  res.json({
    success: true,
    message: `Latency ${finalDelay}ms injected for ${serviceName}`,
    autoInjected: auto,
  });
};

const injectFailure = (req, res) => {
  const { serviceName, rate, auto = false } = req.body;
  if (!serviceName || (rate === undefined && !auto)) {
    return res.status(400).json({ error: 'serviceName and rate required, or auto=true' });
  }

  let finalRate = rate;
  if (auto) {
    const prediction = predictFaultInjection(serviceName);
    if (prediction && prediction.recommendedAction === 'inject_failure') {
      finalRate = Math.min(0.5, prediction.failureProbability); // Cap at 50%
    } else {
      return res.status(400).json({ error: 'Auto-injection not recommended for this service' });
    }
  }

  registry.injectFailure(serviceName, parseFloat(finalRate));
  res.json({
    success: true,
    message: `Failure rate ${finalRate} injected for ${serviceName}`,
    autoInjected: auto,
  });
};

const injectNetworkPartition = (req, res) => {
  const { serviceName, duration = 30000 } = req.body; // 30 seconds default
  if (!serviceName) {
    return res.status(400).json({ error: 'serviceName required' });
  }

  // Simulate network partition by marking all nodes as unreachable
  const nodes = registry.getNodes(serviceName);
  if (!nodes) {
    return res.status(404).json({ error: 'Service not found' });
  }

  registry.injectNetworkPartition(serviceName, parseInt(duration));
  res.json({
    success: true,
    message: `Network partition injected for ${serviceName} for ${duration}ms`,
    affectedNodes: Object.keys(nodes).length,
  });
};

const runChaosExperiment = (req, res) => {
  const { serviceName, experimentType = 'comprehensive', duration = 60000 } = req.body;
  if (!serviceName) {
    return res.status(400).json({ error: 'serviceName required' });
  }

  const experiment = {
    id: `chaos_${Date.now()}`,
    serviceName,
    type: experimentType,
    startTime: Date.now(),
    duration: parseInt(duration),
    phases: [],
  };

  // Phase 1: Baseline monitoring
  experiment.phases.push({ name: 'baseline', duration: 10000, actions: [] });

  // Phase 2: Fault injection based on ML prediction
  const prediction = predictFaultInjection(serviceName);
  if (prediction) {
    if (prediction.recommendedAction === 'inject_failure') {
      experiment.phases.push({
        name: 'failure_injection',
        duration: duration * 0.3,
        actions: [{ type: 'inject_failure', rate: Math.min(0.3, prediction.failureProbability) }],
      });
    } else if (prediction.recommendedAction === 'inject_latency') {
      experiment.phases.push({
        name: 'latency_injection',
        duration: duration * 0.3,
        actions: [{ type: 'inject_latency', delay: Math.min(2000, prediction.avgLatency * 1.5) }],
      });
    }
  }

  // Phase 3: Network partition
  experiment.phases.push({
    name: 'network_partition',
    duration: duration * 0.2,
    actions: [{ type: 'network_partition', duration: duration * 0.2 }],
  });

  // Phase 4: Recovery validation
  experiment.phases.push({ name: 'recovery', duration: duration * 0.4, actions: [] });

  registry.startChaosExperiment(experiment);
  res.json({
    success: true,
    experiment,
    message: `Chaos experiment started for ${serviceName}`,
  });
};

const getChaosExperiments = (req, res) => {
  const experiments = registry.getChaosExperiments();
  res.json(experiments);
};

const stopChaosExperiment = (req, res) => {
  const { experimentId } = req.params;
  const result = registry.stopChaosExperiment(experimentId);
  if (!result) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  res.json({ success: true, experiment: result });
};

const resetChaos = (req, res) => {
  const { serviceName } = req.body;
  registry.resetChaos(serviceName);
  res.json({ success: true, message: 'Chaos reset' });
};

const getChaosStatus = (req, res) => {
  const status = registry.getChaosStatus();
  const predictions = {};

  // Generate predictions for all services
  const services = registry.getAllServices ? registry.getAllServices() : [];
  for (const serviceName of services) {
    const prediction = predictFaultInjection(serviceName);
    if (prediction) {
      predictions[serviceName] = prediction;
    }
  }

  res.json({ ...status, predictions });
};

module.exports = {
  injectLatency,
  injectFailure,
  injectNetworkPartition,
  runChaosExperiment,
  getChaosExperiments,
  stopChaosExperiment,
  resetChaos,
  getChaosStatus,
};
