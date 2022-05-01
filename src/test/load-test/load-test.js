import http from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

const host = "https://maxine-x.herokuapp.com";
const apiUrl = `${host}/api`;
const statusCheck = {"is status 200": response => response.status === 200};

const user = JSON.stringify({"userName" : "admin","password" : "admin"});

const headers = {headers: {'Content-Type': 'application/json'}};

const serviceObj = JSON.stringify({
    "hostName": host,
    "nodeName": "node-x-10",
    "serviceName": "dbservice",
    "ssl": false,
    "timeOut": 50,
    "weight": 10,
    "path": "/api/actuator/health"
});

export default function () {
    let response = http.post(`${apiUrl}/maxine/signin`, user, headers);
    check(response, statusCheck);

    response = http.post(`${apiUrl}/maxine/serviceops/register`, serviceObj, headers);
    check(response, statusCheck);

    response = http.get(`${apiUrl}/maxine/serviceops/discover?serviceName=dbservice`);
    check(response, statusCheck);
}

export function handleSummary(data) {
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        "artifacts/actuator-load-summary.html": htmlReport(data)
    };
}

export function teardown() {
    console.log("Ending Load-Test for Maxine");
}

export let options = {
    vus: 500,
    iterations: 20000,
    duration: '50s',
    thresholds: {
        'failed requests': ['rate<0.02'],
        http_req_duration: ['p(95)<500'],
        http_reqs: ['count>100']
    },
};