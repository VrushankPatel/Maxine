const { serviceRegistry } = require("../../entity/service-registry");
const config = require("../../config/config");
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// SPIFFE/SPIRE Integration for Zero-Trust Security
class SpiffeSpireController {
    constructor() {
        this.spireServerUrl = process.env.SPIRE_SERVER_URL || 'http://spire-server:8081';
        this.trustDomain = process.env.SPIRE_TRUST_DOMAIN || 'example.org';
        this.certificates = new Map();
        this.workloadIdentities = new Map();
        this.authorizationPolicies = new Map();
        this.mtlsEnabled = config.mtlsEnabled || false;
    }

    async initialize() {
        if (this.mtlsEnabled) {
            console.log('Initializing SPIFFE/SPIRE integration...');
            await this.connectToSpireServer();
            await this.setupWorkloadIdentities();
            await this.startCertificateRotation();
        }
    }

    async connectToSpireServer() {
        try {
            // In real implementation, this would connect to SPIRE server
            // For simulation, we'll maintain local state
            this.connected = true;
            console.log('Connected to SPIRE server');
        } catch (error) {
            console.error('Failed to connect to SPIRE server:', error);
            this.connected = false;
        }
    }

    async setupWorkloadIdentities() {
        const services = serviceRegistry.getRegServers();

        for (const [serviceName, serviceData] of Object.entries(services)) {
            const nodes = serviceData.nodes || {};

            for (const [nodeId, node] of Object.entries(nodes)) {
                const workloadId = `spiffe://${this.trustDomain}/${serviceName}/${nodeId}`;

                this.workloadIdentities.set(nodeId, {
                    workloadId,
                    serviceName,
                    nodeId,
                    spiffeId: workloadId,
                    certificate: null,
                    privateKey: null,
                    issuedAt: null,
                    expiresAt: null
                });

                // Request certificate for this workload
                await this.requestCertificate(nodeId);
            }
        }
    }

    async requestCertificate(nodeId) {
        try {
            const workload = this.workloadIdentities.get(nodeId);
            if (!workload) return;

            // In real implementation, this would call SPIRE Workload API
            // For simulation, generate self-signed certificate
            const { certificate, privateKey } = await this.generateCertificate(workload);

            workload.certificate = certificate;
            workload.privateKey = privateKey;
            workload.issuedAt = new Date();
            workload.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            this.certificates.set(nodeId, workload);

            console.log(`Certificate issued for workload: ${workload.spiffeId}`);
        } catch (error) {
            console.error(`Failed to request certificate for ${nodeId}:`, error);
        }
    }

    async generateCertificate(workload) {
        // Generate self-signed certificate for simulation
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        const cert = crypto.createCertificate();
        cert.publicKey = publicKey;
        cert.serialNumber = '01';
        cert.validity.start = new Date();
        cert.validity.end = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        cert.subject = {
            countryName: 'US',
            stateOrProvinceName: 'CA',
            localityName: 'San Francisco',
            organizationName: 'Maxine',
            organizationalUnitName: workload.serviceName,
            commonName: workload.spiffeId
        };
        cert.issuer = cert.subject; // Self-signed

        cert.sign(privateKey);

        const certificate = cert.export({ type: 'pem' });

        return { certificate, privateKey };
    }

    async startCertificateRotation() {
        // Rotate certificates every 23 hours (before 24-hour expiry)
        setInterval(async () => {
            await this.rotateCertificates();
        }, 23 * 60 * 60 * 1000);
    }

    async rotateCertificates() {
        console.log('Starting certificate rotation...');

        for (const [nodeId, workload] of this.workloadIdentities) {
            if (workload.expiresAt && workload.expiresAt < new Date(Date.now() + 60 * 60 * 1000)) { // Expires within 1 hour
                console.log(`Rotating certificate for ${nodeId}`);
                await this.requestCertificate(nodeId);
            }
        }
    }

    async validateCertificate(nodeId, clientCertificate) {
        const workload = this.certificates.get(nodeId);
        if (!workload || !workload.certificate) {
            return { valid: false, reason: 'No certificate found for workload' };
        }

        try {
            // In real implementation, validate against SPIRE bundle
            // For simulation, check if certificate matches
            const certFingerprint = crypto.createHash('sha256')
                .update(workload.certificate)
                .digest('hex');

            const clientFingerprint = crypto.createHash('sha256')
                .update(clientCertificate)
                .digest('hex');

            if (certFingerprint === clientFingerprint) {
                // Check expiry
                if (workload.expiresAt > new Date()) {
                    return { valid: true, spiffeId: workload.spiffeId };
                } else {
                    return { valid: false, reason: 'Certificate expired' };
                }
            } else {
                return { valid: false, reason: 'Certificate fingerprint mismatch' };
            }
        } catch (error) {
            return { valid: false, reason: 'Certificate validation error: ' + error.message };
        }
    }

    async authorizeRequest(serviceName, clientSpiffeId, requestedService) {
        // Implement zero-trust authorization
        const policy = this.authorizationPolicies.get(serviceName);
        if (!policy) {
            return { authorized: false, reason: 'No authorization policy found' };
        }

        // Check if client is allowed to access the requested service
        const allowedServices = policy.allowedServices || [];
        if (allowedServices.includes(requestedService) || allowedServices.includes('*')) {
            return { authorized: true };
        }

        return { authorized: false, reason: `Access denied: ${clientSpiffeId} not authorized for ${requestedService}` };
    }

    async createAuthorizationPolicy(serviceName, policy) {
        this.authorizationPolicies.set(serviceName, {
            ...policy,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return { success: true, policy: this.authorizationPolicies.get(serviceName) };
    }

    async getAuthorizationPolicy(serviceName) {
        return this.authorizationPolicies.get(serviceName) || null;
    }

    async getWorkloadIdentities() {
        const identities = {};

        for (const [nodeId, workload] of this.workloadIdentities) {
            identities[nodeId] = {
                spiffeId: workload.spiffeId,
                serviceName: workload.serviceName,
                certificateValid: workload.certificate && workload.expiresAt > new Date(),
                issuedAt: workload.issuedAt,
                expiresAt: workload.expiresAt
            };
        }

        return identities;
    }

    async getSpireStatus() {
        return {
            connected: this.connected,
            trustDomain: this.trustDomain,
            serverUrl: this.spireServerUrl,
            mtlsEnabled: this.mtlsEnabled,
            workloadIdentities: this.workloadIdentities.size,
            certificates: this.certificates.size,
            authorizationPolicies: this.authorizationPolicies.size,
            timestamp: new Date().toISOString()
        };
    }

    // Middleware for mTLS validation
    createMtlsMiddleware() {
        return async (req, res, next) => {
            if (!this.mtlsEnabled) {
                return next();
            }

            const clientCert = req.socket.getPeerCertificate();
            if (!clientCert) {
                return res.status(401).json({ error: 'Client certificate required for mTLS' });
            }

            // Extract SPIFFE ID from certificate
            const spiffeId = this.extractSpiffeIdFromCert(clientCert);
            if (!spiffeId) {
                return res.status(401).json({ error: 'Invalid SPIFFE ID in certificate' });
            }

            // Validate certificate
            const nodeId = this.getNodeIdFromSpiffeId(spiffeId);
            const validation = await this.validateCertificate(nodeId, clientCert.raw.toString('base64'));

            if (!validation.valid) {
                return res.status(401).json({ error: 'Certificate validation failed: ' + validation.reason });
            }

            // Attach identity to request
            req.spiffeId = spiffeId;
            req.workloadIdentity = validation;

            next();
        };
    }

    extractSpiffeIdFromCert(cert) {
        // Extract SPIFFE ID from certificate subject alternative name
        // In real implementation, check SAN extension
        // For simulation, derive from certificate
        try {
            const fingerprint = crypto.createHash('sha256')
                .update(cert.raw)
                .digest('hex');

            // Find workload by certificate fingerprint
            for (const [nodeId, workload] of this.certificates) {
                if (workload.certificate) {
                    const certFingerprint = crypto.createHash('sha256')
                        .update(workload.certificate)
                        .digest('hex');

                    if (certFingerprint === fingerprint) {
                        return workload.spiffeId;
                    }
                }
            }
        } catch (error) {
            console.error('Error extracting SPIFFE ID:', error);
        }

        return null;
    }

    getNodeIdFromSpiffeId(spiffeId) {
        // Extract node ID from SPIFFE ID
        const parts = spiffeId.split('/');
        if (parts.length >= 4) {
            return parts[3]; // spiffe://domain/service/nodeId
        }
        return null;
    }

    // Authorization middleware
    createAuthorizationMiddleware(requiredService = null) {
        return async (req, res, next) => {
            if (!this.mtlsEnabled || !req.spiffeId) {
                return next();
            }

            const clientSpiffeId = req.spiffeId;
            const requestedService = requiredService || req.params.serviceName || req.query.serviceName;

            if (!requestedService) {
                return next();
            }

            const auth = await this.authorizeRequest(requestedService, clientSpiffeId, requestedService);

            if (!auth.authorized) {
                return res.status(403).json({
                    error: 'Access denied',
                    reason: auth.reason
                });
            }

            next();
        };
    }
}

// Singleton instance
const spiffeSpireController = new SpiffeSpireController();

// Initialize on module load
spiffeSpireController.initialize().catch(console.error);

// Controller functions
const getSpireStatus = (req, res) => {
    const status = spiffeSpireController.getSpireStatus();
    res.json(status);
};

const getWorkloadIdentities = (req, res) => {
    const identities = spiffeSpireController.getWorkloadIdentities();
    res.json({ identities });
};

const createAuthorizationPolicy = async (req, res) => {
    const { serviceName, allowedServices, deniedServices } = req.body;

    if (!serviceName) {
        return res.status(400).json({ error: 'serviceName required' });
    }

    try {
        const result = await spiffeSpireController.createAuthorizationPolicy(serviceName, {
            allowedServices: allowedServices || [],
            deniedServices: deniedServices || []
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to create authorization policy',
            details: error.message
        });
    }
};

const getAuthorizationPolicy = async (req, res) => {
    const { serviceName } = req.params;

    const policy = await spiffeSpireController.getAuthorizationPolicy(serviceName);
    if (policy) {
        res.json({ policy });
    } else {
        res.status(404).json({ error: 'Authorization policy not found' });
    }
};

const rotateCertificates = async (req, res) => {
    try {
        await spiffeSpireController.rotateCertificates();
        res.json({
            success: true,
            message: 'Certificate rotation completed'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Certificate rotation failed',
            details: error.message
        });
    }
};

const validateCertificate = async (req, res) => {
    const { nodeId, certificate } = req.body;

    if (!nodeId || !certificate) {
        return res.status(400).json({ error: 'nodeId and certificate required' });
    }

    try {
        const result = await spiffeSpireController.validateCertificate(nodeId, certificate);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: 'Certificate validation failed',
            details: error.message
        });
    }
};

const configureSpire = (req, res) => {
    const { trustDomain, serverUrl, mtlsEnabled } = req.body;

    if (trustDomain) {
        spiffeSpireController.trustDomain = trustDomain;
    }
    if (serverUrl) {
        spiffeSpireController.spireServerUrl = serverUrl;
    }
    if (mtlsEnabled !== undefined) {
        spiffeSpireController.mtlsEnabled = mtlsEnabled;
    }

    res.json({
        success: true,
        message: 'SPIFFE/SPIRE configuration updated',
        config: spiffeSpireController.getSpireStatus()
    });
};

module.exports = {
    getSpireStatus,
    getWorkloadIdentities,
    createAuthorizationPolicy,
    getAuthorizationPolicy,
    rotateCertificates,
    validateCertificate,
    configureSpire,
    spiffeSpireController
};