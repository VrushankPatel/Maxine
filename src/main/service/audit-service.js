const fs = require('fs');
const path = require('path');
const { constants } = require('../util/constants/constants');

class AuditService {
    recentEvents = [];

    pushRecentEvent = (event) => {
        if (this.recentEvents.length >= constants.RECENT_AUDIT_LIMIT) {
            this.recentEvents.shift();
        }

        this.recentEvents.push(event);
    }

    persistEvent = (event) => {
        const directory = path.dirname(constants.AUDIT_LOG_FILE);
        fs.mkdirSync(directory, { recursive: true });
        fs.appendFile(constants.AUDIT_LOG_FILE, `${JSON.stringify(event)}\n`, () => {});
    }

    record = (type, details = {}) => {
        const event = {
            timestamp: new Date().toISOString(),
            type,
            ...details
        };

        this.pushRecentEvent(event);
        this.persistEvent(event);
        return event;
    }

    getRecentEvents = () => this.recentEvents.slice().reverse();

    clearRecentEvents = () => {
        this.recentEvents = [];
    }
}

const auditService = new AuditService();

module.exports = {
    auditService
};
