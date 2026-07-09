const RouteBuilder = require('../builders/route-builder');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const { serverListController, registryController } = require('../controller/maxine/registry-controller');
const discoveryController = require('../controller/maxine/discovery-controller');
const { serviceProxyController } = require('../controller/maxine/proxy-controller');
const { signInController } = require('../controller/uac/signin-controller');
const { logsLinkGenController, recentLogsController, recentLogsClearController } = require('../controller/log-control/logs-controller');
const { configuratorController, configurationController } = require('../controller/config-control/configurator-controller');
const { changePwdController } = require('../controller/security/changepwd-controller');

const isTestEnv = process.env.NODE_ENV === 'test' || (typeof global.describe === 'function' && typeof global.it === 'function');

const signinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isTestEnv ? 100 : 5, // Limit each IP to 5 requests per windowMs
    message: { message: "Too many sign-in attempts. Please try again after 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
});

let maxineApiRoutes = RouteBuilder.createNewRoute()
                        .from("logs")
                            .from("download")
                                .get("/",logsLinkGenController)
                            .stepBack()
                            .from("recent")
                                .get("/", recentLogsController)
                                .get("/clear", recentLogsClearController)
                        .stepToRoot()
                        .from("maxine")
                            .from("serviceops")
                                .get("servers", serverListController)
                                .post("register", bodyParser.json(), registryController)
                                .get("discover", discoveryController)
                                .all("proxy/:serviceName/*", bodyParser.raw({ type: '*/*', limit: '10mb' }), serviceProxyController)
                            .stepBack()
                            .post("signin", signinLimiter, bodyParser.json(), signInController)
                            .put("change-password", bodyParser.json(), changePwdController)
                            .from("control")
                                .put("config", bodyParser.json(), configuratorController)
                                .get("config", configurationController)
                        .stepToRoot()
                        .getRoute();

module.exports = maxineApiRoutes;
