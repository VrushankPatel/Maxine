const assert = require('assert');
var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('..');
const config = require('../src/config/config');
const { generateAccessToken } = require('../src/security/jwt');
const { constants } = require('../src/util/constants/constants');
const { testUser } = require('./testUtil/test-constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);

const fileName = require('path').basename(__filename).replace(".js","");
const accessToken = generateAccessToken(testUser);

const serviceDataToUpdate = {
    "logAsync" : true,
    "heartBeatTimeout" : 12,
    "logJsonPrettify" : true,
    "serverSelectionStrategy" : "RH"
}

describe(`${fileName} : API /api/maxine`, () => {

    it('GET /config -> 200 & should return the initial configs of maxine', (done) => {
        chai.request(app)
            .get('/api/maxine/config')
            .set("Authorization", `Bearer ${accessToken}`)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.eql(config);
                done();
            });
    });

    it('PUT /config -> 200 & should update the config with given data and returns the update status', (done) => {
        chai.request(app)
            .put('/api/maxine/config')
            .set("Authorization", `Bearer ${accessToken}`)
            .set('Content-Type', 'application/json')
            .send(serviceDataToUpdate)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                const body = res.body;
                body.should.be.a('object');
                body.should.have.own.property("logAsync", "Success");
                body.should.have.own.property("heartBeatTimeout", "Success");
                body.should.have.own.property("logJsonPrettify", "Success");
                done();
            });
    });

    it('GET /config -> 200 & we\'ll compare the updated config.', (done) => {
        chai.request(app)
            .get('/api/maxine/config')
            .set("Authorization", `Bearer ${accessToken}`)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;

                const body = res.body;

                body.should.be.eql(config);

                body.should.have.own.property("logAsync", serviceDataToUpdate["logAsync"]);
                body.should.have.own.property("heartBeatTimeout", serviceDataToUpdate["heartBeatTimeout"]);
                body.should.have.own.property("logJsonPrettify", serviceDataToUpdate["logJsonPrettify"]);
                body.should.have.own.property("serverSelectionStrategy");
                const serverSelStratRetrieved = body["serverSelectionStrategy"];
                const serverSelStratOriginal = constants.SSS[serviceDataToUpdate["serverSelectionStrategy"]];
                assert.deepEqual(serverSelStratRetrieved, serverSelStratOriginal, "[message]");
                done();
            });
    });
});