// server.ts
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAPIV3 } from 'openapi-types';
import SwaggerParser from '@apidevtools/swagger-parser';
import * as OpenApiValidator from 'express-openapi-validator';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
export class Server {
    app;
    specDir;
    outDir;
    port;
    db;
    constructor(specDir, outDir, port) {
        this.app = express();
        this.specDir = specDir;
        this.outDir = outDir;
        this.port = port;
        const dbFile = new JSONFile(path.join(outDir, 'db.json'));
        this.db = new Low(dbFile, {});
    }
    async start() {
        await this.db.read();
        this.setupMiddleware();
        await this.setupRoutes();
        return this.app.listen(this.port, () => {
            console.log(`Server is running on http://localhost:${this.port}`);
        });
    }
    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    }
    async setupRoutes() {
        const specs = fs.readdirSync(this.specDir)
            .filter(file => file.endsWith('.yaml') || file.endsWith('.json'));
        // Use dist/generated in production, generated in dev
        const generatedBase = process.env.NODE_ENV === 'production' ? 'dist/generated' : 'generated';
        for (const spec of specs) {
            const api = await SwaggerParser.parse(path.join(this.specDir, spec));
            const specName = path.basename(spec, path.extname(spec));
            // Patch for OpenAPI 3.1 compatibility: ensure webhooks exists only for 3.1.x
            if (api.openapi && api.openapi.startsWith('3.1') && !('webhooks' in api)) {
                api.webhooks = {};
            }
            // Setup OpenAPI validation
            this.app.use(OpenApiValidator.middleware({
                apiSpec: api,
                validateRequests: true,
                validateResponses: true
            }));
            // Load routes
            const routePath = path.join(generatedBase, specName, 'routes');
            if (fs.existsSync(routePath)) {
                try {
                    const routeModule = await import(`file://${path.resolve(routePath, 'index.js')}`);
                    const router = routeModule.default;
                    this.app.use(`/api/${specName}`, router);
                }
                catch (error) {
                    console.error(`Error loading routes from ${routePath}:`, error);
                }
            }
        }
        // Error handling
        this.app.use((err, req, res, next) => {
            // Format error
            res.status(err.status || 500).json({
                message: err.message,
                errors: err.errors
            });
        });
    }
}
export class Database {
    data;
    dbPath;
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    }
    async get(path) {
        const segments = path.split('/').filter(Boolean);
        let current = this.data;
        for (const segment of segments) {
            if (current === undefined || current === null) {
                return null;
            }
            // If segment is a number, find item by ID
            if (Array.isArray(current) && !isNaN(parseInt(segment))) {
                current = current.find(item => item.id === segment);
            }
            else {
                current = current[segment];
            }
        }
        // If current is undefined after iterating (path not found), return null
        return current === undefined ? null : current;
    }
    async create(path, data) {
        const segments = path.split('/').filter(Boolean);
        let current = this.data;
        for (let i = 0; i < segments.length - 1; i++) {
            const segment = segments[i];
            if (current[segment] === undefined) {
                current[segment] = {};
            }
            current = current[segment];
        }
        const lastSegment = segments[segments.length - 1];
        if (!Array.isArray(current[lastSegment])) {
            current[lastSegment] = [];
        }
        current[lastSegment].push(data);
        await this.save();
        return data;
    }
    async update(path, data) {
        const segments = path.split('/').filter(Boolean);
        if (segments.length < 2) { // Path must be like /collection/id
            return null;
        }
        const itemId = segments[segments.length - 1];
        const collectionPathSegments = segments.slice(0, -1);
        let collection = this.data;
        for (const segment of collectionPathSegments) {
            if (collection[segment] === undefined || !Array.isArray(collection[segment])) {
                return null; // Collection not found or not an array
            }
            collection = collection[segment];
        }
        const index = collection.findIndex((item) => item.id === itemId);
        if (index === -1) {
            return null; // Item not found
        }
        collection[index] = data; // Update the item with the new data object
        await this.save();
        return collection[index];
    }
    async patch(path, data) {
        const segments = path.split('/').filter(Boolean);
        if (segments.length < 2) { // Path must be like /collection/id
            return null;
        }
        const itemId = segments[segments.length - 1];
        const collectionPathSegments = segments.slice(0, -1);
        let collection = this.data;
        for (const segment of collectionPathSegments) {
            if (collection[segment] === undefined || !Array.isArray(collection[segment])) {
                return null; // Collection not found or not an array
            }
            collection = collection[segment];
        }
        // Find item by itemId from the path, not data.id from payload
        const index = collection.findIndex((item) => item.id === itemId);
        if (index === -1) {
            return null; // Item not found
        }
        collection[index] = { ...collection[index], ...data };
        await this.save();
        return collection[index];
    }
    async delete(path) {
        const segments = path.split('/').filter(Boolean);
        if (segments.length < 2) { // Path must be like /collection/id
            return;
        }
        const itemId = segments[segments.length - 1]; // Keep as string
        const collectionPathSegments = segments.slice(0, -1);
        let collection = this.data;
        for (const segment of collectionPathSegments) {
            if (collection[segment] === undefined || !Array.isArray(collection[segment])) {
                return; // Collection not found or not an array
            }
            collection = collection[segment];
        }
        const index = collection.findIndex((item) => item.id === itemId); // Compare string IDs
        if (index !== -1) {
            collection.splice(index, 1);
            await this.save();
        }
    }
    async save() {
        await fs.promises.writeFile(this.dbPath, JSON.stringify(this.data, null, 2));
    }
}
//# sourceMappingURL=server.js.map