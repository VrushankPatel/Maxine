import http from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

export default function () {
    const rnd = Math.floor(Math.random() * 1000);
    let response = http.get(`http://localhost:8080/api/actuator/health`);
    check(response, {
        "is status 200": (r) => r.status === 200
    })

    response = http.get(`http://localhost:8080/api/actuator/metrics`);
    check(response, {
        "is status 200": (r) => r.status === 200
    })

    response = http.get(`http://localhost:8080/api/actuator/info`);
    check(response, {
        "is status 200": (r) => r.status === 200
    })
}

export function handleSummary(data) {

    // const resp = http.post('https://httpbin.test.k6.io/anything', JSON.stringify(data));
    // if (resp.status != 200) {
    //   console.error('Could not send summary, got status ' + resp.status);
    // }
    return {
      'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    //   'artifacts/k6-reports/actuator-load-summary/actuator-load-summary.json': JSON.stringify(data),
      "artifacts/k6-reports/actuator-load-summary.html": htmlReport(data)
    };
  }

export let options = {
    vus: 100,
    iterations: 200,
    duration: '100s',
    thresholds: {
        'failed requests': ['rate<0.02'],
        http_req_duration: ['p(95)<500'],
        http_reqs: ['count>90']
    },
};