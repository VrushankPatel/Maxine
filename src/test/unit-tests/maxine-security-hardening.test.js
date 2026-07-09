const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../../../index');
const { User } = require('../../main/entity/user');
const { ENDPOINTS, testUser } = require('../testUtil/test-constants');
const bcrypt = require('bcrypt');

const should = chai.should();
chai.use(chaiHttp);

describe('Maxine Security Hardening Tests', () => {
    describe('Bcrypt Password Hashing', () => {
        it('should hash password on User instantiation if not already hashed', () => {
            const user = new User('temp_user', 'plain_password', 'viewer');
            user.password.should.not.equal('plain_password');
            bcrypt.compareSync('plain_password', user.password).should.be.true;
            user.password.startsWith('$2').should.be.true; // bcrypt hash format
        });

        it('should not double-hash an already hashed password', () => {
            const user = new User('temp_user', 'plain_password', 'viewer');
            const originalHash = user.password;
            
            // Re-instantiate or construct with the hash
            const user2 = new User('temp_user', originalHash, 'viewer');
            user2.password.should.equal(originalHash);
        });
    });

    describe('Sign-in Rate Limiting', () => {
        it('should return rate limiting headers on sign-in requests', (done) => {
            chai.request(app)
                .post(ENDPOINTS.maxine.signin)
                .set('content-type', 'application/json')
                .send(testUser)
                .end((err, res) => {
                    should.not.exist(err);
                    res.headers.should.have.property('ratelimit-limit');
                    res.headers.should.have.property('ratelimit-remaining');
                    res.headers.should.have.property('ratelimit-reset');
                    done();
                });
        });
    });
});
