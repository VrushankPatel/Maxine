const path = require('path');
const os = require('os');
const envArgs = require('minimist')(process.argv.slice(2));
const Enums = require("enums");
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
    "/api/maxine/serviceops/servers"
]
const SWAGGER_PATH = "./api-specs/swagger.yaml";
const ACTUATORPATH = '/api/actuator';
const STATUSMONITORTITLE = 'Status : Maxine';
const REQUEST_LOG_TIMESTAMP_FORMAT = 'DD/MM/YYYY HH:mm:ss';
const DEFAULT_ADMIN_USERNAME = process.env.MAXINE_ADMIN_USERNAME || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.MAXINE_ADMIN_PASSWORD || "admin";
const DEFAULT_OPERATOR_USERNAME = process.env.MAXINE_OPERATOR_USERNAME || "";
const DEFAULT_OPERATOR_PASSWORD = process.env.MAXINE_OPERATOR_PASSWORD || "";
const DEFAULT_VIEWER_USERNAME = process.env.MAXINE_VIEWER_USERNAME || "";
const DEFAULT_VIEWER_PASSWORD = process.env.MAXINE_VIEWER_PASSWORD || "";
const ADMIN_CREDENTIALS_MANAGED_BY_ENV = Boolean(process.env.MAXINE_ADMIN_USERNAME || process.env.MAXINE_ADMIN_PASSWORD);
const ADMIN_STATE_FILE = process.env.MAXINE_ADMIN_STATE_FILE || path.join(CURRDIR, "data", "admin-user.json");
const REGISTRY_STATE_FILE = process.env.MAXINE_REGISTRY_STATE_FILE || path.join(CURRDIR, "data", "registry-state.json");
const REGISTRY_PERSISTENCE_ENABLED = process.env.MAXINE_REGISTRY_PERSISTENCE !== "false";
const REGISTRY_STATE_MODE = (process.env.MAXINE_REGISTRY_STATE_MODE || "local").trim().toLowerCase();
const REGISTRY_STATE_LOCK_TIMEOUT_MS = parseInt(process.env.MAXINE_REGISTRY_STATE_LOCK_TIMEOUT_MS) || 5000;
const REGISTRY_STATE_LOCK_RETRY_MS = parseInt(process.env.MAXINE_REGISTRY_STATE_LOCK_RETRY_MS) || 100;
const REGISTRY_REDIS_URL = process.env.MAXINE_REGISTRY_REDIS_URL || "";
const REGISTRY_REDIS_KEY_PREFIX = process.env.MAXINE_REGISTRY_REDIS_KEY_PREFIX || "maxine:registry";
const REGISTRY_REDIS_CONNECT_TIMEOUT_MS = parseInt(process.env.MAXINE_REGISTRY_REDIS_CONNECT_TIMEOUT_MS) || 5000;
const CLUSTER_INSTANCE_ID = process.env.MAXINE_INSTANCE_ID || `${os.hostname()}-${process.pid}`;
const LEADER_ELECTION_ENABLED = process.env.MAXINE_LEADER_ELECTION_ENABLED !== "false";
const LEADER_ELECTION_LEASE_MS = parseInt(process.env.MAXINE_LEADER_ELECTION_LEASE_MS) || 15000;
const LEADER_ELECTION_RENEW_MS = parseInt(process.env.MAXINE_LEADER_ELECTION_RENEW_MS) || 5000;
const ACTIVE_HEALTH_CHECKS_ENABLED = process.env.MAXINE_ACTIVE_HEALTH_CHECKS_ENABLED === "true";
const ACTIVE_HEALTH_CHECK_INTERVAL_MS = parseInt(process.env.MAXINE_ACTIVE_HEALTH_CHECK_INTERVAL_MS) || 15000;
const ACTIVE_HEALTH_CHECK_TIMEOUT_MS = parseInt(process.env.MAXINE_ACTIVE_HEALTH_CHECK_TIMEOUT_MS) || 3000;
const ACTIVE_HEALTH_CHECK_FAILURE_THRESHOLD = parseInt(process.env.MAXINE_ACTIVE_HEALTH_CHECK_FAILURE_THRESHOLD) || 3;
const ACTIVE_HEALTH_CHECK_PATH = process.env.MAXINE_ACTIVE_HEALTH_CHECK_PATH || "";
const ALERT_WEBHOOK_URL = process.env.MAXINE_ALERT_WEBHOOK_URL || "";
const ALERT_WEBHOOK_TIMEOUT_MS = parseInt(process.env.MAXINE_ALERT_WEBHOOK_TIMEOUT_MS) || 5000;
const TRACE_HEADER_NAME = (process.env.MAXINE_TRACE_HEADER_NAME || "x-trace-id").toLowerCase();
const RECENT_TRACE_LIMIT = parseInt(process.env.MAXINE_RECENT_TRACE_LIMIT) || 200;
const RECENT_AUDIT_LIMIT = parseInt(process.env.MAXINE_RECENT_AUDIT_LIMIT) || 200;
const RECENT_ALERT_LIMIT = parseInt(process.env.MAXINE_RECENT_ALERT_LIMIT) || 100;
const EXPIRATION_TIME = PROFILE === "dev" ? 86000 : 1800;
const DEV_SECRET = "55e871f9889bb099df419b6b3c3a852582f9f0551d0ddc367b329dcd608a22d43b60efa62979ba0d9fe91d12cc56d03aa0c89e28707b1e039a7fc33e3a86b2d0";
const PROD_SECRET = require('crypto').randomBytes(64).toString('hex');
const SECRET = process.env.MAXINE_JWT_SECRET || (PROFILE === "dev" ? DEV_SECRET : PROD_SECRET);
const JWT_PREVIOUS_SECRETS = (process.env.MAXINE_JWT_PREVIOUS_SECRETS || "")
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean);
const JWT_SECRET_KEY_ID = process.env.MAXINE_JWT_SECRET_KEY_ID || "maxine-current";
const MAX_SERVER_WEIGHT = 10;
const RENDEZVOUS_HASH_ALGO = "sha256";
const CONSISTENT_HASH_ALGO = "sha256";
const CONSISTENT_HASHING_OPTIONS = {
    algorithm: CONSISTENT_HASH_ALGO
}
const PERFORMANCE_REPORT_URL = process.env.MAXINE_PERFORMANCE_REPORT_URL || "";
const AUDIT_LOG_FILE = process.env.MAXINE_AUDIT_LOG_FILE || path.join(LOGDIR, "Maxine-audit.log");
/**
 * Below are SSS : Server Selection Strategies for Load Balancer
 * RR : Round Robin
 * CH : Consistent Hashing
 * RH : Rendezvous hashing
 */
const SSS = new Enums([
    {name: 'RR', code: '0', message: 'Round Robin'},
    {name: 'CH', code: '1', message: 'Consistent Hashing'},
    {name: 'RH', code: '2', message: 'Rendezvous Hashing'}
]);

const LOG_FORMATS = new Enums([
    {name: 'JSON', code: '0', message: 'Jsonified logging'},
    {name: 'PLAIN', code: '1', message: 'Plain logs'}
])

const DISCOVERY_MODES = new Enums([
    {name: 'REDIRECT', code: '0', message: 'Redirect'},
    {name: 'PROXY', code: '1', message: 'Proxy'}
]);

const USER_ROLES = new Enums([
    {name: 'VIEWER', code: '0', message: 'viewer'},
    {name: 'OPERATOR', code: '1', message: 'operator'},
    {name: 'ADMIN', code: '2', message: 'admin'}
]);

// Http Status Code and Messages
const STATUS_NOT_FOUND = 404;
const MSG_NOT_FOUND = "Not found";
const STATUS_SUCCESS = 200;
const STATUS_GENERIC_ERROR = 400;
const STATUS_SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_CONFLICT = 409;
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
const MSG_ADMIN_CREDENTIALS_MANAGED_BY_ENV = "Admin credentials are managed by environment variables and cannot be changed at runtime.";
const MSG_NOT_CLUSTER_LEADER = "This control-plane mutation must be handled by the current leader instance.";
const MSG_PROXY_MISSING_PATH = "Please provide a serviceName and proxy path.";
const MSG_INVALID_SERVICE_DATA = `Invalid or missing -> hostName, nodeName, serviceName or weight (Maximum allowed size of weight is ${MAX_SERVER_WEIGHT} (One server can maximum be ${MAX_SERVER_WEIGHT}x more powerful than others)`;
const CONFIGTYPES = ["sync", "async"];
const SERVER_SELECTION_STRATEGIES = ["round-robin", "consistent-hashing"];
const API_URLS_WITH_AUTH = [
    '/api/maxine/control/config',
    '/api/maxine/serviceops/servers',
    '/api/maxine/change-password',
    '/api/maxine/verifyToken',
    '/api/logs',
    '/logs',
    '/api/actuator/audit',
    '/api/actuator/alerts',
    '/api/actuator/cluster',
    '/api/actuator/prometheus',
    '/api/actuator/traces',
    '/api/actuator/upstreams'
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
    DEFAULT_ADMIN_USERNAME,
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_OPERATOR_USERNAME,
    DEFAULT_OPERATOR_PASSWORD,
    DEFAULT_VIEWER_USERNAME,
    DEFAULT_VIEWER_PASSWORD,
    ADMIN_CREDENTIALS_MANAGED_BY_ENV,
    ADMIN_STATE_FILE,
    REGISTRY_STATE_FILE,
    REGISTRY_PERSISTENCE_ENABLED,
    REGISTRY_STATE_MODE,
    REGISTRY_STATE_LOCK_TIMEOUT_MS,
    REGISTRY_STATE_LOCK_RETRY_MS,
    REGISTRY_REDIS_URL,
    REGISTRY_REDIS_KEY_PREFIX,
    REGISTRY_REDIS_CONNECT_TIMEOUT_MS,
    CLUSTER_INSTANCE_ID,
    LEADER_ELECTION_ENABLED,
    LEADER_ELECTION_LEASE_MS,
    LEADER_ELECTION_RENEW_MS,
    ACTIVE_HEALTH_CHECKS_ENABLED,
    ACTIVE_HEALTH_CHECK_INTERVAL_MS,
    ACTIVE_HEALTH_CHECK_TIMEOUT_MS,
    ACTIVE_HEALTH_CHECK_FAILURE_THRESHOLD,
    ACTIVE_HEALTH_CHECK_PATH,
    ALERT_WEBHOOK_URL,
    ALERT_WEBHOOK_TIMEOUT_MS,
    TRACE_HEADER_NAME,
    RECENT_TRACE_LIMIT,
    RECENT_AUDIT_LIMIT,
    RECENT_ALERT_LIMIT,
    EXPIRATION_TIME,
    SECRET,
    JWT_PREVIOUS_SECRETS,
    JWT_SECRET_KEY_ID,
    PERFORMANCE_REPORT_URL,
    AUDIT_LOG_FILE,
    API_URLS_WITH_AUTH,
    MAX_SERVER_WEIGHT,
    SSS,
    DISCOVERY_MODES,
    USER_ROLES,
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
    STATUS_CONFLICT,
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
    MSG_FORBIDDEN,
    MSG_ADMIN_CREDENTIALS_MANAGED_BY_ENV,
    MSG_NOT_CLUSTER_LEADER,
    MSG_PROXY_MISSING_PATH
}

module.exports = {
    constants,
    statusAndMsgs
};
