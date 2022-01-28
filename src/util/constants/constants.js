const envVars = process.env;
const PROFILE = (envVars.profile || "prod").trim();
const PORT = envVars.PORT || 8080;
const BANNERPATH = 'src/resources/Banner.txt';
const LOGDIR = './logs/';
const ACTUATORCONFIG = {
    basePath: '/actuator',
    infoGitMode: 'simple', // the amount of git information you want to expose, 'simple' or 'full',
    infoBuildOptions: null, // extra information you want to expose in the build object. Requires an object.
    infoDateFormat: null, // by default, git.commit.time will show as is defined in git.properties. If infoDateFormat is defined, moment will format git.commit.time. See https://momentjs.com/docs/#/displaying/format/.
    customEndpoints: [] // array of custom endpoints
}

module.exports = {
    PROFILE,
    PORT,
    BANNERPATH,
    LOGDIR,
    ACTUATORCONFIG
};