const axios = require('axios');
const { performance } = require('perf_hooks');

const BASE_URL = 'http://localhost:8081';
const CONCURRENT_USERS = 50;
const ITERATIONS_PER_USER = 100;
const TOTAL_REQUESTS = CONCURRENT_USERS * ITERATIONS_PER_USER;

async function registerService() {
    try {
        const response = await axios.post(`${BASE_URL}/register`, {
            serviceName: 'test-service',
            host: 'localhost',
            port: Math.floor(Math.random() * 1000) + 3000
        });
        return response.data.nodeId;
    } catch (error) {
        console.error('Registration failed:', error.message);
        return null;
    }
}

async function discoverService() {
    try {
        const response = await axios.get(`${BASE_URL}/discover?serviceName=test-service`);
        return response.data;
    } catch (error) {
        console.error('Discovery failed:', error.message);
        return null;
    }
}

async function runUserTest(userId) {
    const results = [];
    for (let i = 0; i < ITERATIONS_PER_USER; i++) {
        const start = performance.now();
        await discoverService();
        const end = performance.now();
        results.push(end - start);
    }
    return results;
}

async function runLoadTest() {
    console.log(`Starting load test with ${CONCURRENT_USERS} concurrent users, ${ITERATIONS_PER_USER} iterations each...`);

    // Register a service first
    const nodeId = await registerService();
    if (!nodeId) {
        console.error('Failed to register service');
        return;
    }
    console.log('Service registered:', nodeId);

    const startTime = performance.now();

    // Run concurrent users
    const promises = [];
    for (let i = 0; i < CONCURRENT_USERS; i++) {
        promises.push(runUserTest(i));
    }

    const allResults = await Promise.all(promises);
    const endTime = performance.now();

    // Flatten results
    const responseTimes = allResults.flat();

    // Calculate statistics
    const totalTime = endTime - startTime;
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const sortedTimes = responseTimes.sort((a, b) => a - b);
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
    const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
    const throughput = TOTAL_REQUESTS / (totalTime / 1000);

    console.log(`\nLoad Test Results:`);
    console.log(`Total Requests: ${TOTAL_REQUESTS}`);
    console.log(`Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`95th Percentile: ${p95.toFixed(2)}ms`);
    console.log(`99th Percentile: ${p99.toFixed(2)}ms`);
    console.log(`Throughput: ${throughput.toFixed(2)} req/s`);
}

runLoadTest().catch(console.error);