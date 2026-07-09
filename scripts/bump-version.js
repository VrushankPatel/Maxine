const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
if (!newVersion) {
    console.error("Usage: node scripts/bump-version.js <new-version>");
    process.exit(1);
}

const rootDir = path.join(__dirname, '..');

// Helper to replace version in JSON
const bumpJson = (filePath, key = 'version') => {
    const fullPath = path.join(rootDir, filePath);
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    content[key] = newVersion;
    fs.writeFileSync(fullPath, JSON.stringify(content, null, 2) + '\n');
    console.log(`Updated version in ${filePath}`);
};

// 1. package.json
bumpJson('package.json');

// 2. client-sdk/package.json
bumpJson('client-sdk/package.json');

// 3. client-sdk/python/pyproject.toml
const pyprojectPath = path.join(rootDir, 'client-sdk/python/pyproject.toml');
let pyprojectContent = fs.readFileSync(pyprojectPath, 'utf8');
pyprojectContent = pyprojectContent.replace(/version\s*=\s*"[^"]+"/, `version = "${newVersion}"`);
fs.writeFileSync(pyprojectPath, pyprojectContent);
console.log('Updated version in client-sdk/python/pyproject.toml');

// 4. Java POMs
const pomPaths = [
    'client-sdk/java/pom.xml',
    'client-sdk/java/maxine-client/pom.xml',
    'client-sdk/java/maxine-spring-boot-starter/pom.xml'
];

pomPaths.forEach((pomPath) => {
    const fullPath = path.join(rootDir, pomPath);
    let pomContent = fs.readFileSync(fullPath, 'utf8');
    
    // Replace parent version or project version
    pomContent = pomContent.replace(
        /<version>[^<]+<\/version>/,
        `<version>${newVersion}</version>`
    );
    // Replace parent version dependency if in submodule
    if (pomPath !== 'client-sdk/java/pom.xml') {
        pomContent = pomContent.replace(
            /<parent>[\s\S]*?<version>[^<]+<\/version>/,
            (match) => match.replace(/<version>[^<]+<\/version>/, `<version>${newVersion}</version>`)
        );
    }
    fs.writeFileSync(fullPath, pomContent);
    console.log(`Updated version in ${pomPath}`);
});

// 5. charts/maxine/Chart.yaml
const chartPath = path.join(rootDir, 'charts/maxine/Chart.yaml');
let chartContent = fs.readFileSync(chartPath, 'utf8');
chartContent = chartContent.replace(/appVersion:\s*"[^"]*"/, `appVersion: "${newVersion}"`);
chartContent = chartContent.replace(/version:\s*\d+\.\d+\.\d+/, `version: ${newVersion}`);
fs.writeFileSync(chartPath, chartContent);
console.log('Updated version in charts/maxine/Chart.yaml');

console.log(`Successfully bumped all projects to version ${newVersion}!`);
