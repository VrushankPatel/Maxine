var chai = require('chai');
var chaiHttp = require('chai-http');
const app = require('..');
const { constants } = require('../src/util/constants/constants');
var should = chai.should();
chai.use(require('chai-json'));
chai.use(chaiHttp);
const jwt = require('jsonwebtoken');

const fileName = require('path').basename(__filename).replace(".js","");

describe(`${fileName} : API /api/maxine/signin`, () => {
    it('/signin Signin endpoint fire but without any payload, it should return 400 Bad request.', (done) => {
        chai.request(app)
            .post('/api/maxine/signin')
            .end((_, res) => {
                res.should.have.status(400);
                res.should.be.json;
                res.body.should.be.a('object');
                done();
            });
    });

    it('/signin Signin endpoint fire with the payload of admin credentials, we should get accessToken as response.', (done) => {
        chai.request(app)
            .post('/api/maxine/signin')
            .set('content-type', 'application/json')
            .send({userName: constants.DEFAULT_ADMIN_USERNAME_PWD, password: constants.DEFAULT_ADMIN_USERNAME_PWD})
            .end((_, res) => {
                res.should.have.status(200);
                res.should.be.json;
                res.body.should.be.a('object');
                res.body.should.have.own.property("accessToken");
                const token = res.body["accessToken"];

                jwt.verify(token, constants.SECRET, (err, user) => {
                    user.should.be.a('object');
                    user.should.have.own.property("userName", constants.DEFAULT_ADMIN_USERNAME_PWD);
                    user.should.have.own.property("password", constants.DEFAULT_ADMIN_USERNAME_PWD);

                    const tokenExpiration = user.exp - user.iat;
                    tokenExpiration.should.be.eql(constants.EXPIRATION_TIME);

                    should.not.exist(err);
                });
                done();
            });
    });
});