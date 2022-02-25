const PropertiesReader = require('properties-reader');
const properties = PropertiesReader('./application.properties');

const getProperty = (property) => {
    return properties.get(property);
}

const getAllProperties = () => {
    return properties.getAllProperties();
}

module.exports = {
    // getProperty,
    properties: getAllProperties()
}