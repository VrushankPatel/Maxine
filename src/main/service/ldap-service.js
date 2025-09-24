const ActiveDirectory = require('activedirectory');
const config = require('../config/config');
const { audit } = require('../util/logging/logging-util');

class LdapService {
    constructor() {
        this.ad = null;
        this.initialize();
    }

    initialize() {
        if (config.ldapEnabled && config.ldapUrl) {
            const adConfig = {
                url: config.ldapUrl,
                baseDN: config.ldapBaseDN,
                username: config.ldapBindUser,
                password: config.ldapBindPassword
            };
            this.ad = new ActiveDirectory(adConfig);
            console.log('LDAP authentication initialized');
        }
    }

    async authenticate(username, password) {
        if (!this.ad) {
            throw new Error('LDAP not configured');
        }

        return new Promise((resolve, reject) => {
            this.ad.authenticate(username, password, (err, auth) => {
                if (err) {
                    audit(`LDAP_AUTH_FAILED`, { user: username, error: err.message });
                    reject(err);
                    return;
                }

                if (auth) {
                    audit(`LDAP_AUTH_SUCCESS`, { user: username });
                    // Get user details
                    this.ad.findUser(username, (err, user) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve({
                            username: user.sAMAccountName || user.cn,
                            displayName: user.displayName,
                            email: user.mail,
                            groups: user.memberOf || []
                        });
                    });
                } else {
                    audit(`LDAP_AUTH_FAILED`, { user: username, reason: 'invalid_credentials' });
                    reject(new Error('Invalid credentials'));
                }
            });
        });
    }

    async getUserGroups(username) {
        if (!this.ad) {
            throw new Error('LDAP not configured');
        }

        return new Promise((resolve, reject) => {
            this.ad.getGroupMembershipForUser(username, (err, groups) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(groups || []);
            });
        });
    }
}

module.exports = new LdapService();