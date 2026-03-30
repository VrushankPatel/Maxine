const JsonBuilder = require("../../main/builders/json-builder");

const fileName = require('path').basename(__filename).replace(".js","");

describe(`${fileName} : JSON Builder Test`, () => {

    it('Building JSON Object by JSONBuilder and checking if it works with all the conditions', (done) => {
        let jsonSample = JsonBuilder.createNewJson().getJson();
        jsonSample.should.be.a('object');

        jsonSample = JsonBuilder.loadJson(jsonSample)
                                .put("sampleKey", "sampleValue") // should store
                                .checkCondition(true)
                                    .put("sampleKeyShouldBeHere", "sampleValueShouldBeHere") // should store
                                .endCondition()
                                .checkCondition(true)
                                    .checkCondition(true)
                                        .checkCondition(false)
                                            .put("sampleKeyShouldNotBeHere", "sampleValueShouldNotBeHere") // shouldn't store
                                .endAllConditions()
                                .checkCondition(true)
                                    .checkCondition(false)
                                        .put("keyUnderFalseCondition","valueUnderFalseCondition") // shouldn't store
                                    .endCondition()
                                    .checkCondition(true)
                                        .put("keyUnderTrueCondition","valueUnderTrueCondition") // should store
                                    .endCondition()
                                    .put("keyUnderTrueConditionAgain","valueUnderTrueConditionAgain") // should store
                                .endAllConditions()
                                .getJson();

        jsonSample.should.have.own.property("sampleKey", "sampleValue");
        jsonSample.should.have.own.property("sampleKeyShouldBeHere", "sampleValueShouldBeHere");
        jsonSample.should.not.have.own.property("sampleKeyShouldNotBeHere", "sampleValueShouldNotBeHere");
        jsonSample.should.not.have.own.property("keyUnderFalseCondition", "valueUnderFalseCondition");
        jsonSample.should.have.own.property("keyUnderTrueCondition", "valueUnderTrueCondition");
        jsonSample.should.have.own.property("keyUnderTrueConditionAgain", "valueUnderTrueConditionAgain");
        done();
    });

    it('Building JSON Object by JSONBuilder\'s reference from another Object.', (done) => {
        const sampleObject = {"key1" : "value1","key2" : "value2","key3" : "value3"}

        const sampleObject2 = {"sampleKey1" : "sampleValue1","sampleKey2" : "sampleValue2","sampleKey3" : "sampleValue3"};

        let jsonSample = JsonBuilder.createNewJson()
                                    .registerObj(sampleObject) // same key as reference object (key1 -> key1)
                                        .putFromRegObj("key1")
                                        .putFromRegObj("key2")
                                        .putFromRegObj("key3")
                                    .deregisterObj()
                                    .registerObj(sampleObject2) // different key name for target obejct (sampleKey1 -> custSampleKey1)
                                        .putFromRegObj("sampleKey1", "custSampleKey1")
                                        .putFromRegObj("sampleKey2", "custSampleKey2")
                                        .putFromRegObj("sampleKey3", "custSampleKey3")
                                    .deregisterObj()
                                    .getJson();

        jsonSample.should.have.own.property("key1", "value1");
        jsonSample.should.have.own.property("key2", "value2");
        jsonSample.should.have.own.property("key3", "value3");
        jsonSample.should.have.own.property("custSampleKey1", "sampleValue1");
        jsonSample.should.have.own.property("custSampleKey2", "sampleValue2");
        jsonSample.should.have.own.property("custSampleKey3", "sampleValue3");
        done()
    });
});