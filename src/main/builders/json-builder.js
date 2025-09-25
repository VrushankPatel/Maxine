const config = require('../config/config');

class JsonBuilder {
  jsonObj;
  doCheckCondition;
  registeredObj;
  conditionStack = [];

  constructor(jsonObj) {
    this.jsonObj = jsonObj;
  }

  /**
   * Create a brand new JsonBuilder object with jsonObj and returns it.
   * @returns {object: JsonBuilder}
   */
  static createNewJson() {
    return new JsonBuilder({});
  }

  /**
   * Load existing json
   * @param {object} app
   * @returns {object: JsonBuilder}
   */
  static loadJson(jsonObj) {
    return new JsonBuilder(jsonObj);
  }

  /**
   * add condition to conditionStack
   * also, set doCheckCondition to true to enable checking.
   * @param {boolean} condition
   * @returns {object: JsonBuilder}
   */
  checkCondition(condition) {
    this.conditionStack.push(condition);
    this.doCheckCondition = true;
    return this;
  }

  /**
   * Add condition of element passed to params !== null
   * @param {any} element
   * @returns {object: JsonBuilder}
   */
  checkIfNull(element) {
    return this.checkCondition(element !== null);
  }

  /**
   * Add condition of element passed to params !== null and not empty as well.
   * @param {any} element
   * @returns {object: JsonBuilder}
   */
  checkIfNullOrEmpty(element) {
    return this.checkCondition(element !== null && element.length !== 0);
  }

  /**
   * Remove one last condition from conditionCheck.
   * @returns {object: JsonBuilder}
   */
  endCondition() {
    this.conditionStack.pop();
    if (this.conditionStack.length === 0) {
      this.doCheckCondition = null;
    }
    return this;
  }

  /**
   * Remove all the conditions and empty the conditionStack, also, nullify the doCheckCondition.
   * @returns {object: JsonBuilder}
   */
  endAllConditions() {
    this.conditionStack = [];
    this.doCheckCondition = null;
    return this;
  }

  /**
   * Map key to value in jsonObj with checking all the conditions in conditionStack.
   * @param {any} key
   * @param {any} value
   * @returns {object: JsonBuilder}
   */
  put(key, value) {
    if (this.doCheckCondition) {
      if (this.conditionStack.every((e) => e === true)) {
        this.jsonObj[key] = value;
      }
      return this;
    }
    this.jsonObj[key] = value;
    return this;
  }

  /**
   * If value is not null, it'll Map key to value in jsonObj with checking all the conditions in conditionStack.
   * @param {any} key
   * @param {any} value
   * @returns {object: JsonBuilder}
   */
  putIfNotNull(key, value) {
    this.checkIfNull(value);
    this.put(key, value);
    this.endCondition();
    return this;
  }

  /**
   * If value is neither null nor empty, it'll Map key to value in jsonObj with checking all the conditions in conditionStack.
   * @param {any} key
   * @param {any} value
   * @returns {object: JsonBuilder}
   */
  putIfNotNullOrEmpty(key, value) {
    this.checkIfNullOrEmpty(value);
    this.put(key, value);
    this.endCondition();
    return this;
  }

  /**
   * It'll set registeredObj to get all the upcoming fields to map from this registeredObj object to jsonObj.
   * @param {object} obj
   * @returns {object: JsonBuilder}
   */
  registerObj(obj) {
    this.registeredObj = obj;
    return this;
  }

  /**
   * It'll set the jsonObj like... => jsonObj[key] = registeredObj[refObj]
   * @param {any} refObj
   * @param {any} key
   * @returns {object: JsonBuilder}
   */
  putFromRegObj(refObj, key = refObj) {
    if (this.doCheckCondition) {
      if (this.conditionStack.slice(-1)[0]) {
        this.jsonObj[key] = this.registeredObj[refObj];
      }
      return this;
    }
    this.jsonObj[key] = this.registeredObj[refObj] || undefined;
    return this;
  }

  /**
   * It'll set null to registeredObj which means, deregister the object.
   * @returns {object: JsonBuilder}
   */
  deregisterObj() {
    this.registeredObj = null;
    return this;
  }

  /**
   * returns the jsonObj we're manipulating by all the methods so far.
   * @returns {object: JsonBuilder}
   */
  getJson() {
    return this.jsonObj;
  }

  /**
   * It returns the stringified JSON based on property, if the property needs to be set to prettify true, then it'll return prettified JSON (with all the new lines and tabs) otherwise it'll return inline JSON.
   * @returns {string} formattedJson
   */
  formatJson() {
    return config.logJsonPrettify === true ? this.prettifyJson() : this.minifyJSON();
  }

  /**
   * It'll return prettified JSON.
   * @returns {object: JsonBuilder}
   */
  prettifyJson() {
    this.jsonObj = JSON.stringify(this.jsonObj, null, '  ');
    return this;
  }

  /**
   * It'll return inline and minified JSON.
   * @returns {object: JsonBuilder}
   */
  minifyJSON() {
    this.jsonObj = JSON.stringify(JSON.parse(JSON.stringify(this.jsonObj)));
    return this;
  }
}

module.exports = JsonBuilder;
