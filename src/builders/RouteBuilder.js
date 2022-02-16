var express = require('express');
const { logger } = require('../util/logging/maxine-logging-util');
const { getProperty } = require('../util/propertyReader/propertyReader');

/*
* Builder pattern to build routes of maxine beautifully.
*/

class RouteBuilder{
    route;
    routeStack = [];
    
    constructor(route){
        this.route = route;
    }

    static createNewRoute = () => new RouteBuilder(express.Router());

    static loadRoute = (route) => new RouteBuilder(route);    

    from = (route) => {
        this.routeStack.push(route);
        return this;
    }    

    get = (endPoint, ...args) => {
        const routeString = this.routeStack.join('') + endPoint;
        this.route.get(routeString, ...args);
        return this;
    }

    post = (endPoint, ...args) => {
        const routeString = this.routeStack.join('') + endPoint;
        this.route.post(routeString, ...args);        
        return this;
    }

    stepBack = () => {
        this.routeStack.pop();
        return this;
    }

    stepToRoot = () => {
        this.routeStack = [];
        return this;
    }

    getRoute = () => this.route;

    mapRoute(...args){
        this.route.use(...args)
        return this;
    }
}

module.exports = RouteBuilder;