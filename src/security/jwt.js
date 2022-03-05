const jwt = require('jsonwebtoken');
const { secret, expirationTime } = require('../config/security/jwt-config');


function generateAccessToken(obj) {
    return jwt.sign(obj, secret, { expiresIn:`${expirationTime}s`});
}

const token = generateAccessToken({"userName" : "vrushankpatel", "pwd" : "samplepwd"});
console.log(token);


function authenticateToken(token) {
    // const authHeader = req.headers['authorization']
    // const token = authHeader && authHeader.split(' ')[1]

    // if (token == null) return res.sendStatus(401)

    jwt.verify(token, secret, (err, user) => {
      console.log(err)

    //   if (err) return res.sendStatus(403)

    //   req.user = user
        console.log(user);
    //   next()
    })
  }
authenticateToken(token);