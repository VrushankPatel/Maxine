const express = require('express');
const { httpStatus } = require('../../util/constants/constants');

var malformedRoutes = express.Router();

malformedRoutes.all('*', (req, res) => res.status(httpStatus.STATUS_NOT_FOUND).json({"message": httpStatus.MSG_NOT_FOUND}));

module.exports = malformedRoutes;