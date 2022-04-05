const Config = require("../config/Config");
const { constants } = require("../util/constants/constants");

class JsonBuilder{
    jsonObj;
    doCheckCondition;
    registeredObj;
    conditionStack = [];

    constructor(jsonObj){
        this.jsonObj = jsonObj;
    }

    static createNewJson(){
        return new JsonBuilder({});
    }

    static loadJson(jsonObj){
        return new JsonBuilder(jsonObj);
    }

    checkCondition(condition){
        this.conditionStack.push(condition);
        this.doCheckCondition = true;
        return this;
    }

    checkIfNull(element){
        return this.checkCondition(element !== null);
    }

    checkIfNullOrEmpty(element){
        return this.checkCondition(element !== null && element.length !== 0);
    }

    endCondition(){
        this.conditionStack.pop();
        if(this.conditionStack.length === 0){
            this.doCheckCondition = null;
        }
        return this;
    }

    endAllConditions(){
        this.conditionStack = [];
        this.doCheckCondition = null;
        return this
    }

    put(key, value){
        if(this.doCheckCondition){
            if(this.conditionStack.every(e => e === true)){
                this.jsonObj[key] = value;
            }
            return this;
        }
        this.jsonObj[key] = value;
        return this;
    }

    putIfNotNull(key, value){
        this.checkIfNull(value);
        this.put(key, value);
        this.endCondition();
        return this;
    }

    putIfNotNullOrEmpty(key, value){
        this.checkIfNullOrEmpty(value);
        this.put(key, value);
        this.endCondition();
        return this;
    }

    registerObj(obj){
        this.registeredObj = obj;
        return this;
    }

    putFromRegObj(refObj, key = refObj){
        if(this.doCheckCondition){
            if(this.conditionStack.slice(-1)[0]){
                this.jsonObj[key] = this.registeredObj[refObj];
            }
            return this;
        }
        this.jsonObj[key] = this.registeredObj[refObj];
        return this;
    }

    deregisterObj(){
        this.registeredObj = null;
        return this;
    }

    getJson(){
        return this.jsonObj;
    }

    formatJson(){
      return Config.logJsonPrettify === constants.YES ? this.prettifyJSON() : this.minifyJSON();
    }

    prettifyJSON(){
        this.jsonObj = JSON.stringify(this.jsonObj, null, "  ");
        return this;
    }

    minifyJSON(){
        this.jsonObj = JSON.stringify(JSON.parse(JSON.stringify(this.jsonObj)));
        return this;
    }

}

module.exports = JsonBuilder;