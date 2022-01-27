var morgan = require('morgan');
var path = require('path');
const fs = require('fs')
const constants = require('../constants/constants');
var rfs = require('rotating-file-stream');

var accessLogStream = rfs.createStream('maxine.log', {
    interval: '1d',
    path: path.join(__dirname, '../logs')
});

const banner = fs.readFileSync('resources/Banner.txt', 'utf8');

const loggingUtil = {
    logger : constants.PROFILE === "dev" ? morgan("dev") : morgan('combined', { stream: accessLogStream }),
    initApp : (port) => { 
        console.log(`${banner} > started on port : ${constants.PORT}\n`);
    }
}

module.exports = loggingUtil;