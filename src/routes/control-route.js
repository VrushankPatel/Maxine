var express = require('express');
var controlRoute = express.Router();

controlRoute.get('/shutdown', (req, res) => {
    res.status(200).json({"message" : "Initiated shutdown."});
    process.exit();
});

module.exports = controlRoute;