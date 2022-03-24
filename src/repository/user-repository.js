const { User } = require("../model/user");
const { constants } = require("../util/constants/constants");
const { info } = require("../util/logging/logging-util");

class UserRepository {
    async createUser (user){
        const [resultUser, created] = await User.findOrCreate({
            where: { role: user.role, userName: user.uname },
            defaults: user
          });
        return created;
    }

    async createAdmin(){
        const [user, created] = await User.findOrCreate({
            where: { role: constants.ADMIN.toUpperCase() },
            defaults: {
                userName: constants.ADMIN,
                password: constants.ADMIN
            }
          });
          info(`${user.userName} user with role ${user.role} ${created ? "created." : "found."}`);
    }
}

const userRepository = new UserRepository();

module.exports = {
    userRepository
}