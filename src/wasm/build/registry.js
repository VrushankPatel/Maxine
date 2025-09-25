async function instantiate(module, imports = {}) {
  const adaptedImports = {
    env: Object.setPrototypeOf({
      abort(message, fileName, lineNumber, columnNumber) {
        // ~lib/builtins/abort(~lib/string/String | null?, ~lib/string/String | null?, u32?, u32?) => void
        message = __liftString(message >>> 0);
        fileName = __liftString(fileName >>> 0);
        lineNumber = lineNumber >>> 0;
        columnNumber = columnNumber >>> 0;
        (() => {
          // @external.js
          throw Error(`${message} in ${fileName}:${lineNumber}:${columnNumber}`);
        })();
      },
    }, Object.assign(Object.create(globalThis), imports.env || {})),
  };
  const { exports } = await WebAssembly.instantiate(module, adaptedImports);
  const memory = exports.memory || imports.env.memory;
  const adaptedExports = Object.setPrototypeOf({
    register(serviceName, instanceId, address, port) {
      // src/wasm/registry/register(~lib/string/String, ~lib/string/String, ~lib/string/String, i32) => bool
      serviceName = __retain(__lowerString(serviceName) || __notnull());
      instanceId = __retain(__lowerString(instanceId) || __notnull());
      address = __lowerString(address) || __notnull();
      try {
        return exports.register(serviceName, instanceId, address, port) != 0;
      } finally {
        __release(serviceName);
        __release(instanceId);
      }
    },
    discover(serviceName) {
      // src/wasm/registry/discover(~lib/string/String) => ~lib/string/String
      serviceName = __lowerString(serviceName) || __notnull();
      return __liftString(exports.discover(serviceName) >>> 0);
    },
    heartbeat(instanceId) {
      // src/wasm/registry/heartbeat(~lib/string/String) => bool
      instanceId = __lowerString(instanceId) || __notnull();
      return exports.heartbeat(instanceId) != 0;
    },
    deregister(serviceName, instanceId) {
      // src/wasm/registry/deregister(~lib/string/String, ~lib/string/String) => bool
      serviceName = __retain(__lowerString(serviceName) || __notnull());
      instanceId = __lowerString(instanceId) || __notnull();
      try {
        return exports.deregister(serviceName, instanceId) != 0;
      } finally {
        __release(serviceName);
      }
    },
    getInstanceCount(serviceName) {
      // src/wasm/registry/getInstanceCount(~lib/string/String) => i32
      serviceName = __lowerString(serviceName) || __notnull();
      return exports.getInstanceCount(serviceName);
    },
  }, exports);
  function __liftString(pointer) {
    if (!pointer) return null;
    const
      end = pointer + new Uint32Array(memory.buffer)[pointer - 4 >>> 2] >>> 1,
      memoryU16 = new Uint16Array(memory.buffer);
    let
      start = pointer >>> 1,
      string = "";
    while (end - start > 1024) string += String.fromCharCode(...memoryU16.subarray(start, start += 1024));
    return string + String.fromCharCode(...memoryU16.subarray(start, end));
  }
  function __lowerString(value) {
    if (value == null) return 0;
    const
      length = value.length,
      pointer = exports.__new(length << 1, 2) >>> 0,
      memoryU16 = new Uint16Array(memory.buffer);
    for (let i = 0; i < length; ++i) memoryU16[(pointer >>> 1) + i] = value.charCodeAt(i);
    return pointer;
  }
  const refcounts = new Map();
  function __retain(pointer) {
    if (pointer) {
      const refcount = refcounts.get(pointer);
      if (refcount) refcounts.set(pointer, refcount + 1);
      else refcounts.set(exports.__pin(pointer), 1);
    }
    return pointer;
  }
  function __release(pointer) {
    if (pointer) {
      const refcount = refcounts.get(pointer);
      if (refcount === 1) exports.__unpin(pointer), refcounts.delete(pointer);
      else if (refcount) refcounts.set(pointer, refcount - 1);
      else throw Error(`invalid refcount '${refcount}' for reference '${pointer}'`);
    }
  }
  function __notnull() {
    throw TypeError("value must not be null");
  }
  return adaptedExports;
}
export const {
  memory,
  __new,
  __pin,
  __unpin,
  __collect,
  __rtti_base,
  setCurrentTime,
  register,
  discover,
  heartbeat,
  deregister,
  cleanup,
  getServiceCount,
  getInstanceCount,
} = await (async url => instantiate(
  await (async () => {
    const isNodeOrBun = typeof process != "undefined" && process.versions != null && (process.versions.node != null || process.versions.bun != null);
    if (isNodeOrBun) { return globalThis.WebAssembly.compile(await (await import("node:fs/promises")).readFile(url)); }
    else { return await globalThis.WebAssembly.compileStreaming(globalThis.fetch(url)); }
  })(), {
  }
))(new URL("registry.wasm", import.meta.url));
