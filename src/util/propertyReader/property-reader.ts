const PropertiesReader = require('properties-reader');
var properties = PropertiesReader('./application.properties');

module.exports = properties.getAllProperties();