const Assertion = require('chai').Assertion;
const _ = require('underscore');
const jsonfile = require('jsonfile');

function isJSON(p) {
  let ret;
  try {
    jsonfile.readFileSync(p);
    ret = true;
    return ret;
  }
  catch (e) {
    ret = false;
    return ret;
  }
}
const plugin = function plugin(chai, utils) {
  chai.Assertion.addMethod('jsonFile', function assertion() {
    const self = this;
    const srcPath = utils.flag(self, 'object');
    const isJSONFile = isJSON(srcPath);
    self.assert(isJSONFile === true, 'expect #{this} to be a json file');
    if (isJSONFile) {
      const testJSON = jsonfile.readFileSync(srcPath);
      utils.flag(self, 'jsonFile', testJSON);
    }
  });

  chai.Assertion.addMethod('jsonObj', function assertion(srcObj) {
    const self = this;
    const srcPath = utils.flag(self, 'object');
    const testJSON = utils.flag(self, 'jsonFile');

    self.assert(_.isEqual(testJSON, srcObj), `Expect JSON obj in ${srcPath} to be eql to: ${JSON.stringify(srcObj)}`);
  });

  chai.Assertion.addMethod('jsonWithProps', function assertion(srcObj) {
    const self = this;
    const srcPath = utils.flag(self, 'object');
    const testJSON = jsonfile.readFileSync(srcPath);
    self.assert(_.findWhere(testJSON, srcObj), `Expect some obj in ${srcPath} to contain: ${JSON.stringify(srcObj)}`);
  });
};

module.exports = plugin;
