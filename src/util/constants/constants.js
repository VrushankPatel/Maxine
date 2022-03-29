const envArgs = require('minimist')(process.argv.slice(2));

const PORT = parseInt(envArgs['p']) || parseInt(envArgs['port']) || 8080;

const APP_NAME = "Maxine-Service-Discovery";
const PROFILE = (envArgs['env'] || envArgs['profile'] || "prod").trim();
const BANNERPATH = 'src/resources/Banner.txt';
const LOGDIR = './logs/';
const LOGLEVELS = ['info']; // verbose, silly, error, warn
const LOGTIMESTAMPFORMAT = 'DD-MMM-YYYY HH:mm:ss';
const ACTUATORPATH = '/api/actuator';
const STATUSMONITORTITLE = 'Status : Maxine';
const REQUEST_LOG_TIMESTAMP_FORMAT = 'YYYY/MM/DD HH:mm:ss';
const DEFAULT_ADMIN_USERNAME_PWD = "admin";
const EXPIRATION_TIME = PROFILE === "dev" ? 86000 : 1800;
const DEV_SECRET = "55e871f9889bb099df419b6b3c3a852582f9f0551d0ddc367b329dcd608a22d43b60efa62979ba0d9fe91d12cc56d03aa0c89e28707b1e039a7fc33e3a86b2d0";
const PROD_SECRET = require('crypto').randomBytes(64).toString('hex');
const SECRET = PROFILE === "dev" ? DEV_SECRET : PROD_SECRET;

// Http Status Code and Messages
const STATUS_NOT_FOUND = 404;
const MSG_NOT_FOUND = "Not found";
const STATUS_SUCCESS = 200;
const STATUS_GENERIC_ERROR = 400;
const STATUS_SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const MSG_MAXINE_SERVER_ERROR = "Unknown error occured, Please try again later";
const MSG_FILE_NOT_FOUND = "File not found";
const MSG_REGISTER_MISSING_DATA = "Please provide all of these -> hostName, nodeName, port and serviceName";
const MSG_DISCOVER_MISSING_DATA = "Please provide the serviceName.";
const MSG_SERVICE_REMOVED = "Removed from registry";
const MSG_SERVICE_REGISTERED = "Successfully Registered";
const MSG_SERVICE_UNAVAILABLE = "Service Unavailable";
const MSG_MISSING_UNAME_PWD = "Please provide both of these -> userName and password."
const MSG_DB_CON_SUCCESS = "DB Connection Successful";
const MSG_DB_CON_FAILURE = "Unable to connect to DB, closing App..";
const MSG_JWT_EXPIRED = "JWT token expired";
const MSG_UNAUTHORIZED = "Unauthorized";

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
    REQUEST_LOG_TIMESTAMP_FORMAT,
    DEFAULT_ADMIN_USERNAME_PWD,
    EXPIRATION_TIME,
    SECRET
};

const statusAndMsgs = {
    STATUS_NOT_FOUND,
    STATUS_SUCCESS,
    STATUS_SERVER_ERROR,
    STATUS_GENERIC_ERROR,
    STATUS_UNAUTHORIZED,
    STATUS_FORBIDDEN,
    SERVICE_UNAVAILABLE,
    MSG_MAXINE_SERVER_ERROR,
    MSG_FILE_NOT_FOUND,
    MSG_NOT_FOUND,
    MSG_REGISTER_MISSING_DATA,
    MSG_DISCOVER_MISSING_DATA,
    MSG_SERVICE_REMOVED,
    MSG_SERVICE_REGISTERED,
    MSG_SERVICE_UNAVAILABLE,
    MSG_DB_CON_SUCCESS,
    MSG_DB_CON_FAILURE,
    MSG_MISSING_UNAME_PWD,
    MSG_JWT_EXPIRED,
    MSG_UNAUTHORIZED
}

module.exports = {
    constants,
    statusAndMsgs
};
