const { default: WasmRegistry } = await import('./wasm-registry.mjs');

async function test() {
  const registry = new WasmRegistry();
  await registry.init();

  console.log('Testing WASM Registry');

  registry.setCurrentTime(Date.now());

  // Register
  console.log(
    'Register service1 instance1: ',
    registry.register('service1', 'instance1', 'localhost', 8080)
  );
  console.log(
    'Register service1 instance2: ',
    registry.register('service1', 'instance2', 'localhost', 8081)
  );
  console.log(
    'Register service2 instance3: ',
    registry.register('service2', 'instance3', 'localhost', 8082)
  );

  // Discover
  console.log('Discover service1: ', registry.discover('service1'));
  console.log('Discover service2: ', registry.discover('service2'));

  // Heartbeat
  console.log('Heartbeat instance1: ', registry.heartbeat('instance1'));

  // Deregister
  console.log('Deregister service1 instance1: ', registry.deregister('service1', 'instance1'));
  console.log('Discover service1 after deregister: ', registry.discover('service1'));

  // Counts
  console.log('Service count: ', registry.getServiceCount());
  console.log('Instance count service1: ', registry.getInstanceCount('service1'));
  console.log('Instance count service2: ', registry.getInstanceCount('service2'));

  // Test cleanup
  registry.setCurrentTime(Date.now() + 60000); // advance time
  registry.cleanup(30000); // timeout 30s
  console.log('After cleanup, service count: ', registry.getServiceCount());
  console.log('After cleanup, instance count service1: ', registry.getInstanceCount('service1'));
  console.log('After cleanup, instance count service2: ', registry.getInstanceCount('service2'));
}

test().catch(console.error);
