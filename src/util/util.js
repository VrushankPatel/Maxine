const date = require('date-and-time');
const { constants } = require('./constants/constants');

const getCurrentDate = () => {
    return date.format(new Date(), constants.REQUEST_LOG_TIMESTAMP_FORMAT);
}

const keepRangeBetween = (num, min, max) => {
    num = num > max ? max : num < min ? min : num;
    return num;
}

const containsExcludedLoggingUrls = (url) => {
    let result = false;
    constants.LOG_EXCLUDED_URLS_CHUNKS.forEach(excChunk => {
        result = url.includes(excChunk);        
    });
    return result;
}

module.exports = {
    getCurrentDate,
    keepRangeBetween,
    containsExcludedLoggingUrls
}