var chai = require('chai');
var chaiHttp = require('chai-http');
const fs = require('fs');
const app = require('../../../index');
const { constants } = require('../../main/util/constants/constants');
const { admin } = require('../../main/entity/user');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);
const jwt = require('jsonwebtoken');
const { testUser, ENDPOINTS } = require('../testUtil/test-constants');

const fileName = require('path').basename(__filename).replace(".js","");

describe(`${fileName} : API /api/maxine/signin`, () => {
    after(() => {
        admin.password = testUser.password;
        admin.credentialVersion = 0;
        fs.rmSync(constants.ADMIN_STATE_FILE, { force: true });
    });

    it('POST /signin Signin endpoint fire but without any payload, it should return 400 Bad request.', (done) => {
        chai.request(app)
            .post(ENDPOINTS.maxine.signin)
            .end((_, res) => {
                res.should.have.status(400);
                res.should.be.json;
                res.body.should.be.a('object');
                done();
            });
    });

    it('POST /signin Signin endpoint fire with the payload of admin credentials, we should get accessToken as response.', (done) => {
        chai.request(app)
            .post(ENDPOINTS.maxine.signin)
            .set('content-type', 'application/json')
            .send(testUser)
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.have.own.property("accessToken");
                const token = res.body["accessToken"];

                jwt.verify(token, constants.SECRET, (err, user) => {
                    user.should.be.a('object');
                    user.should.have.own.property("userName", admin.userName);
                    user.should.have.own.property("credentialVersion", admin.credentialVersion);
                    user.should.not.have.own.property("password");

                    const tokenExpiration = user.exp - user.iat;
                    tokenExpiration.should.be.eql(constants.EXPIRATION_TIME);

                    should.not.exist(err);
                });
                done();
            });
    });

    it('PUT /change-password rotates credentials and invalidates old tokens', (done) => {
        chai.request(app)
            .post(ENDPOINTS.maxine.signin)
            .set('content-type', 'application/json')
            .send(testUser)
            .end((_, signInRes) => {
                signInRes.should.have.status(200);
                const oldToken = signInRes.body.accessToken;

                chai.request(app)
                    .put(ENDPOINTS.maxine.changePassword)
                    .set("Authorization", `Bearer ${oldToken}`)
                    .set('content-type', 'application/json')
                    .send({
                        password: testUser.password,
                        newPassword: 'admin2'
                    })
                    .end((_, changePwdRes) => {
                        changePwdRes.should.have.status(200);

                        chai.request(app)
                            .get(ENDPOINTS.maxine.config)
                            .set("Authorization", `Bearer ${oldToken}`)
                            .end((_, oldTokenRes) => {
                                oldTokenRes.should.have.status(401);

                                chai.request(app)
                                    .post(ENDPOINTS.maxine.signin)
                                    .set('content-type', 'application/json')
                                    .send(testUser)
                                    .end((_, oldPasswordRes) => {
                                        oldPasswordRes.should.have.status(401);

                                        chai.request(app)
                                            .post(ENDPOINTS.maxine.signin)
                                            .set('content-type', 'application/json')
                                            .send({
                                                userName: testUser.userName,
                                                password: 'admin2'
                                            })
                                            .end((_, newPasswordRes) => {
                                                newPasswordRes.should.have.status(200);
                                                const newToken = newPasswordRes.body.accessToken;

                                                chai.request(app)
                                                    .put(ENDPOINTS.maxine.changePassword)
                                                    .set("Authorization", `Bearer ${newToken}`)
                                                    .set('content-type', 'application/json')
                                                    .send({
                                                        password: 'admin2',
                                                        newPassword: testUser.password
                                                    })
                                                    .end((_, restoreRes) => {
                                                        restoreRes.should.have.status(200);
                                                        done();
                                                    });
                                            });
                                    });
                            });
                    });
            });
    });
});
