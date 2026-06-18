export interface ICacheService {
  set(key: string, value: string, expireInSeconds?: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<boolean>;
}
