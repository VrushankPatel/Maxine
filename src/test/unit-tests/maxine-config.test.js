var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('../../../index');
const config = require('../../main/config/config');
const { generateAccessToken } = require('../../main/security/jwt');
const { sssChecker, logFormatChecker } = require('../../main/util/util');
const { testUser, ENDPOINTS } = require('../testUtil/test-constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");
const accessToken = generateAccessToken(testUser);

describe(`${fileName} : API /api/maxine`, () => {

    it('GET /config -> 200 & should return the initial configs of maxine', (done) => {
        chai.request(app)
            .get(ENDPOINTS.maxine.config)
            .set("Authorization", `Bearer ${accessToken}`)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.eql(config);
                done();
            });
    });

    it('PUT /config (Update logAsync) -> 200 & Update config logAsync', (done) => {
        const serviceDataToUpdate = {"logAsync" : true}

        chai.request(app)
            .put(ENDPOINTS.maxine.config)
            .set("Authorization", `Bearer ${accessToken}`)
            .set('Content-Type', 'application/json')
            .send(serviceDataToUpdate)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("logAsync", "Success");
                config.logAsync.should.be.eql(serviceDataToUpdate["logAsync"]);
                done();
            });
    });

    it('PUT /config (Update heartBeatTimeout) -> 200 & Update config heartBeatTimeout', (done) => {
        const serviceDataToUpdate = {"heartBeatTimeout" : 12}

        chai.request(app)
            .put(ENDPOINTS.maxine.config)
            .set("Authorization", `Bearer ${accessToken}`)
            .set('Content-Type', 'application/json')
            .send(serviceDataToUpdate)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("heartBeatTimeout", "Success");
                config.heartBeatTimeout.should.be.eql(serviceDataToUpdate["heartBeatTimeout"]);
                done();
            });
    });

    it('PUT /config (Update logJsonPrettify) -> 200 & Update config logJsonPrettify', (done) => {
        const serviceDataToUpdate = {"logJsonPrettify" : true}

        chai.request(app)
            .put(ENDPOINTS.maxine.config)
            .set("Authorization", `Bearer ${accessToken}`)
            .set('Content-Type', 'application/json')
            .send(serviceDataToUpdate)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("logJsonPrettify", "Success");
                config.logJsonPrettify.should.be.eql(serviceDataToUpdate["logJsonPrettify"]);
                done();
            });
    });

    it('PUT /config (Update serverSelectionStrategy to RH) -> 200 & Update config serverSelectionStrategy (RH)', (done) => {
        const serviceDataToUpdate = {"serverSelectionStrategy" : 'RH'}

        chai.request(app)
            .put(ENDPOINTS.maxine.config)
            .set("Authorization", `Bearer ${accessToken}`)
            .set('Content-Type', 'application/json')
            .send(serviceDataToUpdate)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("serverSelectionStrategy", "Success");
                sssChecker.isRoundRobin().should.be.false;
                sssChecker.isRendezvousHashing().should.be.true; // We assigned SSS to RH
                sssChecker.isConsistentHashing().should.be.false;
                done();
            });
    });

    it('PUT /config (Update serverSelectionStrategy to CH) -> 200 & Update config serverSelectionStrategy (CH)', (done) => {
        const serviceDataToUpdate = {"serverSelectionStrategy" : 'CH'}

        chai.request(app)
            .put(ENDPOINTS.maxine.config)
            .set("Authorization", `Bearer ${accessToken}`)
            .set('Content-Type', 'application/json')
            .send(serviceDataToUpdate)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("serverSelectionStrategy", "Success");
                sssChecker.isRoundRobin().should.be.false;
                sssChecker.isRendezvousHashing().should.be.false;
                sssChecker.isConsistentHashing().should.be.true; // We assigned SSS to CH
                done();
            });
    });

    it('PUT /config (Update serverSelectionStrategy to RR) -> 200 & Update config serverSelectionStrategy (RR)', (done) => {
        const serviceDataToUpdate = {"serverSelectionStrategy" : 'RR'}

        chai.request(app)
            .put(ENDPOINTS.maxine.config)
            .set("Authorization", `Bearer ${accessToken}`)
            .set('Content-Type', 'application/json')
            .send(serviceDataToUpdate)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("serverSelectionStrategy", "Success");
                sssChecker.isRoundRobin().should.be.true; // We assigned SSS to RR
                sssChecker.isRendezvousHashing().should.be.false;
                sssChecker.isConsistentHashing().should.be.false;
                done();
            });
    });

    it('PUT /config (Update logFormat to JSON) -> 200 & Update config logFormat (JSON)', (done) => {
        const serviceDataToUpdate = {"logFormat" : 'JSON'}

        chai.request(app)
            .put(ENDPOINTS.maxine.config)
            .set("Authorization", `Bearer ${accessToken}`)
            .set('Content-Type', 'application/json')
            .send(serviceDataToUpdate)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("logFormat", "Success");
                logFormatChecker.isJsonFormat().should.be.true;
                logFormatChecker.isPlainFormat().should.be.false;
                done();
            });
    });

    it('PUT /config (Update logFormat to PLAIN) -> 200 & Update config logFormat (PLAIN)', (done) => {
        const serviceDataToUpdate = {"logFormat" : 'PLAIN'}

        chai.request(app)
            .put(ENDPOINTS.maxine.config)
            .set("Authorization", `Bearer ${accessToken}`)
            .set('Content-Type', 'application/json')
            .send(serviceDataToUpdate)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("logFormat", "Success");
                logFormatChecker.isJsonFormat().should.be.false;
                logFormatChecker.isPlainFormat().should.be.true;
                done();
            });
    });

});