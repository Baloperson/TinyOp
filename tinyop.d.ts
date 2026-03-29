declare module 'tinyop' {
  export interface StoreConfig {
    idGenerator?: () => string;
    types?: Set<string>;
    defaults?: Record<string, any>;
    spatialGridSize?: number;
    maxQueryCache?: number;
  }

  export interface QueryResult<T = any> {
    all(): T[];
    first(): T | null;
    last(): T | null;
    count(): number;
    ids(): string[];
    limit(n: number): QueryResult<T>;
    offset(n: number): QueryResult<T>;
    sort(field: keyof T | string): QueryResult<T>;
  }

  export interface SpatialView<T = any> extends View<T> {
    recenter(x: number, y: number): void;
  }

  export interface View<T = any> {
    (): T[];
    all(): T[];
    first(): T | null;
    last(): T | null;
    count(): number;
    ids(): string[];
    destroy(): void;
  }

  export const where: {
    eq<T>(k: string, v: T): (item: any) => boolean;
    ne<T>(k: string, v: T): (item: any) => boolean;
    gt<T>(k: string, v: T): (item: any) => boolean;
    gte<T>(k: string, v: T): (item: any) => boolean;
    lt<T>(k: string, v: T): (item: any) => boolean;
    lte<T>(k: string, v: T): (item: any) => boolean;
    in<T>(k: string, a: T[]): (item: any) => boolean;
    contains(k: string, v: string): (item: any) => boolean;
    startsWith(k: string, v: string): (item: any) => boolean;
    endsWith(k: string, v: string): (item: any) => boolean;
    exists(k: string): (item: any) => boolean;
    and(...fs: any[]): (item: any) => boolean;
    or(...fs: any[]): (item: any) => boolean;
  };

  export interface TinyOpStore {
    create<T = any>(type: string, data?: Partial<T>): T;
    createMany<T = any>(type: string, arr: Partial<T>[]): T[];
    update(id: string, changes: Partial<any> | ((item: any) => Partial<any>)): any | null;
    set(id: string, field: string, value: any): any | null;
    increment(id: string, field: string, by?: number): any | null;
    get<T = any>(id: string): T | null;
    getRef(id: string): any | null;
    pick(id: string, fields: string[]): any | null;
    exists(id: string): boolean;
    find<T = any>(type: string, pred?: (item: any) => boolean): QueryResult<T>;
    findOne<T = any>(type: string, pred?: (item: any) => boolean): T | null;
    near<T = any>(type: string, x: number, y: number, r: number, pred?: (item: any) => boolean): QueryResult<T>;
    count(type: string, pred?: (item: any) => boolean): number;
    delete(id: string): any | null;
    deleteMany(ids: string[]): any[];
    upsert(id: string, changes: Partial<any>): any;
    batch: {
      create<T = any>(type: string, arr: Partial<T>[]): T[];
      update(updates: Array<{ id: string; changes: any }>): any[];
      delete(ids: string[]): any[];
    };
    transaction<T>(fn: () => T): T;
    view<T = any>(
      type: string,
      pred?: (item: any) => boolean,
      opts?: { spatial?: boolean; x?: number; y?: number; r?: number; threshold?: number }
    ): View<T> | SpatialView<T>;
    on(event: 'create' | 'update' | 'delete' | 'change' | 'batch', cb: (data: any) => void): () => void;
    once(event: string, cb: (data: any) => void): () => void;
    clear(): number;
    dump(): Record<string, any>;
    stats(): any;
    meta: {
      get(k: string): any;
      set(k: string, v: any): void;
      config(): StoreConfig;
    };
  }

  export function createStore(config?: StoreConfig): TinyOpStore;
  export default createStore;
}
