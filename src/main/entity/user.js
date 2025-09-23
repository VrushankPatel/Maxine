const { constants } = require("../util/constants/constants");

class User {
    userName;
    password;
    role;

    static createUserFromObj(obj){
        return new User(obj.userName, obj.password, obj.role);
    }

    constructor(userName, password, role = 'user'){
        this.userName = userName;
        this.password = password;
        this.role = role;
    }
}

const admin = new User(constants.DEFAULT_ADMIN_USERNAME_PWD, constants.DEFAULT_ADMIN_USERNAME_PWD, 'admin')
module.exports = {
    User,
    admin: admin
}