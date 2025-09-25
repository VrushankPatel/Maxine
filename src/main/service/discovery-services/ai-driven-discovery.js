const { serviceRegistry } = require('../../entity/service-registry');

class AiDrivenDiscovery {
  constructor() {
    // Q-learning parameters
    this.alpha = 0.1; // Learning rate
    this.gamma = 0.9; // Discount factor
    this.epsilon = 0.1; // Exploration rate
    this.qTable = new Map(); // state -> {action: qValue}
    this.rewardHistory = new Map(); // nodeId -> recent rewards
    this.maxHistorySize = 100;
    this.cache = new Map(); // serviceName -> {node, timestamp}
    this.cacheTTL = 30000; // 30 seconds
    this.lastSelections = new Map(); // clientId -> {state, action, nodeId, timestamp}
  }

  invalidateCache = (fullServiceName) => {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${fullServiceName}:`)) {
        this.cache.delete(key);
      }
    }
  };

  /**
   * AI-driven node selection using reinforcement learning
   * Learns optimal node selection based on response times and success rates
   * @param {string} serviceName
   * @param {string} group
   * @param {array} tags
   * @param {string} deployment
   * @param {string} filter
   * @param {string} clientId - Client identifier for personalized learning
   * @returns {object}
   */
  getNode = (fullServiceName, group, tags, deployment, filter, clientId, advancedFilters) => {
    const healthyNodes = serviceRegistry.getHealthyNodes(
      fullServiceName,
      group,
      tags,
      deployment,
      filter,
      advancedFilters
    );
    if (healthyNodes.length === 0) return null;

    const cacheKey = `${fullServiceName}:${clientId || 'default'}:${group || ''}:${tags ? tags.sort().join(',') : ''}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.node;
    }

    // Create state representation
    const state = this.createState(fullServiceName, clientId, healthyNodes);

    // Choose action using epsilon-greedy policy
    const action = this.chooseAction(state, healthyNodes);

    const selectedNode = healthyNodes[action];

    // Store last selection for learning
    this.lastSelections.set(clientId || 'default', {
      state,
      action,
      nodeId: selectedNode.nodeName,
      serviceName: fullServiceName,
      timestamp: Date.now(),
    });

    // Cache the result
    this.cache.set(cacheKey, {
      node: selectedNode,
      timestamp: Date.now(),
    });

    return selectedNode;
  };

  /**
   * Create state representation for Q-learning
   */
  createState(serviceName, clientId, healthyNodes) {
    // State includes service name, client ID, and node health summary
    const nodeHealthSummary = healthyNodes.map((node) => ({
      nodeId: node.nodeName,
      healthScore: serviceRegistry.getHealthScore(serviceName, node.nodeName) || 50,
      responseTime: this.getAverageResponseTime(node.nodeName) || 100,
    }));

    return `${serviceName}:${clientId || 'default'}:${nodeHealthSummary.map((n) => `${n.nodeId}:${n.healthScore}:${n.responseTime}`).join('|')}`;
  }

  /**
   * Choose action using epsilon-greedy policy
   */
  chooseAction(state, healthyNodes) {
    if (Math.random() < this.epsilon) {
      // Explore: random selection
      return Math.floor(Math.random() * healthyNodes.length);
    } else {
      // Exploit: choose best action based on Q-values
      return this.getBestAction(state, healthyNodes.length);
    }
  }

  /**
   * Get the best action (node index) based on Q-values
   */
  getBestAction(state, numActions) {
    if (!this.qTable.has(state)) {
      // Initialize Q-values for new state
      this.qTable.set(state, new Array(numActions).fill(0));
    }

    const qValues = this.qTable.get(state);
    let bestAction = 0;
    let bestValue = qValues[0];

    for (let i = 1; i < qValues.length; i++) {
      if (qValues[i] > bestValue) {
        bestValue = qValues[i];
        bestAction = i;
      }
    }

    return bestAction;
  }

  /**
   * Update Q-values based on reward (response time and success)
   * @param {string} nodeId - The node that was selected
   * @param {number} responseTime - Response time in ms
   * @param {boolean} success - Whether the request was successful
   * @param {string} serviceName
   * @param {string} clientId
   */
  updateQValue(nodeId, responseTime, success, serviceName, clientId) {
    const clientKey = clientId || 'default';
    const lastSelection = this.lastSelections.get(clientKey);

    if (
      !lastSelection ||
      lastSelection.nodeId !== nodeId ||
      lastSelection.serviceName !== serviceName ||
      Date.now() - lastSelection.timestamp > 60000
    ) {
      // 1 minute timeout
      return; // No matching recent selection
    }

    // Calculate reward: lower response time and success = higher reward
    const reward = success ? Math.max(0, 100 - responseTime / 10) : -50;

    const { state, action } = lastSelection;

    if (!this.qTable.has(state)) {
      // Initialize if not exists
      const healthyNodes = serviceRegistry.getHealthyNodes(serviceName);
      this.qTable.set(state, new Array(healthyNodes.length).fill(0));
    }

    const qValues = this.qTable.get(state);
    if (action >= qValues.length) return;

    const oldQValue = qValues[action];

    // Q-learning update rule
    const maxNextQ = Math.max(...qValues);
    const newQValue = oldQValue + this.alpha * (reward + this.gamma * maxNextQ - oldQValue);

    qValues[action] = newQValue;
    this.qTable.set(state, qValues);

    // Store reward for analysis
    this.storeReward(nodeId, reward);

    // Clean up old selection
    this.lastSelections.delete(clientKey);
  }

  /**
   * Get recent states where this node was selected
   */
  getRecentStatesForNode(nodeId) {
    // This is a simplified implementation
    // In a real system, we'd maintain a history of state-action pairs
    return [];
  }

  /**
   * Store reward for analysis
   */
  storeReward(nodeId, reward) {
    if (!this.rewardHistory.has(nodeId)) {
      this.rewardHistory.set(nodeId, []);
    }

    const history = this.rewardHistory.get(nodeId);
    history.push(reward);

    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Get average response time for a node
   */
  getAverageResponseTime(nodeId) {
    const responseTimes = serviceRegistry.getResponseTimeHistory(nodeId);
    if (!responseTimes || responseTimes.length === 0) return null;

    const sum = responseTimes.reduce((a, b) => a + b, 0);
    return sum / responseTimes.length;
  }

  /**
   * Get learning statistics
   */
  getStats() {
    const stats = {
      qTableSize: this.qTable.size,
      rewardHistorySize: this.rewardHistory.size,
      cacheSize: this.cache.size,
      averageRewards: {},
    };

    for (const [nodeId, rewards] of this.rewardHistory) {
      if (rewards.length > 0) {
        stats.averageRewards[nodeId] = rewards.reduce((a, b) => a + b, 0) / rewards.length;
      }
    }

    return stats;
  }
}

module.exports = {
  AiDrivenDiscovery,
};
