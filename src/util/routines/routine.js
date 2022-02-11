const { default: axios } = require("axios");
var ip = require("ip");
const { constants } = require("../constants/constants");

var heartBeat = JSON.stringify({
    "hostName": ip.address().toString(),
    "port": constants.PORT,
    "serviceName": constants.APP_NAME
});

var config = {
    method: 'post',
    url: `${constants.MASTER_NODE}/discover/register`,
    headers: { 'Content-Type': 'application/json' },
    data : heartBeat
};

const sendHeartBeat = () => {                
      axios(config);
    //   .then(function (response) {
    //     console.log(JSON.stringify(response.data));
    //   })
    //   .catch(function (error) {
    //     console.log(error.toJSON());
    //   });      
}

const startRoutines = () => {
    setInterval(sendHeartBeat, 5000);
}

module.exports = {
    startRoutines
}