const envVars = process.env;
const PROFILE = (envVars.profile || "prod").trim();
const PORT = envVars.PORT || 8080;
const BANNERPATH = 'src/resources/Banner.txt';
const LOGDIR = './logs/';

module.exports = {
    PROFILE,
    PORT,
    BANNERPATH,
    LOGDIR
};