const PropertiesReader = require('properties-reader');
const properties = PropertiesReader('./application.properties');

const getAllProperties = () => {
    return properties.getAllProperties();
}

module.exports = {
    properties: getAllProperties()
}