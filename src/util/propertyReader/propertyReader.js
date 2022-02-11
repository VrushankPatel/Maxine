const PropertiesReader = require('properties-reader');
const prop = PropertiesReader('./application.properties');

const getProperty = (property) => {
    return prop.get(property);
}

module.exports = {
    getProperty
}