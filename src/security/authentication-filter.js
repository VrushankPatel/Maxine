
const authenticationFilter = (req, res, next) => {
    // return;
    // To do : for express status monitor, simply return without sending any response.
    // To Do : check the URL Path, if it is one of the excluded from authentication check, simply call next(), otherwise follow below step
    // TO DO : write a logic to extract token from Authorization header and verify the token here.
    next();
}

module.exports = authenticationFilter;