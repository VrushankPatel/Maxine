/** Exported memory */
export declare const memory: WebAssembly.Memory;
// Exported runtime interface
export declare function __new(size: number, id: number): number;
export declare function __pin(ptr: number): number;
export declare function __unpin(ptr: number): void;
export declare function __collect(): void;
export declare const __rtti_base: number;
/**
 * src/wasm/registry/setCurrentTime
 * @param time `f64`
 */
export declare function setCurrentTime(time: number): void;
/**
 * src/wasm/registry/register
 * @param serviceName `~lib/string/String`
 * @param instanceId `~lib/string/String`
 * @param address `~lib/string/String`
 * @param port `i32`
 * @returns `bool`
 */
export declare function register(serviceName: string, instanceId: string, address: string, port: number): boolean;
/**
 * src/wasm/registry/discover
 * @param serviceName `~lib/string/String`
 * @returns `~lib/string/String`
 */
export declare function discover(serviceName: string): string;
/**
 * src/wasm/registry/heartbeat
 * @param instanceId `~lib/string/String`
 * @returns `bool`
 */
export declare function heartbeat(instanceId: string): boolean;
/**
 * src/wasm/registry/deregister
 * @param serviceName `~lib/string/String`
 * @param instanceId `~lib/string/String`
 * @returns `bool`
 */
export declare function deregister(serviceName: string, instanceId: string): boolean;
/**
 * src/wasm/registry/cleanup
 * @param timeoutMs `f64`
 */
export declare function cleanup(timeoutMs: number): void;
/**
 * src/wasm/registry/getServiceCount
 * @returns `i32`
 */
export declare function getServiceCount(): number;
/**
 * src/wasm/registry/getInstanceCount
 * @param serviceName `~lib/string/String`
 * @returns `i32`
 */
export declare function getInstanceCount(serviceName: string): number;
