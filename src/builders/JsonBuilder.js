class JsonBuilder{
    jsonObj;
    checkCondition;
    flag;

    constructor(jsonObj){
        this.jsonObj = jsonObj;
        this.checkCondition = false;
        this.flag = false;
    }

    static createNewApp = () => new JsonBuilder({});

    static loadJson = (jsonObj) => new JsonBuilder(jsonObj);

    checkif = (condition) => {
        this.checkCondition = true;
        if(condition){            
            this.flag = true;
        }
        return this;
    }

    endCondition = () => {
        this.checkCondition = null;
        this.flag = null;
        return this;
    }

    map = (key, value) => {
        if(this.checkCondition){
            if(this.flag){
                this.jsonObj[key] = value;            
            }
            return this;
        }
        this.jsonObj[key] = value;
        return this;
    };

    getJson = () => this.jsonObj;

}

module.exports = JsonBuilder;