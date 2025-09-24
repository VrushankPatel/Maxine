const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certsDir = path.join(__dirname);

// Generate CA private key
console.log('Generating CA private key...');
execSync(`openssl genrsa -out ${certsDir}/ca.key 2048`);

// Generate CA certificate
console.log('Generating CA certificate...');
execSync(`openssl req -x509 -new -nodes -key ${certsDir}/ca.key -sha256 -days 365 -out ${certsDir}/ca.crt -subj "/C=US/ST=State/L=City/O=Organization/CN=MaxineCA"`);

// Generate server private key
console.log('Generating server private key...');
execSync(`openssl genrsa -out ${certsDir}/server.key 2048`);

// Generate server certificate signing request
console.log('Generating server CSR...');
execSync(`openssl req -new -key ${certsDir}/server.key -out ${certsDir}/server.csr -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`);

// Sign server certificate with CA
console.log('Signing server certificate...');
execSync(`openssl x509 -req -in ${certsDir}/server.csr -CA ${certsDir}/ca.crt -CAkey ${certsDir}/ca.key -CAcreateserial -out ${certsDir}/server.crt -days 365 -sha256`);

// Generate client private key
console.log('Generating client private key...');
execSync(`openssl genrsa -out ${certsDir}/client.key 2048`);

// Generate client certificate signing request
console.log('Generating client CSR...');
execSync(`openssl req -new -key ${certsDir}/client.key -out ${certsDir}/client.csr -subj "/C=US/ST=State/L=City/O=Organization/CN=MaxineClient"`);

// Sign client certificate with CA
console.log('Signing client certificate...');
execSync(`openssl x509 -req -in ${certsDir}/client.csr -CA ${certsDir}/ca.crt -CAkey ${certsDir}/ca.key -CAcreateserial -out ${certsDir}/client.crt -days 365 -sha256`);

// Clean up CSR files
fs.unlinkSync(path.join(certsDir, 'server.csr'));
fs.unlinkSync(path.join(certsDir, 'client.csr'));

console.log('Certificates generated successfully!');
console.log('CA certificate: ca.crt');
console.log('Server certificate: server.crt, server.key');
console.log('Client certificate: client.crt, client.key');
console.log('');
console.log('To enable mTLS, set MTLS_ENABLED=true and ensure certificates are in place.');
console.log('For testing, you can use client.crt and client.key with curl:');
console.log('curl --cert client.crt --key client.key --cacert ca.crt https://localhost:8080/health');