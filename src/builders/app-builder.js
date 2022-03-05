var express = require('express');
const { properties } = require('../util/propertyReader/property-reader');
const { httpStatus } = require('../util/constants/constants');

/*
* Builder pattern to creat express in a beautiful manner rather than individual statements.
* It is highly suggested to use methods of this Builder in sequence as they've created
*/

class AppBuilder{
    app;
    conditionStack = [];
    checkOnceOnly = false;

    constructor(app){
        this.app = app;
    }

    static createNewApp = () => new AppBuilder(new express());

    static loadApp = (app) => new AppBuilder(app);

    ifPropertyOnce = (property) => {
        this.conditionStack.push(properties[property] === 'true');
        this.checkOnceOnly = true;
        return this;
    }

    ifProperty = (property) => {
        this.conditionStack.push(properties[property] === 'true');
        return this;
    }

    endIfProperty = () => {
        this.conditionStack.pop();
        return this;
    };

    endAllIf = () => {
        this.conditionStack = [];
        return this;
    }

    blockUnknownUrls = () => {
        this.app.all('*',(req, res) => res.status(httpStatus.STATUS_NOT_FOUND).json({"message": httpStatus.MSG_NOT_FOUND}));
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
}

module.exports = AppBuilder;