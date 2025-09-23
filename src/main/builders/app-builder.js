const express = require('express');
const config = require('../config/config');
const { statusAndMsgs } = require('../util/constants/constants');
const cors = require('cors');
const spdy = require('spdy');
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
     * Add compression middleware
     * @returns {object: ExpressAppBuilder}
     */
    addCompression(){
        const compression = require('compression');
        return this.use(compression());
    }

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

    /**
     * Serve the static files
     * @param {String} dir
     * @returns {object: ExpressAppBuilder}
     */
    mapStaticDir = (dir) => this.use(express.static(dir));

    /**
     * Serve the static files on the given route of original url
     * @param {String} dir
     * @returns {object: ExpressAppBuilder}
     */
    mapStaticDirWithRoute = (route, dir) => this.use(route, express.static(dir));

    /**
     * Use accepts all kind of middleware to add in the Express App that this Builder will build.
     * Apart from that, before adding the middleware, it'll verify the conditions of conditionCheck.
     * If conditions pass then it'll add the middleware to App, otherwise not.
     * @param  {...any} args
     * @returns {object: ExpressAppBuilder}
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
        const server = this.app.listen(port, '0.0.0.0', callback);
        server.on('error', (err) => console.error('listen error', err));
        return this;
    }

    /**
      * Starts the app with HTTP/2 if enabled, otherwise HTTP/1.1
      * @param {number} port
      * @param {function} callback
      * @returns {object: ExpressAppBuilder}
      */
    listenOrSpdy(port, callback){
        let server;
        if (config.http2Enabled) {
            server = spdy.createServer({}, this.app).listen(port, callback);
            server.on('error', (err) => console.error('spdy listen error', err));
        } else {
            server = this.app.listen(port, '0.0.0.0', callback);
            server.on('error', (err) => console.error('http listen error', err));
        }
        this.server = server;
        return this;
    }

    /**
     * returns the App.
     * @returns {object: ExpressAppBuilder}
     */
     getApp(){
        return this.app;
    }

    /**
     * returns the Server.
     * @returns {object}
     */
     getServer(){
        return this.server;
    }
}

module.exports = ExpressAppBuilder;