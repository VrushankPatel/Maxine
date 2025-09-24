const envArgs = require('minimist')(process.argv.slice(2));
const PORT = process.env.PORT || parseInt(envArgs['p']) || parseInt(envArgs['port']) || 8080;
const APP_NAME = "Maxine-Service-Discovery";
const PROFILE = (envArgs['env'] || envArgs['profile'] || "prod").trim();
const CURRDIR = process.cwd();
const LOGDIR = `${CURRDIR}/logs/`;
const LOGLEVELS = ['info']; // verbose, silly, error, warn
const LOGTIMESTAMPFORMAT = 'DD-MMM-YYYY HH:mm:ss';
const LOG_EXPELLED_URLS = [
    "/static",
    "/api/logs/recent",
    "/api/logs/download",
    "/api/logs/latestfile",
    "/api/maxine/serviceops/servers",
    "/api/maxine/serviceops/discover"
]
const SWAGGER_PATH = "./api-specs/swagger.yaml";
const ACTUATORPATH = '/api/actuator';
const STATUSMONITORTITLE = 'Status : Maxine';
const REQUEST_LOG_TIMESTAMP_FORMAT = 'DD/MM/YYYY HH:mm:ss';
const DEFAULT_ADMIN_USERNAME_PWD = "admin";
const EXPIRATION_TIME = PROFILE === "dev" ? 86000 : 1800;
const DEV_SECRET = "55e871f9889bb099df419b6b3c3a852582f9f0551d0ddc367b329dcd608a22d43b60efa62979ba0d9fe91d12cc56d03aa0c89e28707b1e039a7fc33e3a86b2d0";
const PROD_SECRET = require('crypto').randomBytes(64).toString('hex');
const SECRET = PROFILE === "dev" ? DEV_SECRET : PROD_SECRET;
const MAX_SERVER_WEIGHT = 10;
const RENDEZVOUS_HASH_ALGO = "sha256";
const CONSISTENT_HASH_ALGO = "sha256";
const CONSISTENT_HASHING_OPTIONS = {
    algorithm: CONSISTENT_HASH_ALGO
}

/**
 * Below are SSS : Server Selection Strategies for Load Balancer
 * RR : Round Robin
 * CH : Consistent Hashing
 * RH : Rendezvous hashing
 * LC : Least Connections
 * RANDOM : Random
 */
const SSS = {
    RR: '0',
    WRR: '5',
    WRANDOM: '13',
    LRT: '6',
    FASTEST: '9',
    CH: '1',
    RH: '2',
    LC: '3',
    LL: '7',
    RANDOM: '4',
    ADAPTIVE: '8',
    P2: '10',
    STICKY: '11',
    LR: '12',
    PRIORITY: '14',
    BHS: '15',
    GEO: '16',
    AFFINITY: '17'
};
const LOG_FORMATS = {
    JSON: '0',
    PLAIN: '1'
}

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
const MSG_DISCOVER_MISSING_DATA = "Please provide the serviceName.";
const MSG_SERVICE_REMOVED = "Removed from registry";
const MSG_SERVICE_REGISTERED = "Successfully Registered";
const MSG_SERVICE_UNAVAILABLE = "Service Unavailable";
const MSG_MISSING_UNAME_PWD = "Please provide both of these -> userName and password."
const MSG_MISSING_PWD = "Please provide valid existing password and new password both."
const MSG_DB_CON_SUCCESS = "DB Connection Successful";
const MSG_DB_CON_FAILURE = "Unable to connect to DB, closing App..";
const MSG_JWT_EXPIRED = "JWT token expired";
const MSG_FORBIDDEN = "Forbidden";
const MSG_UNAUTHORIZED = "Unauthorized";
const MSG_INVALID_SERVICE_DATA = `Invalid or missing -> hostName, nodeName, serviceName or weight (Maximum allowed size of weight is ${MAX_SERVER_WEIGHT} (One server can maximum be ${MAX_SERVER_WEIGHT}x more powerful than others)`;
const CONFIGTYPES = ["sync", "async"];
const SERVER_SELECTION_STRATEGIES = ["round-robin", "consistent-hashing"];
const API_URLS_WITH_AUTH = [
    '/api/maxine/control/config',
    '/api/maxine/serviceops/servers',
    '/api/maxine/change-password',
    '/api/maxine/verifyToken',
    '/api/logs',
    '/logs'
];
// for Config updates, status codes (customized)
const CODE_SUCCESS = 0;
const CODE_TYPE_ERROR = 1;
const CODE_INVALID_DATA = 2;

const CONFIG_STATUS_CODES = {
    0 : "Success",
    1 : "Type Error",
    2 : "Wrong value Or Invalid value"
}

const constants = {
    PORT,
    APP_NAME,
    PROFILE,
    CURRDIR,
    LOGDIR,
    LOGLEVELS,
    LOGTIMESTAMPFORMAT,
    LOG_EXPELLED_URLS,
    ACTUATORPATH,
    STATUSMONITORTITLE,
    REQUEST_LOG_TIMESTAMP_FORMAT,
    DEFAULT_ADMIN_USERNAME_PWD,
    EXPIRATION_TIME,
    SECRET,
    API_URLS_WITH_AUTH,
    MAX_SERVER_WEIGHT,
    SSS,
    SWAGGER_PATH,
    LOG_FORMATS,
    CONFIGTYPES,
    SERVER_SELECTION_STRATEGIES,
    CODE_SUCCESS,
    CODE_TYPE_ERROR,
    CODE_INVALID_DATA,
    CONFIG_STATUS_CODES,
    RENDEZVOUS_HASH_ALGO,
    CONSISTENT_HASH_ALGO,
    CONSISTENT_HASHING_OPTIONS
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
    MSG_INVALID_SERVICE_DATA,
    MSG_DISCOVER_MISSING_DATA,
    MSG_SERVICE_REMOVED,
    MSG_SERVICE_REGISTERED,
    MSG_SERVICE_UNAVAILABLE,
    MSG_DB_CON_SUCCESS,
    MSG_DB_CON_FAILURE,
    MSG_MISSING_UNAME_PWD,
    MSG_MISSING_PWD,
    MSG_JWT_EXPIRED,
    MSG_UNAUTHORIZED,
    MSG_FORBIDDEN
}

module.exports = {
    constants,
    statusAndMsgs
};
