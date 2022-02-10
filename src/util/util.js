const date = require('date-and-time');
const { constants } = require('./constants/constants');

const getCurrentDate = () => date.format(new Date(), constants.REQUEST_LOG_TIMESTAMP_FORMAT);

const containsExcludedLoggingUrls = (url) => {    
    for (const excChunk in constants.LOG_EXCLUDED_URLS_CHUNKS) {
        if(url.includes(excChunk)){
            return true
        }
    }    
    return false;
}

module.exports = {
    getCurrentDate,    
    containsExcludedLoggingUrls
}