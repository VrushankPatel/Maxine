#!/usr/bin/env node

const axios = require('axios');
const minimist = require('minimist');

const args = minimist(process.argv.slice(2));
const command = args._[0];
const baseUrl = args.url || 'http://localhost:8080';

const api = axios.create({
    baseURL: baseUrl,
    timeout: 5000
});

async function register() {
    const { serviceName, address, metadata } = args;
    if (!serviceName || !address) {
        console.error('Usage: cli register --serviceName <name> --address <url> [--metadata <json>]');
        process.exit(1);
    }
    try {
        const payload = {
            serviceName,
            address,
            metadata: metadata ? JSON.parse(metadata) : {}
        };
        const res = await api.post('/api/maxine/serviceops/register', payload);
        console.log('Registered:', res.data);
    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

async function deregister() {
    const { serviceName, nodeName } = args;
    if (!serviceName || !nodeName) {
        console.error('Usage: cli deregister --serviceName <name> --nodeName <name>');
        process.exit(1);
    }
    try {
        const res = await api.post('/api/maxine/serviceops/deregister', { serviceName, nodeName });
        console.log('Deregistered:', res.data);
    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

async function list() {
    try {
        const res = await api.get('/api/maxine/serviceops/services');
        console.log(JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

async function health() {
    const { serviceName } = args;
    if (!serviceName) {
        console.error('Usage: cli health --serviceName <name>');
        process.exit(1);
    }
    try {
        const res = await api.get(`/api/maxine/serviceops/health?serviceName=${serviceName}`);
        console.log(JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

async function discover() {
    const { serviceName } = args;
    if (!serviceName) {
        console.error('Usage: cli discover --serviceName <name>');
        process.exit(1);
    }
    try {
        const res = await api.get(`/api/maxine/serviceops/discover/info?serviceName=${serviceName}`);
        console.log(JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

switch (command) {
    case 'register':
        register();
        break;
    case 'deregister':
        deregister();
        break;
    case 'list':
        list();
        break;
    case 'health':
        health();
        break;
    case 'discover':
        discover();
        break;
    default:
        console.log('Usage: cli <command> [options]');
        console.log('Commands: register, deregister, list, health, discover');
        console.log('Options: --url <baseUrl>');
}