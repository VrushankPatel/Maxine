var morgan = require('morgan');
const fs = require('fs')
const constants = require('../constants/constants');
const maxineUtil = require('../maxineUtil');

const banner = fs.readFileSync(constants.BANNERPATH, 'utf8');

maxineUtil.createLogDirIfDoesNotExists();

const loggingUtil = {
    getLogger : (app) => {
        if(constants.PROFILE === "prod"){
            app.use(morgan('combined', {
                stream: fs.createWriteStream(constants.LOGDIR + "maxine.log", {flags: 'a+'})
            }));
        }
        app.use(morgan("combined"));
        return app;
    },    
    initApp : () => { 
        console.log(`${banner} > ${constants.PROFILE} started on port : ${constants.PORT}\n`);
    }
}

module.exports = loggingUtil;