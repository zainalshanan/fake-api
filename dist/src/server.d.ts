import express from 'express';
import type { Server as HttpServer } from 'http';
export declare class Server {
    app: express.Application;
    private specDir;
    private outDir;
    private port;
    private db;
    constructor(specDir: string, outDir: string, port: number);
    start(): Promise<HttpServer>;
    private setupMiddleware;
    private setupRoutes;
}
export declare class Database {
    private data;
    private dbPath;
    constructor(dbPath: string);
    get(path: string): Promise<any>;
    create(path: string, data: any): Promise<any>;
    update(path: string, data: any): Promise<any>;
    patch(path: string, data: any): Promise<any>;
    delete(path: string): Promise<void>;
    private save;
}
