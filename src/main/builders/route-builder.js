const express = require('express');

class RouteBuilder {
  route;
  routeStack = [];

  constructor(route) {
    this.route = route;
  }

  /**
   * Creates brand new object of RouteBuilder by express.Router() and returns it.
   * @returns {object: RouteBuilder}
   */
  static createNewRoute() {
    return new RouteBuilder(express.Router());
  }

  /**
   * Load existing object of express.Router() and create object of RouteBuilder and returns it.
   * @returns {object: RouteBuilder}
   */
  static loadRoute(route) {
    return new RouteBuilder(route);
  }

  /**
   * Add the endpoint to routeStack and will use it as prefix to all the upcoming route endpoints.
   * @param {string} routeEndPt
   * @returns {object: RouteBuilder}
   */
  from(routeEndPt) {
    this.routeStack.push(routeEndPt);
    return this;
  }

  /**
   * Remove one last prefix from routeStack
   * @returns {object: RouteBuilder}
   */
  stepBack() {
    this.routeStack.pop();
    return this;
  }

  /**
   * Remove all the prefixes from routeStack and make it empty.
   * @returns {object: RouteBuilder}
   */
  stepToRoot() {
    this.routeStack = [];
    return this;
  }

  /**
   * Map the endpoint with the args (bodyParser, Callback of req res etc.) by get Mapping.
   * @param {string} endPoint
   * @param  {...any} args
   * @returns {object: RouteBuilder}
   */
  get(endPoint, ...args) {
    const route = this.createRouteString(endPoint);
    this.route.get(route, ...args.filter((arg) => arg != null));
    return this;
  }

  /**
   * Map the endpoint with the args (bodyParser, Callback of req res etc.) by post Mapping.
   * @param {string} endPoint
   * @param  {...any} args
   * @returns {object: RouteBuilder}
   */
  post(endPoint, ...args) {
    this.route.post(this.createRouteString(endPoint), ...args.filter((arg) => arg != null));
    return this;
  }

  /**
   * Map the endpoint with the args (bodyParser, Callback of req res etc.) by put Mapping.
   * @param {string} endPoint
   * @param  {...any} args
   * @returns {object: RouteBuilder}
   */
  put(endPoint, ...args) {
    this.route.put(this.createRouteString(endPoint), ...args.filter((arg) => arg != null));
    return this;
  }

  /**
   * Map the endpoint with the args (bodyParser, Callback of req res etc.) by delete Mapping.
   * @param {string} endPoint
   * @param  {...any} args
   * @returns {object: RouteBuilder}
   */
  delete(endPoint, ...args) {
    this.route.delete(this.createRouteString(endPoint), ...args.filter((arg) => arg != null));
    return this;
  }

  /**
   * Map the endpoint with the args (bodyParser, Callback of req res etc.) by all (get, post, put, etc..) Mapping.
   * @param {string} endPoint
   * @param  {...any} args
   * @returns {object: RouteBuilder}
   */
  all(endPoint, ...args) {
    this.route.all(this.createRouteString(endPoint), ...args.filter((arg) => arg != null));
    return this;
  }

  /**
   * Use middleware for the route.
   * @param {string} endPoint
   * @param  {...any} args
   * @returns {object: RouteBuilder}
   */
  use(endPoint, ...args) {
    this.route.use(this.createRouteString(endPoint), ...args.filter((arg) => arg != null));
    return this;
  }

  /**
   * returns the Express Route created.
   * @returns {object: RouteBuilder}
   */
  getRoute() {
    return this.route;
  }

  /**
   * create route string by joining all the prefixes from routeStack and appending it by the endPt passed as param.
   * @param {string} endPt
   * @returns {object: RouteBuilder}
   */
  createRouteString(endPt) {
    return '/' + this.routeStack.join('/') + this.formatEndpoint(endPt);
  }

  /**
   * Add slash / at the beginning of endpoint
   * @param {string} endPt
   * @returns {object: RouteBuilder}
   */
  formatEndpoint(endPt) {
    return endPt[0] === '/' ? endPt : `/${endPt}`;
  }
}

module.exports = RouteBuilder;
