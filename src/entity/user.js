var generator = require('generate-password');

class User {
    userName;
    password;

    constructor(userName, password){
        this.userName = userName;
        this.password = password;
    }
}

module.exports = {
    admin: new User("admin", generator.generate({
        length: 20,
        numbers: true,
        excludeSimilarCharacters: true
    }))
}