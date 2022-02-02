const envVars = process.env;
const PORT = parseInt(envVars.PORT) || 8080;
const PROFILE = (envVars.profile || "prod").trim();
const BANNERPATH = 'src/resources/Banner.txt';
const LOGDIR = './logs/';
const LOGLEVELS = ['error', 'warn', 'info', 'debug', 'silly']; // verbose
const LOGTIMESTAMPFORMAT = 'DD-MMM-YYYY HH:mm:ss';
const ACTUATORPATH = '/actuator';
const STATUSMONITORTITLE = 'Status : Maxine';

// Http Status Code and Messages
const STATUS_NOT_FOUND = 404;
const MSG_NOT_FOUND = "Not found";

const STATUS_SUCCESS = 200;
const MSG_SUCCESS_SHUTDOWN = "Initiated shutdown.";

const constants = {
    PORT,
    PROFILE,
    BANNERPATH,
    LOGDIR,
    LOGLEVELS,
    LOGTIMESTAMPFORMAT,
    ACTUATORPATH,
    STATUSMONITORTITLE
};

const httpStatus = {
    STATUS_NOT_FOUND,
    MSG_NOT_FOUND,
    STATUS_SUCCESS,
    MSG_SUCCESS_SHUTDOWN
}

module.exports = {
    constants,
    httpStatus
};
