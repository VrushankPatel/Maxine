class JsonBuilder{
    jsonObj;
    checkCondition;
    flag;
    registeredObj;

    constructor(jsonObj){
        this.jsonObj = jsonObj;        
    }

    static createNewJson = () => new JsonBuilder({});

    static loadJson = (jsonObj) => new JsonBuilder(jsonObj);

    checkIf = (condition) => {
        this.checkCondition = true;        
        this.flag = condition;
        return this;
    }

    endCondition = () => {
        this.checkCondition = null;
        this.flag = null;
        return this;
    }

    put = (key, value) => {
        if(this.checkCondition){
            if(this.flag){
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
            if(this.flag){
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

}

module.exports = JsonBuilder;