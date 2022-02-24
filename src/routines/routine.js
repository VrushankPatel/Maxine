const { default: axios } = require("axios");
var ip = require("ip");
const { constants } = require("../util/constants/constants");

var heartBeat = JSON.stringify({
    "hostName": ip.address().toString(),
    "nodeName": constants.APP_NODE_NAME,
    "port": constants.PORT,
    "serviceName": constants.APP_NAME,
    "timeOut" : parseInt(constants.HEARTBEAT_TIMEOUT)
});


var config = {
    method: 'post',
    url: `${constants.MASTER_NODE}/maxine/register`,
    headers: { 'Content-Type': 'application/json' },
    data : heartBeat
};

const sendHeartBeat = () => {                
      axios(config);
}

const startRoutines = () => {
    setInterval(sendHeartBeat, 5000);
}

module.exports = {
    startRoutines
}