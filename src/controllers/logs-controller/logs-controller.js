const fs = require('fs');
const { constants, httpStatus } = require('../../util/constants/constants');
const { error } = require('../../util/logging/maxine-logging-util');

const logsDownloadController = (req, res) => {
    global.logLevel = req.params.level;
    const logFilePath = `${constants.LOGDIR}\\${logLevel}`;
    fs.promises
        .access(logFilePath)
        .then(() => {            
            res.download(logFilePath);
        }).catch(() => {
            const errMsg = `Requested log file (to download) could not be found : ${logLevel}.log`;            
            error(errMsg);
            res.status(httpStatus.STATUS_NOT_FOUND).json({"message": errMsg});
        });
}

const logsLinkGenController = (req, res) => {
    let links = "";
    fs.readdirSync("./logs/").forEach(file => {
        links = links + `
        <center>
        <div style="padding: 20px">
            <a 
            href="/logs/download/${file}"
            target="_blank"
            style="border-radius: 10px; padding: 15px; border-color: black;background-color: brown
            ; font-size: 20; color: lightgrey;font-family: Arial, Helvetica, sans-serif;text-decoration:none"> 
                ${file} 
            </a>
        </div>
        </center>`;
        console.log(typeof file);

    });
    res.send(links);
}

module.exports = {
    logsDownloadController,
    logsLinkGenController
};