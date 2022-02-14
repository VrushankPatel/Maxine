var express = require('express');
const actuator = require('express-actuator');
const expressStatusMonitor = require('express-status-monitor');
const maxineRoutes = require('../routes/routes');
const { statusMonitorConfig, actuatorConfig } = require('../config/config');
const loggingUtil = require('../util/logging/maxine-logging-util');
const { logExceptions: logGenericExceptions } = require('../util/logging/maxine-logging-util');

/*
* Builder pattern to creat express in a beautiful manner rather than individual statements.
* It is highly suggested to use methods of this Builder in sequence as they've created 
*/

class AppBuilder{
    app;    

    constructor(app){
        this.app = app;
    }

    static createNewApp = () => new AppBuilder(new express());

    static loadApp = (app) => new AppBuilder(app);

    registerExpressStatusMonitorEndpoint = () => this.use(expressStatusMonitor(statusMonitorConfig));    
    
    registerRequestLogger = () => this.use(loggingUtil.logRequest);    

    enableActuator = () => this.use(actuator(actuatorConfig));    

    handleExceptions = () => this.use(logGenericExceptions);

    mapUrlPatterns = () => this.use('/',maxineRoutes);

    getApp = () => this.app;

    use(...args){    
        this.app.use(...args)
        return this;
    }
}

module.exports = AppBuilder;