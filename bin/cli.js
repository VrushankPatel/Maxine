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

async function metrics() {
    try {
        const res = await api.get('/api/maxine/serviceops/metrics');
        console.log(JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

async function backup() {
    const { file } = args;
    if (!file) {
        console.error('Usage: cli backup --file <filename>');
        process.exit(1);
    }
    try {
        const res = await api.get('/api/maxine/serviceops/backup');
        const fs = require('fs');
        fs.writeFileSync(file, JSON.stringify(res.data, null, 2));
        console.log('Backup saved to', file);
    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

async function restore() {
    const { file } = args;
    if (!file) {
        console.error('Usage: cli restore --file <filename>');
        process.exit(1);
    }
    try {
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const res = await api.post('/api/maxine/serviceops/restore', data);
        console.log('Restore successful:', res.data);
    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
}

async function aliases() {
    const { action, alias, primaryServiceName } = args;
    if (action === 'add') {
        if (!alias || !primaryServiceName) {
            console.error('Usage: cli aliases --action add --alias <alias> --primaryServiceName <name>');
            process.exit(1);
        }
        try {
            const res = await api.post('/api/maxine/serviceops/aliases/add', { alias, primaryServiceName });
            console.log('Alias added:', res.data);
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else if (action === 'remove') {
        if (!alias) {
            console.error('Usage: cli aliases --action remove --alias <alias>');
            process.exit(1);
        }
        try {
            const res = await api.delete('/api/maxine/serviceops/aliases/remove', { data: { alias } });
            console.log('Alias removed:', res.data);
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else if (action === 'list') {
        if (!primaryServiceName) {
            console.error('Usage: cli aliases --action list --primaryServiceName <name>');
            process.exit(1);
        }
        try {
            const res = await api.get(`/api/maxine/serviceops/aliases?serviceName=${primaryServiceName}`);
            console.log(JSON.stringify(res.data, null, 2));
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else {
        console.error('Usage: cli aliases --action <add|remove|list> [options]');
    }
}

async function webhooks() {
    const { action, serviceName, url } = args;
    if (action === 'add') {
        if (!serviceName || !url) {
            console.error('Usage: cli webhooks --action add --serviceName <name> --url <url>');
            process.exit(1);
        }
        try {
            const res = await api.post('/api/maxine/serviceops/webhooks/add', { serviceName, url });
            console.log('Webhook added:', res.data);
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else if (action === 'remove') {
        if (!serviceName || !url) {
            console.error('Usage: cli webhooks --action remove --serviceName <name> --url <url>');
            process.exit(1);
        }
        try {
            const res = await api.delete('/api/maxine/serviceops/webhooks/remove', { data: { serviceName, url } });
            console.log('Webhook removed:', res.data);
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else if (action === 'list') {
        if (!serviceName) {
            console.error('Usage: cli webhooks --action list --serviceName <name>');
            process.exit(1);
        }
        try {
            const res = await api.get(`/api/maxine/serviceops/webhooks?serviceName=${serviceName}`);
            console.log(JSON.stringify(res.data, null, 2));
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else {
        console.error('Usage: cli webhooks --action <add|remove|list> [options]');
    }
}

async function kv() {
    const { action, key, value } = args;
    if (action === 'set') {
        if (!key || value === undefined) {
            console.error('Usage: cli kv --action set --key <key> --value <value>');
            process.exit(1);
        }
        try {
            const res = await api.post('/api/maxine/serviceops/kv/set', { key, value });
            console.log('KV set:', res.data);
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else if (action === 'get') {
        if (!key) {
            console.error('Usage: cli kv --action get --key <key>');
            process.exit(1);
        }
        try {
            const res = await api.get(`/api/maxine/serviceops/kv/get?key=${key}`);
            console.log(res.data.value);
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else if (action === 'delete') {
        if (!key) {
            console.error('Usage: cli kv --action delete --key <key>');
            process.exit(1);
        }
        try {
            const res = await api.delete('/api/maxine/serviceops/kv/delete', { data: { key } });
            console.log('KV deleted:', res.data);
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else if (action === 'list') {
        try {
            const res = await api.get('/api/maxine/serviceops/kv/all');
            console.log(JSON.stringify(res.data, null, 2));
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else {
        console.error('Usage: cli kv --action <set|get|delete|list> [options]');
    }
}

async function config() {
    const { key, value } = args;
    if (value !== undefined) {
        // set
        try {
            const res = await api.put('/api/maxine/control/config', { [key]: value });
            console.log('Config updated:', res.data);
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else if (key) {
        // get
        try {
            const res = await api.get('/api/maxine/control/config');
            console.log(key + ':', res.data[key] || 'Key not found');
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
    } else {
        // get all
        try {
            const res = await api.get('/api/maxine/control/config');
            console.log(JSON.stringify(res.data, null, 2));
        } catch (err) {
            console.error('Error:', err.response?.data || err.message);
        }
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
    case 'metrics':
        metrics();
        break;
    case 'backup':
        backup();
        break;
    case 'restore':
        restore();
        break;
    case 'aliases':
        aliases();
        break;
    case 'webhooks':
        webhooks();
        break;
    case 'kv':
        kv();
        break;
    case 'config':
        config();
        break;
    default:
        console.log('Usage: cli <command> [options]');
        console.log('Commands: register, deregister, list, health, discover, metrics, backup, restore, aliases, webhooks, kv, config');
        console.log('Options: --url <baseUrl>');
}