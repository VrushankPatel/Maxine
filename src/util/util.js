const date = require('date-and-time');
const { constants } = require('./constants/constants');

const getLoggerDate = () => {
    return date.format(new Date(), constants.REQUEST_LOG_TIMESTAMP_FORMAT);
}

module.exports = {
    getLoggerDate
}