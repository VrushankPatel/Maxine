const chai = require('chai');
const myPlugin = require('../index.js');
const jsonfile = require('jsonfile');

const expect = chai.expect;

const testFile = 'test/test.json';
const jsonObj = jsonfile.readFileSync('test/test.json');

chai.use(myPlugin);

it('Should be pass a jsonfile', () => {
  expect(testFile).to.be.a.jsonFile();
});

it('Should no pass a jsonfile', () => {
  expect('strangepath').to.not.be.a.jsonFile();
});

it('Should pass contain obj', () => {
  expect(testFile).to.be.a.jsonFile().and.not.to.be.jsonObj({
    name:'pepp'  
  });
});
it('Should pass contain obj', () => {
  expect(testFile).to.be.a.jsonFile().and.to.be.jsonObj(jsonObj);
});
it('Should pass contain obj with props', () => {
  expect(testFile).to.be.a.jsonFile().and.contain.jsonWithProps({ repoName: 'giper' });
});

it('Should not pass contain obj with props', () => {
  expect(testFile).to.be.a.jsonFile().and.not.contain.jsonWithProps({ repoName: 'ciccio' });
});
