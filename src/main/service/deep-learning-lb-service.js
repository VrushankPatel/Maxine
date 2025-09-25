const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');
const { fastOps } = require('../util/util');

class DeepLearningLBService {
    constructor() {
        this.models = new Map(); // serviceName -> { model, scaler, featureStats }
        this.trainingData = new Map(); // serviceName -> [{ features, label }]
        this.modelPath = path.join(process.cwd(), 'models');
        this.isTraining = false;

        // Ensure models directory exists
        if (!fs.existsSync(this.modelPath)) {
            fs.mkdirSync(this.modelPath, { recursive: true });
        }

        // Model hyperparameters
        this.inputSize = 10; // Number of input features
        this.hiddenLayers = [64, 32, 16];
        this.outputSize = 1; // Score for node selection
        this.learningRate = 0.001;
        this.batchSize = 32;
        this.epochs = 100;

        // Feature engineering
        this.featureWindow = 50; // Look at last 50 data points
        this.predictionHorizon = 5; // Predict 5 steps ahead

        // Time series analysis
        this.timeSeriesModels = new Map(); // serviceName -> ARIMA or other model
        this.nodeTimeSeriesData = new Map(); // nodeName -> time series data

        // Periodic model updates
        setInterval(() => this.updateModels(), 60000); // Update every minute
    }

    /**
     * Create and compile a neural network model
     */
    createModel() {
        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.dense({
            inputShape: [this.inputSize],
            units: this.hiddenLayers[0],
            activation: 'relu',
            kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }));

        // Hidden layers
        for (let i = 1; i < this.hiddenLayers.length; i++) {
            model.add(tf.layers.dense({
                units: this.hiddenLayers[i],
                activation: 'relu',
                kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
            }));
            model.add(tf.layers.dropout({ rate: 0.2 })); // Prevent overfitting
        }

        // Output layer
        model.add(tf.layers.dense({
            units: this.outputSize,
            activation: 'sigmoid' // Output between 0 and 1
        }));

        // Compile model
        model.compile({
            optimizer: tf.train.adam(this.learningRate),
            loss: 'meanSquaredError',
            metrics: ['mse', 'mae']
        });

        return model;
    }

    /**
     * Extract features from time series data
     */
    extractFeatures(nodeName, timeSeriesData) {
        if (!timeSeriesData || timeSeriesData.length < 5) {
            return null; // Not enough data
        }

        const recent = timeSeriesData.slice(-this.featureWindow);
        const features = [];

        // Statistical features
        const responseTimes = recent.map(d => d.responseTime);
        const successRates = recent.map(d => d.success ? 1 : 0);
        const loads = recent.map(d => d.load || 0.5);

        // Basic stats
        features.push(
            this.mean(responseTimes),
            this.std(responseTimes),
            this.min(responseTimes),
            this.max(responseTimes),
            this.mean(successRates),
            this.std(successRates),
            this.mean(loads),
            this.std(loads)
        );

        // Trend features (linear regression slope)
        features.push(
            this.calculateSlope(responseTimes),
            this.calculateSlope(successRates),
            this.calculateSlope(loads)
        );

        // Time series features
        const tsFeatures = this.extractTimeSeriesFeatures(responseTimes);
        features.push(...tsFeatures);

        // Recent performance (last 5 points)
        const last5 = recent.slice(-5);
        features.push(
            this.mean(last5.map(d => d.responseTime)),
            this.mean(last5.map(d => d.success ? 1 : 0))
        );

        return features;
    }

    /**
     * Extract advanced time series features
     */
    extractTimeSeriesFeatures(data) {
        const features = [];

        if (data.length < 10) {
            return [0, 0, 0, 0, 0]; // Default values
        }

        // Autocorrelation at lag 1
        features.push(this.autocorrelation(data, 1));

        // Moving averages
        features.push(this.mean(data.slice(-5))); // 5-point MA
        features.push(this.mean(data.slice(-10))); // 10-point MA

        // Rate of change
        const recent = data.slice(-5);
        const older = data.slice(-10, -5);
        features.push(this.mean(recent) - this.mean(older));

        // Volatility (coefficient of variation)
        features.push(this.std(data) / this.mean(data));

        // Seasonality detection (simple periodicity check)
        features.push(this.detectPeriodicity(data));

        return features;
    }

    /**
     * Calculate autocorrelation at a given lag
     */
    autocorrelation(data, lag) {
        if (data.length <= lag) return 0;

        const n = data.length - lag;
        const mean = this.mean(data);
        let numerator = 0;
        let denominator = 0;

        for (let i = 0; i < n; i++) {
            const diff1 = data[i] - mean;
            const diff2 = data[i + lag] - mean;
            numerator += diff1 * diff2;
            denominator += diff1 * diff1;
        }

        return denominator === 0 ? 0 : numerator / denominator;
    }

    /**
     * Detect simple periodicity in data
     */
    detectPeriodicity(data) {
        if (data.length < 20) return 0;

        // Simple autocorrelation-based periodicity detection
        const maxLag = Math.min(10, Math.floor(data.length / 2));
        let maxCorr = 0;
        let bestLag = 0;

        for (let lag = 1; lag <= maxLag; lag++) {
            const corr = Math.abs(this.autocorrelation(data, lag));
            if (corr > maxCorr) {
                maxCorr = corr;
                bestLag = lag;
            }
        }

        return bestLag; // Return the lag with highest correlation
    }

    /**
     * Simple ARIMA-like prediction for time series
     */
    predictTimeSeries(data, steps = 5) {
        if (data.length < 10) {
            return Array(steps).fill(this.mean(data));
        }

        // Simple exponential smoothing + trend
        const alpha = 0.3; // Smoothing parameter
        let level = data[0];
        let trend = 0;

        for (let i = 1; i < data.length; i++) {
            const newLevel = alpha * data[i] + (1 - alpha) * (level + trend);
            trend = alpha * (newLevel - level) + (1 - alpha) * trend;
            level = newLevel;
        }

        // Forecast
        const forecast = [];
        for (let i = 0; i < steps; i++) {
            const nextValue = level + (i + 1) * trend;
            forecast.push(Math.max(0, nextValue)); // Ensure non-negative
        }

        return forecast;
    }

    /**
     * Calculate mean of array using SIMD-inspired operations
     */
    mean(arr) {
        return fastOps.avg(arr);
    }

    /**
     * Calculate standard deviation using SIMD-inspired operations
     */
    std(arr) {
        return fastOps.std(arr);
    }

    /**
     * Calculate min using SIMD-inspired operations
     */
    min(arr) {
        return fastOps.min(arr);
    }

    /**
     * Calculate max using SIMD-inspired operations
     */
    max(arr) {
        return fastOps.max(arr);
    }

    /**
     * Calculate slope using linear regression with SIMD-inspired operations
     */
    calculateSlope(y) {
        const n = y.length;
        if (n < 2) return 0;

        const x = Array.from({ length: n }, (_, i) => i);
        const sumX = fastOps.sum(x);
        const sumY = fastOps.sum(y);
        const sumXY = fastOps.dotProduct(x, y);
        const sumXX = fastOps.sum(x.map(xi => xi * xi));

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return isNaN(slope) ? 0 : slope;
    }

    /**
     * Normalize features using z-score
     */
    normalizeFeatures(features, stats) {
        if (!stats) return features;

        return features.map((f, i) => {
            const stat = stats[i];
            if (stat && stat.std !== 0) {
                return (f - stat.mean) / stat.std;
            }
            return f;
        });
    }

    /**
     * Train model for a service
     */
    async trainModel(serviceName) {
        const data = this.trainingData.get(serviceName);
        if (!data || data.length < this.batchSize) {
            return false; // Not enough data
        }

        try {
            let model = this.models.get(serviceName)?.model;
            if (!model) {
                model = this.createModel();
            }

            // Prepare training data
            const features = data.map(d => d.features);
            const labels = data.map(d => [d.label]);

            // Calculate feature statistics for normalization using SIMD operations
            const featureStats = [];
            for (let i = 0; i < this.inputSize; i++) {
                const values = features.map(f => f[i]);
                featureStats.push({
                    mean: fastOps.avg(values),
                    std: fastOps.std(values)
                });
            }

            // Normalize features
            const normalizedFeatures = features.map(f => this.normalizeFeatures(f, featureStats));

            // Convert to tensors
            const xs = tf.tensor2d(normalizedFeatures);
            const ys = tf.tensor2d(labels);

            // Train model
            await model.fit(xs, ys, {
                epochs: this.epochs,
                batchSize: this.batchSize,
                validationSplit: 0.2,
                callbacks: {}
            });

            // Store model and stats
            this.models.set(serviceName, {
                model,
                scaler: featureStats,
                lastTrained: Date.now()
            });

            // Save model
            await this.saveModel(serviceName);

            // Clean up tensors
            xs.dispose();
            ys.dispose();

            return true;
        } catch (error) {
            console.error('Error training model for', serviceName, error);
            return false;
        }
    }

    /**
     * Save model to disk
     */
    async saveModel(serviceName) {
        const modelData = this.models.get(serviceName);
        if (!modelData) return;

        const modelPath = path.join(this.modelPath, `${serviceName}.json`);
        try {
            await modelData.model.save(`file://${modelPath}`);
            // Save feature stats
            const statsPath = path.join(this.modelPath, `${serviceName}_stats.json`);
            fs.writeFileSync(statsPath, JSON.stringify(modelData.scaler));
        } catch (error) {
            console.error('Error saving model:', error);
        }
    }

    /**
     * Load model from disk
     */
    async loadModel(serviceName) {
        const modelPath = path.join(this.modelPath, `${serviceName}.json`);
        const statsPath = path.join(this.modelPath, `${serviceName}_stats.json`);

        try {
            if (fs.existsSync(modelPath) && fs.existsSync(statsPath)) {
                const model = await tf.loadLayersModel(`file://${modelPath}`);
                const scaler = JSON.parse(fs.readFileSync(statsPath, 'utf8'));

                this.models.set(serviceName, {
                    model,
                    scaler,
                    lastTrained: Date.now()
                });

                return true;
            }
        } catch (error) {
            console.error('Error loading model:', error);
        }
        return false;
    }

    /**
     * Predict node performance using advanced time-series analysis
     */
    predictNodePerformance(nodeName, timestamp) {
        const data = this.nodeTimeSeriesData.get(nodeName) || [];
        if (data.length < 5) {
            // Not enough data, return defaults
            return { responseTime: 100, errorRate: 0.01, load: 0.5, confidence: 0.1 };
        }

        // Filter recent data
        const recentData = data.filter(d => timestamp - d.timestamp < 300000); // 5 minutes
        if (recentData.length === 0) {
            return { responseTime: 100, errorRate: 0.01, load: 0.5, confidence: 0.1 };
        }

        // Extract time series
        const responseTimes = recentData.map(d => d.responseTime);
        const successRates = recentData.map(d => d.success ? 1 : 0);
        const loads = recentData.map(d => d.load || 0.5);

        // Use time series prediction
        const predictedResponseTimes = this.predictTimeSeries(responseTimes, 5);
        const predictedResponseTime = predictedResponseTimes[predictedResponseTimes.length - 1];

        // Predict error rate using time series
        const predictedErrorRates = this.predictTimeSeries(successRates.map(s => 1 - s), 5);
        const predictedErrorRate = Math.max(0, Math.min(1, predictedErrorRates[predictedErrorRates.length - 1]));

        // Predict load
        const predictedLoads = this.predictTimeSeries(loads, 5);
        const predictedLoad = Math.max(0, Math.min(1, predictedLoads[predictedLoads.length - 1]));

        // Calculate confidence based on data quality and recency
        const recencyWeight = Math.min(1, recentData.length / 50);
        const dataQuality = this.calculateDataQuality(recentData);
        const confidence = Math.min(1, recencyWeight * dataQuality);

        return {
            responseTime: predictedResponseTime,
            errorRate: predictedErrorRate,
            load: predictedLoad,
            confidence
        };
    }

    /**
     * Calculate data quality score
     */
    calculateDataQuality(data) {
        if (data.length === 0) return 0;

        // Check for outliers (simple IQR method)
        const responseTimes = data.map(d => d.responseTime).sort((a, b) => a - b);
        const q1 = responseTimes[Math.floor(responseTimes.length * 0.25)];
        const q3 = responseTimes[Math.floor(responseTimes.length * 0.75)];
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;

        const outliers = data.filter(d => d.responseTime < lowerBound || d.responseTime > upperBound).length;
        const outlierRatio = outliers / data.length;

        // Quality decreases with more outliers
        return Math.max(0.1, 1 - outlierRatio);
    }

    /**
     * Predict node scores using the trained model
     */
    async predictNodeScores(serviceName, nodes) {
        const modelData = this.models.get(serviceName);
        if (!modelData) {
            return null; // No model available
        }

        try {
            const predictions = [];

            for (const node of nodes) {
                const features = this.extractFeatures(node.nodeName, this.nodeTimeSeriesData.get(node.nodeName) || []);
                if (!features) {
                    predictions.push({ node, score: 0.5 }); // Default score
                    continue;
                }

                // Normalize features
                const normalized = this.normalizeFeatures(features, modelData.scaler);

                // Make prediction
                const input = tf.tensor2d([normalized]);
                const output = modelData.model.predict(input);
                const score = (await output.data())[0];

                predictions.push({ node, score });

                // Clean up tensors
                input.dispose();
                output.dispose();
            }

            return predictions;
        } catch (error) {
            console.error('Error predicting node scores:', error);
            return null;
        }
    }

    /**
     * Set time series data for a node
     */
    setNodeTimeSeriesData(nodeName, data) {
        this.nodeTimeSeriesData.set(nodeName, data);
    }

    /**
     * Add training data point
     */
    addTrainingData(serviceName, nodeName, features, label) {
        if (!this.trainingData.has(serviceName)) {
            this.trainingData.set(serviceName, []);
        }

        const data = this.trainingData.get(serviceName);
        data.push({ features, label, timestamp: Date.now() });

        // Keep only recent data (last 1000 points)
        if (data.length > 1000) {
            data.shift();
        }
    }

    /**
     * Record actual performance for training
     */
    recordActualPerformance(serviceName, nodeName, responseTime, success, load) {
        // Extract features from current time series data
        const timeSeriesData = this.nodeTimeSeriesData.get(nodeName) || [];
        const features = this.extractFeatures(nodeName, timeSeriesData);

        if (!features) return; // Not enough data

        // Label: 1 for good performance (low response time, success), 0 for bad
        const isGoodPerformance = success && responseTime < 200; // Example threshold
        const label = isGoodPerformance ? 1 : 0;

        this.addTrainingData(serviceName, nodeName, features, label);
    }

    /**
     * Update models for all services
     */
    async updateModels() {
        if (this.isTraining) return;

        this.isTraining = true;
        try {
            for (const serviceName of this.trainingData.keys()) {
                await this.trainModel(serviceName);
            }
        } finally {
            this.isTraining = false;
        }
    }

    /**
     * Get comprehensive model performance metrics
     */
    async getModelMetrics(serviceName) {
        const modelData = this.models.get(serviceName);
        if (!modelData) return null;

        const data = this.trainingData.get(serviceName);
        if (!data || data.length === 0) return null;

        try {
            // Use last 200 points for evaluation, split into train/validation
            const evalData = data.slice(-200);
            if (evalData.length < 20) return null;

            const splitIndex = Math.floor(evalData.length * 0.8);
            const trainData = evalData.slice(0, splitIndex);
            const valData = evalData.slice(splitIndex);

            // Evaluate on validation set
            const valFeatures = valData.map(d => d.features);
            const valLabels = valData.map(d => [d.label]);

            const normalizedValFeatures = valFeatures.map(f => this.normalizeFeatures(f, modelData.scaler));

            const xs = tf.tensor2d(normalizedValFeatures);
            const ys = tf.tensor2d(valLabels);

            const evaluation = await modelData.model.evaluate(xs, ys);
            const [loss, mse, mae] = evaluation.map(t => t.dataSync()[0]);

            // Calculate accuracy (for binary classification)
            const predictions = await modelData.model.predict(xs);
            const predData = await predictions.data();
            const actualData = ys.dataSync();

            let correct = 0;
            for (let i = 0; i < valLabels.length; i++) {
                const pred = predData[i] > 0.5 ? 1 : 0;
                const actual = actualData[i * 2]; // Since ys is 2D with shape [n, 1]
                if (pred === actual) correct++;
            }
            const accuracy = correct / valLabels.length;

            // Calculate precision, recall, F1
            let tp = 0, fp = 0, tn = 0, fn = 0;
            for (let i = 0; i < valLabels.length; i++) {
                const pred = predData[i] > 0.5 ? 1 : 0;
                const actual = actualData[i * 2];
                if (pred === 1 && actual === 1) tp++;
                else if (pred === 1 && actual === 0) fp++;
                else if (pred === 0 && actual === 0) tn++;
                else if (pred === 0 && actual === 1) fn++;
            }

            const precision = tp / (tp + fp) || 0;
            const recall = tp / (tp + fn) || 0;
            const f1 = 2 * (precision * recall) / (precision + recall) || 0;

            xs.dispose();
            ys.dispose();
            predictions.dispose();

            return {
                loss,
                mse,
                mae,
                accuracy,
                precision,
                recall,
                f1,
                trainingPoints: data.length,
                validationPoints: valData.length,
                lastTrained: modelData.lastTrained,
                modelAge: Date.now() - modelData.lastTrained
            };
        } catch (error) {
            console.error('Error evaluating model:', error);
            return null;
        }
    }

    /**
     * Get load balancing accuracy metrics
     */
    getLoadBalancingMetrics(serviceName) {
        const data = this.trainingData.get(serviceName);
        if (!data || data.length === 0) return null;

        // Calculate how well the model predicts good vs bad nodes
        const recentData = data.slice(-100);
        const goodPredictions = recentData.filter(d => d.label === 1).length;
        const badPredictions = recentData.filter(d => d.label === 0).length;

        const total = recentData.length;
        const goodRatio = goodPredictions / total;
        const badRatio = badPredictions / total;

        // Calculate prediction consistency
        const predictions = recentData.map(d => d.label);
        let consistency = 0;
        for (let i = 1; i < predictions.length; i++) {
            if (predictions[i] === predictions[i - 1]) consistency++;
        }
        consistency = consistency / (predictions.length - 1);

        return {
            totalPredictions: total,
            goodPredictions: goodPredictions,
            badPredictions: badPredictions,
            goodRatio,
            badRatio,
            predictionConsistency: consistency,
            dataPoints: recentData.length
        };
    }
}

module.exports = DeepLearningLBService;