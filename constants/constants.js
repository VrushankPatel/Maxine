const envVars = process.env;
const PROFILE = (envVars.profile || "prod").trim();
const PORT = envVars.PORT || 8080;

module.exports = {
    PROFILE,
    PORT
};