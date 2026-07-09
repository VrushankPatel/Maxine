const chai = require('chai');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const should = chai.should();

describe('Dashboard Client Smoke Tests', () => {
    let window;
    let document;
    let fetchCalls = [];

    beforeEach(() => {
        fetchCalls = [];
        const htmlPath = path.join(__dirname, '../../../client/index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        
        const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost" });
        window = dom.window;
        document = window.document;

        // Mock localStorage
        const store = {};
        window.localStorage = {
            getItem: (key) => store[key] || null,
            setItem: (key, value) => { store[key] = String(value); },
            removeItem: (key) => { delete store[key]; }
        };

        // Mock fetch
        window.fetch = async (url, options = {}) => {
            fetchCalls.push({ url, options });
            if (url === '/api/actuator/metrics') {
                const headers = new Map([['content-type', 'application/json']]);
                return {
                    ok: true,
                    headers,
                    json: async () => ({ "uptime": 12345 })
                };
            }
            if (url === '/api/maxine/signin') {
                const headers = new Map([['content-type', 'application/json']]);
                return {
                    ok: true,
                    headers,
                    json: async () => ({ accessToken: 'mock-jwt-token', role: 'admin' })
                };
            }
            const headers = new Map([['content-type', 'application/json']]);
            return {
                ok: true,
                headers,
                json: async () => ({})
            };
        };

        // Expose JSDOM globals to node context so client/app.js can evaluate
        global.window = window;
        global.document = document;
        global.fetch = window.fetch;
    });

    afterEach(() => {
        delete global.window;
        delete global.document;
        delete global.fetch;
    });

    it('should initialize elements, read state from localStorage, and load initial metrics', (done) => {
        const appJsPath = path.join(__dirname, '../../../client/app.js');
        const appJsContent = fs.readFileSync(appJsPath, 'utf8');

        // Evaluate app.js content
        try {
            eval(appJsContent);
        } catch (err) {
            return done(err);
        }

        // Verify elements list loaded and initial metrics request made
        const sessionRole = document.getElementById('session-role');
        sessionRole.textContent.should.equal('Signed out');
        fetchCalls.some(call => call.url === '/api/actuator/metrics').should.be.true;
        done();
    });

    it('should handle user sign-in successfully', (done) => {
        const appJsPath = path.join(__dirname, '../../../client/app.js');
        const appJsContent = fs.readFileSync(appJsPath, 'utf8');

        try {
            eval(appJsContent);
        } catch (err) {
            return done(err);
        }

        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const loginForm = document.getElementById('login-form');

        usernameInput.value = 'admin';
        passwordInput.value = 'password123';

        // Dispatch submit event
        const submitEvent = new window.Event('submit', { cancelable: true, bubbles: true });
        loginForm.dispatchEvent(submitEvent);

        // Fetch should trigger sign-in call
        setTimeout(() => {
            fetchCalls.some(call => call.url === '/api/maxine/signin').should.be.true;
            const sessionRole = document.getElementById('session-role');
            sessionRole.textContent.should.equal('admin');
            done();
        }, 50);
    });
});
