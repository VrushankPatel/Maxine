import http from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

const host = "http://127.0.0.1:8080";
const apiUrl = host;
const registerUrl = '/register';
const heartbeatUrl = '/heartbeat';
const discoverUrl = '/discover?serviceName=dbservice&version=1.0';
const statusCheck = {"is status 200": response => response.status === 200};

const headers = {headers: {'Content-Type': 'application/json'}};

const serviceObj = JSON.stringify({
    "serviceName": "dbservice",
    "host": "localhost",
    "port": 3000,
    "metadata": {"version": "1.0"}
});

export function setup() {
    let headers = { headers: { 'Content-Type': 'application/json' } };
    let registerResponse = http.post(`${apiUrl}${registerUrl}`, serviceObj, headers);
    if (registerResponse.status !== 200) {
        console.log('Registration failed:', registerResponse.status, registerResponse.body);
        return { headers };
    }
    let registerData = JSON.parse(registerResponse.body);
    let nodeId = registerData.nodeId || "dbservice:localhost:3000"; // fallback
    let heartbeatResponse = http.post(`${apiUrl}${heartbeatUrl}`, JSON.stringify({ nodeId }), headers);
    if (heartbeatResponse.status !== 200) {
        console.log('Heartbeat failed:', heartbeatResponse.status, heartbeatResponse.body);
    }
    return { headers };
}

export default function (data) {
    let response = http.get(`${apiUrl}${discoverUrl}`, data.headers);
    check(response, statusCheck);
    // Log response for debugging
    if (response.status !== 200) {
        console.log('Response status:', response.status, 'body:', response.body);
    }
}

export function handleSummary(data) {
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        "artifacts/performance-summary.html": htmlReport(data)
    };
}

export function teardown() {
    console.log("Ending Load-Test for Maxine");
}

export let options = {
    vus: 50,
    iterations: 5000,
    duration: '30s',
    thresholds: {
        http_req_failed: ['rate<0.02'],
        http_req_duration: ['p(95)<100'], // Stricter for ultra-fast
        http_reqs: ['count>100']
    },
};