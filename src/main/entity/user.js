const { constants } = require("../util/constants/constants");

class User {
    userName;
    password;

    static createUserFromObj(obj){
        return new User(obj.userName, obj.password);
    }

    constructor(userName, password){
        this.userName = userName;
        this.password = password;
    }
}

const admin = new User(constants.DEFAULT_ADMIN_USERNAME_PWD, constants.DEFAULT_ADMIN_USERNAME_PWD)
module.exports = {
    User,
    admin: admin
}