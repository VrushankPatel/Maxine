var express = require('express');
const actuator = require('express-actuator');
const expressStatusMonitor = require('express-status-monitor');
const controlRoute = require('../routes/control-route');
const malformedRoute = require('../routes/malformed-routes');
const { statusMonitorConfig, actuatorConfig } = require('../util/config/actuator-config');
const { logGenericExceptions } = require('../util/logging/maxine-loging-util');
const loggingUtil = require('../util/logging/maxine-loging-util');

class AppBuilder{
    app;    

    constructor(app){
        this.app = app;
    }

    static createNewApp = () => new AppBuilder(new express());

    static loadApp = (app) => new AppBuilder(app);

    registerExpressStatusMonitorEndpoint(){
        this.app.use(expressStatusMonitor(statusMonitorConfig));
        return this;
    }
    
    registerRequestLogger(){
        this.app.use(loggingUtil.logRequest);
        return this;
    }

    registerActuatorEndpoint(){
        this.app.use(actuator(actuatorConfig));
        return this;
    }

    registerControlRoute(){
        this.app.use('/control',controlRoute);
        return this;
    }

    mapUrlPatterns(){
        this.app.get("/sd", (req, res) => {
            SVGDefsElement.sd();
            res.send("vrushank");
        });
        return this;
    }

    handleGenericExceptions(){
        this.app.use(logGenericExceptions);
        return this;
    }

    handleMalformedUrls(){
        this.app.use('*',malformedRoute);
        return this;
    }

    
    getApp = () => this.app;
}

module.exports = AppBuilder;