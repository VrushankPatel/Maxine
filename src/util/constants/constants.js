const envVars = process.env;
const PORT = parseInt(envVars.PORT) || 8080;
const APP_NAME = "Maxine Discovery";
const PROFILE = (envVars.profile || "prod").trim();
const BANNERPATH = 'src/resources/Banner.txt';
const LOGDIR = './logs/';
const LOGLEVELS = ['error', 'warn', 'info', 'debug', 'silly']; // verbose
const LOGTIMESTAMPFORMAT = 'DD-MMM-YYYY HH:mm:ss';
const ACTUATORPATH = '/actuator';
const STATUSMONITORTITLE = 'Status : Maxine';
const REQUEST_LOG_TIMESTAMP_FORMAT = 'YYYY/MM/DD HH:mm:ss';

// Http Status Code and Messages
const STATUS_NOT_FOUND = 404;
const MSG_NOT_FOUND = "Not found";

const STATUS_SUCCESS = 200;
const MSG_SUCCESS_SHUTDOWN = "Initiated shutdown.";

const STATUS_SERVER_ERROR = 500;
const MSG_MAXINE_SERVER_ERROR = "Unknown error occured, Please try again later";
const constants = {
    PORT,
    APP_NAME,
    PROFILE,
    BANNERPATH,
    LOGDIR,
    LOGLEVELS,
    LOGTIMESTAMPFORMAT,
    ACTUATORPATH,
    STATUSMONITORTITLE,
    REQUEST_LOG_TIMESTAMP_FORMAT
};

const httpStatus = {
    STATUS_NOT_FOUND,
    MSG_NOT_FOUND,
    STATUS_SUCCESS,
    MSG_SUCCESS_SHUTDOWN,
    STATUS_SERVER_ERROR,
    MSG_MAXINE_SERVER_ERROR 
}

module.exports = {
    constants,
    httpStatus
};
