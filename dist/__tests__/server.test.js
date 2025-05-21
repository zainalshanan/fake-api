// import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
export {};
// vi.mock('fs', () => ({
//   default: {
//     readdirSync: vi.fn(),
//     readFileSync: vi.fn(),
//     promises: {
//       writeFile: vi.fn(),
//     },
//     existsSync: vi.fn().mockReturnValue(true),
//   },
//   readdirSync: vi.fn(),
//   readFileSync: vi.fn(),
//   existsSync: vi.fn().mockReturnValue(true),
//   promises: {
//     writeFile: vi.fn(),
//   },
// }));
// // Fix express mock before importing it
// vi.mock('express', () => {
//   const mockApp = { 
//     use: vi.fn(), 
//     listen: vi.fn() 
//   };
//   const expressFn = vi.fn(() => mockApp);
//   expressFn.json = vi.fn().mockReturnValue(() => {});
//   expressFn.urlencoded = vi.fn().mockReturnValue(() => {});
//   return {
//     default: expressFn
//   };
// });
// import express from 'express';
// import * as fs from 'fs';
// import path from 'path';
// import { Server, Database } from '../src/server.js';
// import SwaggerParser from '@apidevtools/swagger-parser';
// import * as OpenApiValidator from 'express-openapi-validator';
// // Mock dependencies
// vi.mock('@apidevtools/swagger-parser');
// vi.mock('express-openapi-validator');
// vi.mock('path', () => ({
//   join: vi.fn().mockImplementation((...args) => args.join('/')),
//   resolve: vi.fn().mockImplementation((...args) => args.join('/')),
//   basename: vi.fn().mockImplementation((filePath, ext) => {
//     const parts = filePath.split('/');
//     const filename = parts[parts.length - 1];
//     return ext ? filename.replace(ext, '') : filename;
//   }),
//   extname: vi.fn().mockReturnValue('.yaml')
// }));
// describe('Database', () => {
//   let db: Database;
//   const mockDbPath = '/mock/db.json';
//   const mockData = {
//     users: [
//       { id: '1', name: 'User 1' },
//       { id: '2', name: 'User 2' }
//     ],
//     products: [
//       { id: '1', name: 'Product 1' },
//       { id: '2', name: 'Product 2' }
//     ]
//   };
//   beforeEach(() => {
//     vi.clearAllMocks();
//     (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockData));
//     // Create database instance
//     db = new Database(mockDbPath);
//   });
//   afterEach(() => {
//     vi.restoreAllMocks();
//   });
//   describe('get', () => {
//     it('should return data for existing path', async () => {
//       const result = await db.get('/users');
//       expect(result).toEqual(mockData.users);
//     });
//     it('should return data for path with ID', async () => {
//       const result = await db.get('/users/1');
//       expect(result).toEqual(mockData.users[0]);
//     });
//     it('should return null for non-existent path', async () => {
//       const result = await db.get('/nonexistent');
//       expect(result).toBeNull();
//     });
//   });
//   describe('create', () => {
//     it('should add data to collection', async () => {
//       const newUser = { id: '3', name: 'User 3' };
//       const result = await db.create('/users', newUser);
//       expect(result).toEqual(newUser);
//       expect(fs.promises.writeFile).toHaveBeenCalledWith(
//         mockDbPath,
//         expect.any(String)
//       );
//     });
//     it('should create collection if it does not exist', async () => {
//       const newItem = { id: '1', name: 'New Item' };
//       await db.create('/newcollection', newItem);
//       expect(fs.promises.writeFile).toHaveBeenCalled();
//     });
//   });
//   describe('update', () => {
//     it('should update existing item', async () => {
//       const updatedUser = { id: '1', name: 'Updated User' };
//       const result = await db.update('/users/1', updatedUser);
//       expect(result).toEqual(updatedUser);
//       expect(fs.promises.writeFile).toHaveBeenCalled();
//     });
//     it('should return null if item does not exist', async () => {
//       const nonExistentUpdate = { id: '999', name: 'Nonexistent' };
//       const result = await db.update('/users/999', nonExistentUpdate);
//       expect(result).toBeNull();
//       expect(fs.promises.writeFile).not.toHaveBeenCalled();
//     });
//   });
//   describe('patch', () => {
//     it('should partially update existing item', async () => {
//       const patchData = { name: 'Patched User' };
//       const result = await db.patch('/users/1', { id: '1', ...patchData });
//       expect(result).toMatchObject(patchData);
//       expect(fs.promises.writeFile).toHaveBeenCalled();
//     });
//     it('should return null if item does not exist', async () => {
//       const patchData = { name: 'Nonexistent Patch' };
//       const result = await db.patch('/users/999', { id: '999', ...patchData });
//       expect(result).toBeNull();
//       expect(fs.promises.writeFile).not.toHaveBeenCalled();
//     });
//   });
//   describe('delete', () => {
//     it('should delete existing item', async () => {
//       await db.delete('/users/1');
//       expect(fs.promises.writeFile).toHaveBeenCalled();
//     });
//     it('should gracefully handle non-existent item', async () => {
//       await db.delete('/users/999');
//       expect(fs.promises.writeFile).not.toHaveBeenCalled();
//     });
//   });
// }); 
//# sourceMappingURL=server.test.js.map