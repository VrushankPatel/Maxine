var express = require('express');
const { statusAndMsgs } = require('../util/constants/constants');
const config = require('../config/config');

class ExpressAppBuilder{
    app;
    conditionStack = [];
    checkOnceOnly = false;

    constructor(app){
        this.app = app;
    }

    static createNewApp(){
        return new ExpressAppBuilder(new express());
    }

    static loadApp(app){
        return new ExpressAppBuilder(app);
    }

    ifPropertyOnce(property){
        this.conditionStack.push(config[property] === 'true');
        this.checkOnceOnly = true;
        return this;
    }

    ifProperty(property){
        this.conditionStack.push(config[property] === 'true');
        return this;
    }

    endIfProperty(){
        this.conditionStack.pop();
        return this;
    };

    endAllIf(){
        this.conditionStack = [];
        return this;
    }

    blockUnknownUrls(){
        this.app.all('*',(req, res) => res.status(statusAndMsgs.STATUS_NOT_FOUND).json({"message": statusAndMsgs.MSG_NOT_FOUND}));
        return this;
    }

    getApp(){
        return this.app;
    }

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

    useIfPropertyOnce(...args){
        this.ifPropertyOnce(args[args.length - 1]);
        args.pop();
        this.use(args);
        return this;
    }

    invoke = (method) => {
        method();
        return this;
    }
}

module.exports = ExpressAppBuilder;