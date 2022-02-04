var express = require('express');
const malformedRoute = require('../routes/malformed-routes/malformed-routes');
const { logger } = require('../util/logging/maxine-logging-util');

/*
* Builder pattern to build routes of maxine beautifully.
*/

class RouteBuilder{
    route;    

    constructor(route){
        this.route = route;
    }

    static createNewRoute = () => new RouteBuilder(express.Router());

    static loadRoute = (route) => new RouteBuilder(route);    

    getRoute = () => this.route;

    mapRoute(...args){
        this.route.use(...args)
        return this;
    }
}

module.exports = RouteBuilder;