const { dependencyService } = require('../service/dependency-service');
const { statusAndMsgs } = require('../util/constants/constants');

const addDependency = (req, res) => {
  const { serviceName, dependsOn } = req.body;
  if (!serviceName || !dependsOn) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName and dependsOn are required' });
  }
  dependencyService.addDependency(serviceName, dependsOn);
  res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: 'Dependency added successfully' });
};

const removeDependency = (req, res) => {
  const { serviceName, dependsOn } = req.body;
  if (!serviceName || !dependsOn) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName and dependsOn are required' });
  }
  dependencyService.removeDependency(serviceName, dependsOn);
  res.status(statusAndMsgs.STATUS_SUCCESS).json({ message: 'Dependency removed successfully' });
};

const getDependencies = (req, res) => {
  const { serviceName } = req.query;
  if (!serviceName) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName is required' });
  }
  const deps = dependencyService.getDependencies(serviceName);
  res.status(statusAndMsgs.STATUS_SUCCESS).json({ dependencies: deps });
};

const getDependents = (req, res) => {
  const { serviceName } = req.query;
  if (!serviceName) {
    return res
      .status(statusAndMsgs.STATUS_GENERIC_ERROR)
      .json({ message: 'serviceName is required' });
  }
  const deps = dependencyService.getDependents(serviceName);
  res.status(statusAndMsgs.STATUS_SUCCESS).json({ dependents: deps });
};

const getDependencyGraph = (req, res) => {
  const graph = dependencyService.getDependencyGraph();
  res.status(statusAndMsgs.STATUS_SUCCESS).json({ graph });
};

const detectCycles = (req, res) => {
  const cycles = dependencyService.detectCircularDependencies();
  res.status(statusAndMsgs.STATUS_SUCCESS).json({ cycles });
};

module.exports = {
  addDependency,
  removeDependency,
  getDependencies,
  getDependents,
  getDependencyGraph,
  detectCycles,
};
