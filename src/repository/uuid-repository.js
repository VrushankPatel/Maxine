const { UUIDs } = require("../model/uuid");
const { info } = require("../util/logging/logging-util");

class UuidRepository {
    async generateUUID(){
        const result = await UUIDs.build().save();
        const uuid = result.dataValues.uuid;
        info(`Generated access UUID ${uuid}`);
        return uuid;
    }

    async removeUUID(uuid){
        const rowCount = await UUIDs.destroy({
            where: {uuid: uuid}
        }).then(rowCount => rowCount)
        if(rowCount > 0){
            info(`Removed access UUID ${uuid}`);
        }
        return rowCount;
    }
}

const uuidRepository = new UuidRepository();

module.exports = {
    uuidRepository
}