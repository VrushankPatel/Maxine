var express = require('express');
const controlRoute = require('../routes/control-route/control-route');
const malformedRoute = require('../routes/malformed-routes/malformed-routes');

/*
* Builder pattern to build routes of maxine beautifully.
*/

class RouteBuilder{
    route;    

    constructor(route){
        this.route = route;
    }

    static createNewRoute = () => new RouteBuilder(express.Router());

    static loadApp = (route) => new RouteBuilder(route);

    // remove below in production because this is for exception testing
    mapTestRoute = () => {
        this.route.get("/sd", (req, res) => {
            SVGDefsElement.sd();            
        });
        return this;
    }
    
    mapControlRoute = () => this.use('/control',controlRoute);    
    
    register = () => this.use('*',malformedRoute);

    getRoute = () => this.route;

    use(...args){    
        this.route.use(...args)
        return this;
    }
}

module.exports = RouteBuilder;