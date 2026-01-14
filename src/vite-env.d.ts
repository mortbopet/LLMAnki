/// <reference types="vite/client" />

declare module 'sql.js' {
  export interface Database {
    exec(sql: string): QueryExecResult[];
    close(): void;
    getRowsModified(): number;
    run(sql: string, params?: unknown[]): Database;
    prepare(sql: string): Statement;
  }
  
  export interface Statement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    get(): unknown[];
    getAsObject(): Record<string, unknown>;
    free(): void;
    reset(): void;
  }
  
  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }
  
  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }
  
  export interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
  }
  
  function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
  export default initSqlJs;
}
