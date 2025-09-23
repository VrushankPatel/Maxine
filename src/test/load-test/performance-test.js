import http from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

const host = "http://localhost:8080";
const apiUrl = `${host}/api`;
const statusCheck = {"is status 200": response => response.status === 200};

const headers = {headers: {'Content-Type': 'application/json'}};

const serviceObj = JSON.stringify({
    "hostName": "httpbin.org",
    "nodeName": "node-x-10",
    "serviceName": "dbservice",
    "ssl": true,
    "timeOut": 50,
    "weight": 10,
    "path": "/status/200"
});

export default function () {
    let response = http.get(`${apiUrl}/maxine/serviceops/discover?serviceName=dbservice&version=1.0`);
    check(response, statusCheck);
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
    duration: '50s',
    thresholds: {
        http_req_failed: ['rate<0.02'],
        http_req_duration: ['p(95)<500'],
        http_reqs: ['count>100']
    },
};