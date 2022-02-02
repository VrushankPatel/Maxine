const fs = require('fs');
const winston = require('winston');
const { format } = require('winston');
const config = require('../config/config');
const {constants} = require('../constants/constants');
const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');
const date = require('date-and-time');

const logFileTransports = [new winston.transports.Console()].concat(
    constants.LOGLEVELS.map(logLevel => new winston.transports.File({
        level: logLevel,
        filename: `logs/${logLevel}.log`,
        handleExceptions: true,        
        // maxsize: 5242880,
        // maxFiles: 5
    }))
);

const buildLogger = (logName) => {
    const logConfiguration = {
        transports: logFileTransports,
        format: format.combine(
            format.label({label: `〉 ${logName} 〉`}),
            format.timestamp({format: constants.LOGTIMESTAMPFORMAT}),
            format.align(),            
            format.printf(log => `【 ${log.level.toUpperCase()} 】 : ${[log.timestamp]} ${log.label} ${log.message}`),
        )
    };
    return winston.createLogger(logConfiguration);
}


const logger = buildLogger("Maxine-Server-Requests");
async function logRequestAsync (req, res) {
    /* t retrieve response body, below mechanism can be used.
    let send = res.send;
    res.send = body => {
        console.log(`Code: ${res.statusCode}`);
        console.log("Body: ", body);
        res.send = send;
        return res.send(body);
    }
    */
        
    setTimeout(() => {              
        const timeStamp = date.format(new Date(),'YYYY/MM/DD HH:mm:ss');
        const logLevel = res.statusCode >= 400 ? "error" : "info";        
        logger.log(logLevel, `\n【 WEBREQUEST 】: [ ${req.ip} ] "${req.method.toUpperCase()} ${req.url} HTTP/${req.httpVersion}" [${timeStamp}:IST] ${res.statusCode} `);        
    }, 0 );    
}
const loggingUtil = {
    getLogger: (logName) => buildLogger(logName),
    initApp : (port) => {        
        config.port = port;
        logger.info(`\n${banner} 〉 ${constants.PROFILE} started on port : ${port}\n`);
    },
    logRequest: (req, res, next) => {
        logRequestAsync(req, res);
        next();
    }
}

module.exports = loggingUtil;