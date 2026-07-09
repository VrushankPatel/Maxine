const { NodeSDK } = require('@opentelemetry/sdk-node');
const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const opentelemetry = require('@opentelemetry/api');

let sdk;
let registrationsCounter;
let discoveriesCounter;

const initializeOtel = () => {
    const traceExporter = new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces'
    });

    const metricExporter = new OTLPMetricExporter({
        url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics'
    });

    sdk = new NodeSDK({
        serviceName: 'maxine-registry',
        traceExporter: traceExporter,
        spanProcessors: [
            new SimpleSpanProcessor(new ConsoleSpanExporter())
        ],
        metricReader: new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: 10000 // 10s
        })
    });

    sdk.start();

    // Set up meters and metrics
    const meter = opentelemetry.metrics.getMeter('maxine-meter');
    registrationsCounter = meter.createCounter('maxine_registrations', {
        description: 'Total number of service registrations'
    });
    discoveriesCounter = meter.createCounter('maxine_discovery_requests', {
        description: 'Total number of service discovery requests'
    });
};

const recordOtelRegistration = () => {
    if (registrationsCounter) {
        registrationsCounter.add(1);
    }
};

const recordOtelDiscovery = () => {
    if (discoveriesCounter) {
        discoveriesCounter.add(1);
    }
};

const getTracer = () => {
    return opentelemetry.trace.getTracer('maxine-tracer');
};

module.exports = {
    initializeOtel,
    recordOtelRegistration,
    recordOtelDiscovery,
    getTracer
};
