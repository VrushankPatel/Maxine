var express = require('express');
const config = require('../config/config');
const { statusAndMsgs, constants } = require('../util/constants/constants');

class ExpressAppBuilder{
    app;
    conditionStack = [];
    checkOnceOnly = false;

    constructor(app){
        this.app = app;
    }

    static createNewApp = () => new ExpressAppBuilder(new express());

    static loadApp = (app) => new ExpressAppBuilder(app);

    ifPropertyOnce(property, value = true){
        this.conditionStack.push(config[property] === value);
        this.checkOnceOnly = true;
        return this;
    }

    ifProperty(property, value = true){
        this.conditionStack.push(config[property] === value);
        return this;
    }

    endIfProperty(){
        this.conditionStack.pop();
        return this;
    }

    endAllIf(){
        this.conditionStack = [];
        return this;
    }

    blockUnknownUrls(){
        this.app.all('*',(_, res) => res.status(statusAndMsgs.STATUS_NOT_FOUND).json({"message": statusAndMsgs.MSG_NOT_FOUND}));
        return this;
    }

    getApp = () => this.app;

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

    invoke = (method) => {
        method();
        return this;
    }
}

module.exports = ExpressAppBuilder;