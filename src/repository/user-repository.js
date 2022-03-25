const { User } = require("../model/user");
const { constants } = require("../util/constants/constants");
const { info } = require("../util/logging/logging-util");

class UserRepository {
    async createAdmin(){
        const [user, created] = await User.findOrCreate({
            where: { userName: constants.ADMIN },
            defaults: {
                userName: constants.ADMIN,
                password: constants.ADMIN
            }
        });
        info(`${user.userName} user ${created ? "created." : "found."}`);
    }

    async changeAdminPwd(password){
        const [rows] = await User.update(
            {password : password},
            {where : {userName: constants.ADMIN}}
        )
        if(rows > 0){
            info(`Successfully changed Admin user Password.`);
            return true;
        }
        return false;
    }
}

const userRepository = new UserRepository();


module.exports = {
    userRepository
}