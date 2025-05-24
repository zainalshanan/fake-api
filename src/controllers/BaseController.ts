import type { Request, Response } from "express"; // Type-only import
import db from "../db.js"; // Added .js extension
import { Logger } from "../utils/logger.js";

export abstract class BaseController<T extends { id?: string | number }> {
  abstract resourceKey: string;
  protected dbPrefix: string;

  constructor(dbPrefix = "") {
    this.dbPrefix = dbPrefix;
  }

  // Helper to get ID field (simplified, assumes 'id' for now, can be overridden)
  protected getIdField(): string {
    return "id";
  }

  private fullKey(key: string) {
    return this.dbPrefix ? `${this.dbPrefix}/${key}` : key;
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      if (this.beforeList) await this.beforeList(req);
      const data = await db.get(this.fullKey(this.resourceKey));
      if (this.afterList) {
        const modifiedData = await this.afterList(data || []);
        res.json(modifiedData);
        return;
      }
      res.json(data || []);
    } catch (err: any) {
      Logger.error(
        err.message || `Internal error in list for ${this.resourceKey}`
      );
      res.status(500).json({ error: "Internal error" });
    }
  }

  async get(req: Request, res: Response): Promise<Response | void> {
    try {
      const idValue = req.params.id;
      if (this.beforeGet) await this.beforeGet(req, idValue);

      let item = await db.get(this.fullKey(`${this.resourceKey}/${idValue}`)); // Assumes db.get can handle /id path

      if (!item) return res.status(404).json({ error: "Not found" });

      if (this.afterGet) item = await this.afterGet(item, req);
      res.json(item);
    } catch (err: any) {
      Logger.error(
        err.message || `Internal error in get for ${this.resourceKey}`
      );
      res.status(500).json({ error: "Internal error" });
    }
  }

  async create(req: Request, res: Response): Promise<Response | void> {
    try {
      let dataToCreate = req.body;
      if (this.beforeCreate)
        dataToCreate = await this.beforeCreate(req, dataToCreate);

      const newItem = await db.create(
        this.fullKey(this.resourceKey),
        dataToCreate
      );

      let finalItem = newItem;
      if (this.afterCreate) finalItem = await this.afterCreate(finalItem, req);

      res.status(201).json(finalItem);
    } catch (err: any) {
      Logger.error(
        err.message || `Internal error in create for ${this.resourceKey}`
      );
      res.status(500).json({ error: "Internal server error" });
    }
  }

  async update(req: Request, res: Response): Promise<Response | void> {
    try {
      const idValue = req.params.id;
      let dataToUpdate = req.body;

      if (this.beforeUpdate)
        dataToUpdate = await this.beforeUpdate(req, idValue, dataToUpdate);

      const existingItem = await db.get(
        this.fullKey(`${this.resourceKey}/${idValue}`)
      );
      if (!existingItem) {
        return res.status(404).json({ error: "Not found" });
      }

      const updatedItem = await db.update(
        this.fullKey(`${this.resourceKey}/${idValue}`),
        dataToUpdate
      );

      let finalItem = updatedItem;
      if (this.afterUpdate) finalItem = await this.afterUpdate(finalItem, req);

      res.json(finalItem);
    } catch (err: any) {
      Logger.error(
        err.message || `Internal error in update for ${this.resourceKey}`
      );
      res.status(500).json({ error: "Internal server error" });
    }
  }

  async patch(req: Request, res: Response): Promise<Response | void> {
    try {
      const idValue = req.params.id;
      let dataToPatch = req.body;

      if (this.beforePatch)
        dataToPatch = await this.beforePatch(req, idValue, dataToPatch);

      const existingItem = await db.get(
        this.fullKey(`${this.resourceKey}/${idValue}`)
      );
      if (!existingItem) {
        return res.status(404).json({ error: "Not found" });
      }

      const patchedItem = await db.patch(
        this.fullKey(`${this.resourceKey}/${idValue}`),
        dataToPatch
      );

      let finalItem = patchedItem;
      if (this.afterPatch) finalItem = await this.afterPatch(finalItem, req);

      res.json(finalItem);
    } catch (err: any) {
      Logger.error(
        err.message || `Internal error in patch for ${this.resourceKey}`
      );
      res.status(500).json({ error: "Internal server error" });
    }
  }

  async delete(req: Request, res: Response): Promise<Response | void> {
    try {
      const idValue = req.params.id;
      if (this.beforeDelete) await this.beforeDelete(req, idValue);

      const existingItem = await db.get(
        this.fullKey(`${this.resourceKey}/${idValue}`)
      );
      if (!existingItem) {
        return res.status(404).json({ error: "Not found" });
      }

      await db.delete(this.fullKey(`${this.resourceKey}/${idValue}`));

      if (this.afterDelete) await this.afterDelete(existingItem, req); // Pass original item to hook

      res.status(204).send();
    } catch (err: any) {
      Logger.error(
        err.message || `Internal error in delete for ${this.resourceKey}`
      );
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Optional hooks
  protected beforeList?(req: Request): Promise<void>;
  protected afterList?(items: T[]): Promise<T[]>; // New hook for list

  protected beforeGet?(req: Request, id: string): Promise<void>; // Added id
  protected afterGet?(item: T, req: Request): Promise<T>; // Added req

  protected beforeCreate?(req: Request, data: Partial<T>): Promise<Partial<T>>; // data can be partial
  protected afterCreate?(item: T, req: Request): Promise<T>;

  protected beforeUpdate?(
    req: Request,
    id: string,
    data: Partial<T>
  ): Promise<Partial<T>>;
  protected afterUpdate?(item: T, req: Request): Promise<T>;

  protected beforePatch?(
    req: Request,
    id: string,
    data: Partial<T>
  ): Promise<Partial<T>>;
  protected afterPatch?(item: T, req: Request): Promise<T>;

  protected beforeDelete?(req: Request, id: string): Promise<void>;
  protected afterDelete?(deletedItem: T, req: Request): Promise<void>; // Pass deleted item
}

/**
 * ## BaseController Usage
 *
 * This abstract class provides a base for CRUD operations on a resource.
 *
 * ### 1. Define your Resource Key
 * Each controller must define `resourceKey`, which is the top-level key in your `db.json`
 * (e.g., "users", "posts"). This key should typically be the plural form of your resource.
 *
 * ### 2. Define your Resource Type (Optional but Recommended)
 * Define an interface or type for your resource (e.g., `User`, `Post`) and use it
 * when extending `BaseController<YourResourceType>`.
 *
 * ### 3. Extend BaseController
 * Create a new controller class that extends `BaseController<YourResourceType>`.
 *
 * ```typescript
 * import { BaseController } from './BaseController.js'; // Ensure .js for NodeNext modules
 * import type { Request, Response } from 'express'; // For custom methods or complex hooks
 * // Assume User type is defined in ../interfaces/User.ts
 * // import type { User } from '../interfaces/User';
 *
 * // Using 'any' if specific type is not readily available or for simplicity
 * export class UsersController extends BaseController<any> {
 *   resourceKey = "users"; // Plural form
 *
 *   // Optional: Implement hooks for custom logic
 *   protected async afterGet(item: any, req: Request): Promise<any> {
 *     // Example: Censor email before sending response
 *     // Ensure item has email property before trying to delete it
 *     if (item && typeof item === 'object' && 'email' in item) {
 *       const { email, ...rest } = item;
 *       return rest;
 *     }
 *     return item;
 *   }
 *
 *   // You can add completely custom methods as well
 *   async specialOperation(req: Request, res: Response): Promise<void> {
 *     // Custom logic for this controller
 *     res.json({ message: `Special operation for ${this.resourceKey}` });
 *   }
 * }
 * ```
 *
 * ### 4. Register in Routes
 * Instantiate your controller and bind its methods to your Express routes.
 *
 * ```typescript
 * import express from 'express';
 * import { UsersController } from '../controllers/generated/spec/UsersController.js'; // Adjust path
 *
 * const router = express.Router();
 * const usersController = new UsersController();
 *
 * router.get('/users', usersController.list.bind(usersController));
 * router.post('/users', usersController.create.bind(usersController));
 * router.get('/users/:id', usersController.get.bind(usersController));
 * router.put('/users/:id', usersController.update.bind(usersController));
 * router.patch('/users/:id', usersController.patch.bind(usersController));
 * router.delete('/users/:id', usersController.delete.bind(usersController));
 *
 * // Route for custom method
 * router.get('/users/special', usersController.specialOperation.bind(usersController));
 *
 * export default router;
 * ```
 *
 * ### Available CRUD Methods (from BaseController)
 * - `list(req, res)`
 * - `get(req, res)`
 * - `create(req, res)`
 * - `update(req, res)`
 * - `patch(req, res)`
 * - `delete(req, res)`
 *
 * ### Available Hooks (Optional - Override in your subclass)
 * Modify data or perform actions before/after base operations.
 * - `beforeList(req)`
 * - `afterList(items)`
 * - `beforeGet(req, id)`
 * - `afterGet(item, req)`
 * - `beforeCreate(req, data)`
 * - `afterCreate(createdItem, req)`
 * - `beforeUpdate(req, id, data)`
 * - `afterUpdate(updatedItem, req)`
 * - `beforePatch(req, id, data)`
 * - `afterPatch(patchedItem, req)`
 * - `beforeDelete(req, id)`
 * - `afterDelete(deletedItem, req)`
 */
