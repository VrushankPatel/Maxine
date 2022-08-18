var express = require('express');
const config = require('../config/config');
const { statusAndMsgs } = require('../util/constants/constants');
var cors = require('cors');

class ExpressAppBuilder{
    app;
    conditionStack = [];
    checkOnceOnly = false;

    constructor(app){
        this.app = app;
    }

    /**
     * Create a brand new ExpressAppBuilder object with Express app and returns it.
     * @returns {object: ExpressAppBuilder}
     */
    static createNewApp(){
        return new ExpressAppBuilder(new express());
    }

    /**
     * Load existing app
     * @param {object: Express} app
     * @returns {object: ExpressAppBuilder}
     */
    static loadApp(app) {
        return new ExpressAppBuilder(app);
    }

    /**
     * 
     * @param {object: Express} app 
     * @returns {object: ExpressAppBuilder}
     */
    addCors = () => this.use(cors());

    /**
     * Add condition property check but will enable the checker to check property only once, then condition check will be disabled.
     * @param {string} property
     * @param {any} value
     * @returns {object: ExpressAppBuilder}
     */
    ifPropertyOnce(property, value = true){
        this.conditionStack.push(config[property] === value);
        this.checkOnceOnly = true;
        return this;
    }

    /**
     * Add condition property check for all upcoming stream until we don't call endIf
     * @param {string} property
     * @param {any} value
     * @returns {object: ExpressAppBuilder}
     */
    ifProperty(property, value = true){
        this.conditionStack.push(config[property] === value);
        return this;
    }

    /**
     * Remove one last condition from conditionCheck.
     * @returns {object: ExpressAppBuilder}
     */
    endIfProperty(){
        this.conditionStack.pop();
        return this;
    }

    /**
     * Remove all the conditions and set checker to false and empty the conditionCheck array.
     * @returns {object: ExpressAppBuilder}
     */
    endAllIf(){
        this.conditionStack = [];
        return this;
    }

    /**
     * Send NOT_FOUND -> 404 to all unknown URLS.
     * @returns {object: ExpressAppBuilder}
     */
    blockUnknownUrls(){
        this.app.all('*',(_, res) => res.status(statusAndMsgs.STATUS_NOT_FOUND).json({"message": statusAndMsgs.MSG_NOT_FOUND}));
        return this;
    }

    useStaticDir = (route, dir) => this.use(route, express.static(dir));

    /**
     * Use accepts all kind of middleware to add in the Express App that this Builder will build.
     * Apart from that, before adding the middleware, it'll verify the conditions of conditionCheck.
     * If conditions pass then it'll add the middleware to App, otherwise not.
     * @param  {...any} args
     * @returns
     */
    use(...args){
        if(this.conditionStack.length > 0){
            if(this.conditionStack.every(e => e === true)){
                this.app.use(...args);
            }
            if(this.checkOnceOnly){
                this.checkOnceOnly = false;
                this.conditionStack = [];
            }
            return this;
        }
        this.app.use(...args)
        return this;
    }

    /**
     * call the method that will be passed as a parameter during creation of the App.
     * @param {function} method
     * @returns {object: ExpressAppBuilder}
     */
    invoke(method){
        method();
        return this;
    }

    /**
     * Starts the app on passed param port and  also pass callback to run after starting server.
     * @param {number} port
     * @param {function} callback
     * @returns {object: ExpressAppBuilder}
     */
    listen(port, callback){
        this.app.listen(port, callback);
        return this;
    }

    /**
     * returns the App.
     * @returns {object: ExpressAppBuilder}
     */
     getApp(){
        return this.app;
    }
}

module.exports = ExpressAppBuilder;