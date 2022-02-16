const { properties } = require('../util/propertyReader/propertyReader');
class JsonBuilder{
    jsonObj;
    checkCondition;    
    registeredObj;
    conditionStack = [];

    constructor(jsonObj){
        this.jsonObj = jsonObj;        
    }

    static createNewJson = () => new JsonBuilder({});

    static loadJson = (jsonObj) => new JsonBuilder(jsonObj);

    checkNull = (element) => {
        this.conditionStack.push(element !== null);
        this.checkCondition = true;
        return this;
    }

    endCondition = () => {
        this.conditionStack.pop();
        if(this.conditionStack.length === 0){
            this.checkCondition = null;
        }
        return this;
    }

    endAllConditions = () => {
        this.conditionStack = [];
        this.checkCondition = null;
        return this
    }
    
    put = (key, value) => {                
        if(this.checkCondition){
            if(this.conditionStack.every(e => e === true)){
                this.jsonObj[key] = value;
            }
            return this;
        }
        this.jsonObj[key] = value;
        return this;
    };

    registerObj = (obj) => {
        this.registeredObj = obj;
        return this;
    }

    putFromRegObj = (key, refObj) => {        
        if(this.checkCondition){
            if(this.conditionStack.slice(-1)[0]){
                this.jsonObj[key] = this.registeredObj[refObj];            
            }
            return this;
        }
        this.jsonObj[key] = this.registeredObj[refObj];
        return this;
    };

    deregisterObj = () => {
        this.registeredObj = null;
        return this;
    }

    getJson = () => this.jsonObj;

    formatJson = () => {
      return properties["log.json.prettify"] === 'true' ? this.prettifyJSON() : this.minifyJSON();
    }

    prettifyJSON = () => {
        this.jsonObj = JSON.stringify(this.jsonObj, null, "  ");
        return this;
    }
    
    minifyJSON = () => {
        this.jsonObj = JSON.stringify(JSON.parse(JSON.stringify(this.jsonObj)));
        return this;
    }

}

module.exports = JsonBuilder;