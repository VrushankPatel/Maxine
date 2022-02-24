const { properties } = require("../propertyReader/propertyReader");

const envArgs = process.argv; // first paramerer : port and second parameter : node name
const envVars = process.env;

const PORT = parseInt(envArgs[2]) || parseInt(envVars.PORT) || properties["server.port"];
const APP_NAME = properties["app.name"];
const APP_NODE_NAME = envArgs[3] || properties["app.node.name"];
const MASTER_NODE = properties["master.node.address"];
const HEARTBEAT_TIMEOUT = properties["heartBeat.timeOut"];
const PROFILE = (envVars.profile || "prod").trim();
const BANNERPATH = 'src/resources/Banner.txt';
const LOGDIR = './logs/';
const LOGLEVELS = ['info']; // verbose, silly, error, warn
const LOGTIMESTAMPFORMAT = 'DD-MMM-YYYY HH:mm:ss';
const ACTUATORPATH = '/actuator';
const STATUSMONITORTITLE = 'Status : Maxine';
const REQUEST_LOG_TIMESTAMP_FORMAT = 'YYYY/MM/DD HH:mm:ss';
const LOG_EXCLUDED_URLS_CHUNKS = [    
    
]

// Http Status Code and Messages
const STATUS_NOT_FOUND = 404;
const MSG_NOT_FOUND = "Not found";

const STATUS_SUCCESS = 200;
const STATUS_GENERIC_ERROR = 400;
const STATUS_SERVER_ERROR = 500;
const MSG_SUCCESS_SHUTDOWN = "Initiated shutdown.";
const MSG_MAXINE_SERVER_ERROR = "Unknown error occured, Please try again later";
const MSG_FILE_NOT_FOUND = "File not found";
const MSG_MISSING_DATA = "Please provide all of these -> hostName, nodeName, port and serviceName";
const MSG_SERVICE_REMOVED = "Removed from registry";
const MSG_SERVICE_REGISTERED = "Successfully Registered";
const constants = {
    PORT,
    APP_NAME,
    APP_NODE_NAME,
    MASTER_NODE,
    HEARTBEAT_TIMEOUT,
    PROFILE,
    BANNERPATH,
    LOGDIR,
    LOGLEVELS,
    LOGTIMESTAMPFORMAT,
    ACTUATORPATH,
    STATUSMONITORTITLE,
    REQUEST_LOG_TIMESTAMP_FORMAT,
    LOG_EXCLUDED_URLS_CHUNKS
};

const httpStatus = {
    STATUS_NOT_FOUND,    
    STATUS_SUCCESS,
    STATUS_SERVER_ERROR,
    STATUS_GENERIC_ERROR,
    MSG_SUCCESS_SHUTDOWN,    
    MSG_MAXINE_SERVER_ERROR,
    MSG_FILE_NOT_FOUND,
    MSG_NOT_FOUND,    
    MSG_MISSING_DATA,
    MSG_SERVICE_REMOVED,
    MSG_SERVICE_REGISTERED
}

module.exports = {
    constants,
    httpStatus
};
