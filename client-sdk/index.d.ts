export interface MaxineClientOptions {
  baseUrl: string;
  token?: string | null;
  axiosConfig?: Record<string, unknown>;
}

export interface DiscoveryResponse<T = unknown> {
  status: number;
  location: string | null;
  data: T;
}

export interface HeartbeatOptions {
  intervalMs?: number;
  immediately?: boolean;
  onError?: (error: unknown) => void;
}

export interface HeartbeatHandle<T = unknown> {
  intervalMs: number;
  stop(): void;
  tick(): Promise<T | null>;
}

export declare class MaxineClient {
  constructor(options: string | MaxineClientOptions);
  setAccessToken(token?: string | null): void;
  signIn(userName: string, password: string): Promise<string>;
  changePassword(password: string, newPassword: string): Promise<Record<string, unknown>>;
  register<T = Record<string, unknown>>(serviceData: Record<string, unknown>): Promise<T>;
  discoverLocation<T = unknown>(serviceName: string, endPoint?: string): Promise<DiscoveryResponse<T>>;
  listServers<T = Record<string, unknown>>(): Promise<T>;
  getConfig<T = Record<string, unknown>>(): Promise<T>;
  updateConfig<T = Record<string, unknown>>(configPatch: Record<string, unknown>): Promise<T>;
  listLogFiles<T = Record<string, unknown>>(): Promise<T>;
  getRecentLogs<T = Record<string, unknown>>(): Promise<T>;
  clearRecentLogs(): Promise<number>;
  actuatorHealth<T = Record<string, unknown>>(): Promise<T>;
  actuatorInfo<T = Record<string, unknown>>(): Promise<T>;
  actuatorMetrics<T = Record<string, unknown>>(): Promise<T>;
  actuatorPerformance(): Promise<string>;
  startHeartbeat<T = Record<string, unknown>>(serviceData: Record<string, unknown>, options?: HeartbeatOptions): HeartbeatHandle<T>;
}
