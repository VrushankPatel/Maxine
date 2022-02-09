const express = require('express');
const fs = require('fs')

const { constants, httpStatus } = require('../../util/constants/constants');
const { logger } = require('../../util/logging/maxine-logging-util');

const logsRoute = express.Router();

logsRoute.get('/download/:level', (req, res) => {
    const logLevel = req.params.level;
    const logFilePath = `${constants.LOGDIR}\\${logLevel}.log`;    
    
    fs.promises
        .access(logFilePath)
        .then(() => {        
            res.download(logFilePath);
        }).catch(() => {
            const errMsg = `Requested log file (to download) could not be found : ${logLevel}.log`;
            logger.error(errMsg);
            res.status(httpStatus.STATUS_NOT_FOUND).json({"message": errMsg});
        });    
});

module.exports = logsRoute;