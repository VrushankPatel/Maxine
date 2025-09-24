const { serviceRegistry } = require("../../entity/service-registry");

class PredictiveDiscovery {
    constructor() {
        this.predictionCache = new Map(); // serviceName -> {nodeName, predictedScore, timestamp}
        this.cacheTTL = 10000; // 10 seconds
        this.timeWindow = 300000; // 5 minutes for historical data
        this.minSamples = 10; // Minimum samples for prediction
    }

    invalidateCache = (fullServiceName) => {
        for (const key of this.predictionCache.keys()) {
            if (key.startsWith(`${fullServiceName}:`)) {
                this.predictionCache.delete(key);
            }
        }
    }

    /**
     * Use predictive analytics to select the node with the best predicted performance
     * @param {string} serviceName
     * @param {string} group
     * @param {array} tags
     * @returns {object}
     */
    getNode = (fullServiceName, group, tags, deployment, filter) => {
        const healthyNodes = serviceRegistry.getHealthyNodes(fullServiceName, group, tags, deployment, filter);
        if (healthyNodes.length === 0) return null;

        const cacheKey = `${fullServiceName}:${group || ''}:${tags ? tags.sort().join(',') : ''}`;

        // Check cache
        const cached = this.predictionCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            return cached.node;
        }

        let selectedNode = null;
        let bestPredictedScore = -Infinity;

        for (const node of healthyNodes) {
            const predictedScore = this.predictNodePerformance(node.nodeName);
            if (predictedScore > bestPredictedScore) {
                bestPredictedScore = predictedScore;
                selectedNode = node;
            }
        }

        // If no predictions available, fall back to least response time
        if (!selectedNode || bestPredictedScore === -Infinity) {
            selectedNode = this.fallbackSelection(healthyNodes);
        }

        // Cache the result
        this.predictionCache.set(cacheKey, {
            node: selectedNode,
            predictedScore: bestPredictedScore,
            timestamp: Date.now()
        });

        return selectedNode;
    }

    /**
     * Predict node performance using time-series analysis
     * Uses exponential moving average and trend analysis
     */
    predictNodePerformance(nodeId) {
        const responseTimes = serviceRegistry.getResponseTimeHistory(nodeId);
        if (!responseTimes || responseTimes.length < this.minSamples) {
            return this.getCurrentHealthScore(nodeId);
        }

        // Calculate exponential moving average
        const alpha = 0.3; // Smoothing factor
        let ema = responseTimes[0];
        for (let i = 1; i < responseTimes.length; i++) {
            ema = alpha * responseTimes[i] + (1 - alpha) * ema;
        }

        // Calculate trend (slope of recent data)
        const recentData = responseTimes.slice(-10);
        if (recentData.length < 5) return 100 - ema; // Invert: lower response time = higher score

        const trend = this.calculateTrend(recentData);

        // Predict next value using trend
        const predictedResponseTime = ema + trend;

        // Convert to score (0-100, higher better)
        // Lower predicted response time = higher score
        const score = Math.max(0, Math.min(100, 100 - (predictedResponseTime / 10)));

        return score;
    }

    /**
     * Calculate trend (slope) of time series data
     */
    calculateTrend(data) {
        if (data.length < 2) return 0;

        const n = data.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = data.reduce((sum, val) => sum + val, 0);
        const sumXY = data.reduce((sum, val, idx) => sum + (val * idx), 0);
        const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return slope;
    }

    /**
     * Get current health score as fallback
     */
    getCurrentHealthScore(nodeId) {
        return serviceRegistry.getHealthScore(null, nodeId) || 50;
    }

    /**
     * Fallback selection using least response time
     */
    fallbackSelection(healthyNodes) {
        let selectedNode = null;
        let bestScore = -Infinity;

        for (const node of healthyNodes) {
            const score = this.getCurrentHealthScore(node.nodeName);
            if (score > bestScore) {
                bestScore = score;
                selectedNode = node;
            }
        }

        return selectedNode || healthyNodes[0];
    }
}

module.exports = {
    PredictiveDiscovery
}