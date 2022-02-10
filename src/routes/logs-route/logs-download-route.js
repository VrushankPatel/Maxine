const express = require('express');
const fs = require('fs');
const { constants, httpStatus } = require('../../util/constants/constants');
const { logger } = require('../../util/logging/maxine-logging-util');
const readLastLines = require('read-last-lines');
const { keepRangeBetween } = require('../../util/util');
const logsRoute = express.Router();

logsRoute.get('/download/:level', (req, res) => {
    global.logLevel = req.params.level;
    const logFilePath = `${constants.LOGDIR}\\${logLevel}.log`;
    fs.promises
        .access(logFilePath)
        .then(() => {
            const logFileName = `Maxine - ${logLevel.toUpperCase()} [ ${new Date().toUTCString()} ].log`;
            res.download(logFilePath, logFileName);
        }).catch(() => {
            const errMsg = `Requested log file (to download) could not be found : ${logLevel}.log`;
            logger.error(errMsg);
            res.status(httpStatus.STATUS_NOT_FOUND).json({"message": errMsg});
        });
});


logsRoute.get("/console", (req, res) => {        
    let {level, maxLines} = req.query;
    maxLines = req.query.maxLines ? keepRangeBetween(req.query.maxLines, 10, 100) : 50;

    const logFilePath = `${constants.LOGDIR}\\${level}.log`;
    readLastLines.read(logFilePath, maxLines)
        .then((lines) => {        
            res.type('text/plain').send(lines);
        })
        .catch(() => {
            const errMsg = `Requested log file could not be found : ${level}`;
            logger.error(errMsg);
            res.status(httpStatus.STATUS_NOT_FOUND).json({"message": errMsg});
        });
    
});

module.exports = logsRoute; 