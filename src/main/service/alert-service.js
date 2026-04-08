const axios = require('axios');
const { constants } = require('../util/constants/constants');
const { auditService } = require('./audit-service');
const { observabilityService } = require('./observability-service');

class AlertService {
    recentAlerts = [];

    pushRecentAlert = (alert) => {
        if (this.recentAlerts.length >= constants.RECENT_ALERT_LIMIT) {
            this.recentAlerts.shift();
        }

        this.recentAlerts.push(alert);
    }

    emit = async ({ severity = 'warning', type, message, details = {} }) => {
        const alert = {
            timestamp: new Date().toISOString(),
            severity,
            type,
            message,
            details
        };

        this.pushRecentAlert(alert);
        observabilityService.recordAlert();
        auditService.record('alert.emitted', {
            outcome: 'ALERTED',
            severity,
            alertType: type,
            message,
            details
        });

        if (!constants.ALERT_WEBHOOK_URL) {
            return alert;
        }

        try {
            await axios.post(constants.ALERT_WEBHOOK_URL, alert, {
                timeout: constants.ALERT_WEBHOOK_TIMEOUT_MS
            });
        } catch (err) {
            auditService.record('alert.delivery_failed', {
                outcome: 'ERROR',
                severity,
                alertType: type,
                message: err.message
            });
        }

        return alert;
    }

    getRecentAlerts = () => this.recentAlerts.slice().reverse();

    clearRecentAlerts = () => {
        this.recentAlerts = [];
    }
}

const alertService = new AlertService();

module.exports = {
    alertService
};
