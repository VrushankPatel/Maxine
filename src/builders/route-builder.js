var express = require('express');

class RouteBuilder{
    route;
    routeStack = [];

    constructor(route){
        this.route = route;
    }

    static createNewRoute(){
        return new RouteBuilder(express.Router());
    }

    static loadRoute(route){
        return new RouteBuilder(route);
    }

    from(routeEndPt){
        routeEndPt = this.formatEndpoint(routeEndPt);
        this.routeStack.push(routeEndPt);
        return this;
    }

    stepBack(){
        this.routeStack.pop();
        return this;
    }

    stepToRoot(){
        this.routeStack = [];
        return this;
    }

    get(endPoint, ...args){
        this.route.get(this.createRouteString(endPoint), ...args);
        return this;
    }

    post(endPoint, ...args){
        this.route.post(this.createRouteString(endPoint), ...args);
        return this;
    }

    put(endPoint, ...args){
        this.route.put(this.createRouteString(endPoint), ...args);
        return this;
    }

    all(endPoint, ...args){
        this.route.all(this.createRouteString(endPoint), ...args);
        return this;
    }

    getRoute(){
        return this.route;
    }

    createRouteString(endPt){
        return this.routeStack.join('') + this.formatEndpoint(endPt);
    }

    formatEndpoint(endPt){
        endPt = endPt[0] === "/" ? endPt : `/${endPt}`;
        return endPt;
    }
}

module.exports = RouteBuilder;