const path = require('path');
const _ = require('lodash');

const uiController = (_, res) => {
    res.sendFile(path.join(process.cwd(), "client", "index.html"));
}

module.exports = {
    uiController
}