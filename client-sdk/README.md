# Maxine Client SDKs

This directory contains the actively supported SDK work for Maxine.

Current focus:

- Node.js package: `client-sdk/`
- Java HTTP client: `client-sdk/java/maxine-client/`
- Java Spring Boot starter: `client-sdk/java/maxine-spring-boot-starter/`
- Python package: `client-sdk/python/`
- Go module: `client-sdk/go/`

The older multi-language experiments from git history are intentionally not being restored wholesale because many of them targeted endpoints and modes that no longer exist in the current server.

## Node.js

```bash
npm config set @vrushankpatel:registry https://npm.pkg.github.com
npm login --scope=@vrushankpatel --auth-type=legacy --registry=https://npm.pkg.github.com
npm install @vrushankpatel/maxine-client
```

Basic usage:

```js
const { MaxineClient } = require('@vrushankpatel/maxine-client');

async function main() {
  const client = new MaxineClient({ baseUrl: 'http://localhost:8080' });
  await client.signIn('admin', 'admin');

  await client.register({
    hostName: '127.0.0.1',
    nodeName: 'node-a',
    serviceName: 'orders',
    port: 9000,
    ssl: false,
    timeOut: 5,
    weight: 1
  });

  const discovery = await client.discoverLocation('orders', '/health');
  console.log(discovery.location);
}
```

## Java

See `client-sdk/java/README.md` for Maven and usage details.

## Python

```bash
pip install maxine-client
```

```python
from maxine_client import MaxineClient

client = MaxineClient("http://localhost:8080")
client.sign_in("admin", "admin")
```

## Go

```bash
go get github.com/VrushankPatel/Maxine/client-sdk/go@latest
```

See `client-sdk/go/README.md` for usage details.

## Publishing

GitHub Actions now contains manual public release workflows for the publishable
SDK packages:

- `.github/workflows/publish-node-sdk.yml`
- `.github/workflows/publish-java-sdk.yml`
- `.github/workflows/publish-python-sdk.yml`

The GitHub Packages npm registry only supports scoped packages, so the Node SDK
is published as `@vrushankpatel/maxine-client`. Installing it outside GitHub
Actions also requires authenticating to GitHub Packages with a classic personal
access token that includes `read:packages`. The first GitHub Packages publish
creates the package, and GitHub marks npm packages private by default until you
change package visibility in the GitHub UI. The PyPI project is created on
first successful publish or by using a pending trusted publisher. The Go SDK is
distributed through the Git repository and version tags rather than a separate
package registry.
