const { isValidAdminCredentials } = require("../../entity/user");
const { generateAccessToken } = require("../../security/jwt");
const { statusAndMsgs } = require("../../util/constants/constants");
const { error } = require("../../util/logging/logging-util");
const { auditService } = require("../../service/audit-service");
const { observabilityService } = require("../../service/observability-service");

const signInController = (req, res) => {
    const {userName, password} = req.body;
    if(!(userName && password)){
        error(statusAndMsgs.MSG_MISSING_UNAME_PWD);
        observabilityService.recordAuthFailure();
        res.status(statusAndMsgs.STATUS_GENERIC_ERROR).json({"message" : statusAndMsgs.MSG_MISSING_UNAME_PWD});
        return;
    }
    const user = isValidAdminCredentials(userName, password);
    if (user){
        observabilityService.recordAuthSuccess();
        auditService.record('auth.signin', {
            outcome: 'SUCCESS',
            userName: user.userName,
            role: user.role,
            traceId: req.traceId
        });
        const token = generateAccessToken({
            userName: user.userName,
            role: user.role,
            credentialVersion: user.credentialVersion
        });
        res.json({
            "accessToken" : token,
            "role": user.role
        });
        return;
    }
    observabilityService.recordAuthFailure();
    auditService.record('auth.signin', {
        outcome: 'FAILED',
        userName,
        traceId: req.traceId
    });
    res.status(statusAndMsgs.STATUS_UNAUTHORIZED).json({"message" : statusAndMsgs.MSG_UNAUTHORIZED});
}

module.exports = {
    signInController
}
