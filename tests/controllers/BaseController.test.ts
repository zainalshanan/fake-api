import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseController } from "../../src/controllers/BaseController.js";
import type { Request, Response } from "express";
import db from "../../src/db.js";

// Mock the db module
vi.mock("../../src/db.js", () => ({
  default: {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// A concrete implementation of BaseController for testing
interface TestResource {
  id: string;
  name: string;
  value?: number;
}

class TestController extends BaseController<TestResource> {
  resourceKey = "tests";

  // Expose protected methods for testing if needed, or test through public methods
  protected beforeList?(req: Request): Promise<void> {
    return super.beforeList ? super.beforeList(req) : Promise.resolve();
  }
  protected afterList?(items: TestResource[]): Promise<TestResource[]> {
    return super.afterList ? super.afterList(items) : Promise.resolve(items);
  }
  protected beforeGet?(req: Request, id: string): Promise<void> {
    return super.beforeGet ? super.beforeGet(req, id) : Promise.resolve();
  }
  protected afterGet?(item: TestResource, req: Request): Promise<TestResource> {
    return super.afterGet ? super.afterGet(item, req) : Promise.resolve(item);
  }
  protected beforeCreate?(
    req: Request,
    data: Partial<TestResource>
  ): Promise<Partial<TestResource>> {
    return super.beforeCreate
      ? super.beforeCreate(req, data)
      : Promise.resolve(data);
  }
  protected afterCreate?(
    item: TestResource,
    req: Request
  ): Promise<TestResource> {
    return super.afterCreate
      ? super.afterCreate(item, req)
      : Promise.resolve(item);
  }
  protected beforeDelete?(req: Request, id: string): Promise<void> {
    return super.beforeDelete ? super.beforeDelete(req, id) : Promise.resolve();
  }
  protected afterDelete?(
    deletedItem: TestResource,
    req: Request
  ): Promise<void> {
    return super.afterDelete
      ? super.afterDelete(deletedItem, req)
      : Promise.resolve();
  }
}

describe("BaseController", () => {
  let controller: TestController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: any;
  let responseStatus: number;

  beforeEach(() => {
    controller = new TestController();
    responseJson = undefined;
    responseStatus = 0;

    mockRequest = {
      params: {},
      query: {},
      body: {},
    };
    mockResponse = {
      json: vi.fn((data: any) => {
        responseJson = data;
        return mockResponse as Response;
      }),
      status: vi.fn((status: number) => {
        responseStatus = status;
        return mockResponse as Response;
      }),
      send: vi.fn(() => mockResponse as Response),
    };
    vi.clearAllMocks(); // Clear mocks before each test
  });

  describe("list", () => {
    it("should return a list of resources", async () => {
      const mockData: TestResource[] = [{ id: "1", name: "Test1" }];
      (db.get as any).mockResolvedValue(mockData);

      await controller.list(mockRequest as Request, mockResponse as Response);

      expect(db.get).toHaveBeenCalledWith("tests");
      expect(mockResponse.json).toHaveBeenCalledWith(mockData);
      expect(responseStatus).toBe(0); // No status should be set on success other than 200 (default)
    });

    it("should return an empty array if no resources found", async () => {
      (db.get as any).mockResolvedValue(null);
      await controller.list(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.json).toHaveBeenCalledWith([]);
    });

    it("should call beforeList and afterList hooks", async () => {
      const mockData: TestResource[] = [{ id: "1", name: "Test1" }];
      (db.get as any).mockResolvedValue(mockData);

      const beforeListSpy = vi
        .spyOn(controller as any, "beforeList")
        .mockResolvedValue(Promise.resolve());
      const afterListSpy = vi
        .spyOn(controller as any, "afterList")
        .mockImplementation((async (items: TestResource[]) =>
          items.map((item) => ({
            ...item,
            name: item.name + "_hooked",
          }))) as any);

      await controller.list(mockRequest as Request, mockResponse as Response);

      expect(beforeListSpy).toHaveBeenCalledWith(mockRequest);
      expect(afterListSpy).toHaveBeenCalledWith(mockData);
      expect(responseJson[0].name).toBe("Test1_hooked");
    });

    it("should handle errors during list", async () => {
      (db.get as any).mockRejectedValue(new Error("DB error"));
      await controller.list(mockRequest as Request, mockResponse as Response);
      expect(responseStatus).toBe(500);
      expect(responseJson).toEqual({ error: "Internal error" });
    });
  });

  describe("get", () => {
    it("should return a single resource by id", async () => {
      const mockItem: TestResource = { id: "1", name: "Test1" };
      mockRequest.params = { id: "1" };
      (db.get as any).mockResolvedValue(mockItem);

      await controller.get(mockRequest as Request, mockResponse as Response);

      expect(db.get).toHaveBeenCalledWith("tests/1");
      expect(mockResponse.json).toHaveBeenCalledWith(mockItem);
    });

    it("should return 404 if resource not found", async () => {
      mockRequest.params = { id: "1" };
      (db.get as any).mockResolvedValue(null);
      await controller.get(mockRequest as Request, mockResponse as Response);
      expect(responseStatus).toBe(404);
      expect(responseJson).toEqual({ error: "Not found" });
    });

    it("should call beforeGet and afterGet hooks", async () => {
      const mockItem: TestResource = { id: "1", name: "Test1" };
      mockRequest.params = { id: "1" };
      (db.get as any).mockResolvedValue(mockItem);

      const beforeGetSpy = vi
        .spyOn(controller as any, "beforeGet")
        .mockResolvedValue(Promise.resolve());
      const afterGetSpy = vi
        .spyOn(controller as any, "afterGet")
        .mockImplementation((async (item: TestResource, _req: Request) => ({
          ...item,
          name: item.name + "_hooked",
        })) as any);

      await controller.get(mockRequest as Request, mockResponse as Response);

      expect(beforeGetSpy).toHaveBeenCalledWith(mockRequest, "1");
      expect(afterGetSpy).toHaveBeenCalledWith(mockItem, mockRequest);
      expect(responseJson.name).toBe("Test1_hooked");
    });
  });

  describe("create", () => {
    it("should create a resource", async () => {
      const newItem: TestResource = { id: "generated-id", name: "New Item" };
      const inputData = { name: "New Item" };
      mockRequest.body = inputData;
      (db.create as any).mockResolvedValue(newItem); // Mock db.create behavior

      await controller.create(mockRequest as Request, mockResponse as Response);

      expect(db.create).toHaveBeenCalledWith("tests", inputData);
      expect(responseStatus).toBe(201);
      expect(responseJson).toEqual(newItem);
    });

    it("should call beforeCreate and afterCreate hooks", async () => {
      const finalItem: TestResource = {
        id: "final-id",
        name: "Created Hooked Item",
      };
      const initialItem = { name: "Initial Item" } as Partial<TestResource>;
      const createdItemFromDb = {
        id: "created-id",
        name: "Created Item",
      } as TestResource;
      mockRequest.body = { name: "Raw Item" } as Partial<TestResource>;

      (db.create as any).mockResolvedValue(createdItemFromDb);

      const beforeCreateSpy = vi
        .spyOn(controller as any, "beforeCreate")
        .mockImplementation((async (
          _req: Request,
          data: Partial<TestResource>
        ) => ({
          ...data,
          name: initialItem.name,
        })) as any);
      const afterCreateSpy = vi
        .spyOn(controller as any, "afterCreate")
        .mockImplementation(
          (async (_item: TestResource, _req: Request) => finalItem) as any
        );

      await controller.create(mockRequest as Request, mockResponse as Response);

      expect(beforeCreateSpy).toHaveBeenCalledWith(
        mockRequest,
        mockRequest.body
      );
      expect(db.create).toHaveBeenCalledWith("tests", {
        name: initialItem.name,
      });
      expect(afterCreateSpy).toHaveBeenCalledWith(
        createdItemFromDb,
        mockRequest
      );
      expect(responseJson).toEqual(finalItem);
      expect(responseStatus).toBe(201);
    });
  });

  describe("update", () => {
    it("should update a resource", async () => {
      const updatedItem: TestResource = { id: "1", name: "Updated Item" };
      mockRequest.params = { id: "1" };
      mockRequest.body = { name: "Updated Item" } as Partial<TestResource>;
      (db.get as any).mockResolvedValue({
        id: "1",
        name: "Original Item",
      } as TestResource); // For existence check
      (db.update as any).mockResolvedValue(updatedItem);

      await controller.update(mockRequest as Request, mockResponse as Response);

      expect(db.update).toHaveBeenCalledWith("tests/1", {
        name: "Updated Item",
      });
      expect(mockResponse.json).toHaveBeenCalledWith(updatedItem);
    });

    it("should return 404 if resource to update not found", async () => {
      mockRequest.params = { id: "non-existent" };
      mockRequest.body = { name: "Updated Item" };
      (db.get as any).mockResolvedValue(null); // Mock item not found

      await controller.update(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toBe(404);
      expect(responseJson).toEqual({ error: "Not found" });
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe("patch", () => {
    it("should patch a resource", async () => {
      const patchedItem: TestResource = {
        id: "1",
        name: "Patched Item",
        value: 100,
      };
      mockRequest.params = { id: "1" };
      mockRequest.body = {
        name: "Patched Item",
        value: 100,
      } as Partial<TestResource>;
      (db.get as any).mockResolvedValue({
        id: "1",
        name: "Original Item",
      } as TestResource);
      (db.patch as any).mockResolvedValue(patchedItem);

      await controller.patch(mockRequest as Request, mockResponse as Response);

      expect(db.patch).toHaveBeenCalledWith("tests/1", {
        name: "Patched Item",
        value: 100,
      });
      expect(mockResponse.json).toHaveBeenCalledWith(patchedItem);
    });

    it("should return 404 if resource to patch not found", async () => {
      mockRequest.params = { id: "non-existent" };
      mockRequest.body = { name: "Patched Item" };
      (db.get as any).mockResolvedValue(null);

      await controller.patch(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toBe(404);
      expect(responseJson).toEqual({ error: "Not found" });
      expect(db.patch).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("should delete a resource", async () => {
      mockRequest.params = { id: "1" };
      (db.get as any).mockResolvedValue({
        id: "1",
        name: "Item to delete",
      } as TestResource); // Mock item exists
      (db.delete as any).mockResolvedValue(undefined);

      await controller.delete(mockRequest as Request, mockResponse as Response);

      expect(db.delete).toHaveBeenCalledWith("tests/1");
      expect(responseStatus).toBe(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it("should return 404 if resource to delete not found", async () => {
      mockRequest.params = { id: "non-existent" };
      (db.get as any).mockResolvedValue(null);

      await controller.delete(mockRequest as Request, mockResponse as Response);

      expect(responseStatus).toBe(404);
      expect(responseJson).toEqual({ error: "Not found" });
      expect(db.delete).not.toHaveBeenCalled();
    });

    it("should call beforeDelete and afterDelete hooks", async () => {
      const itemToDelete: TestResource = { id: "1", name: "Delete Me" };
      mockRequest.params = { id: "1" };
      (db.get as any).mockResolvedValue(itemToDelete);
      (db.delete as any).mockResolvedValue(undefined);

      const beforeDeleteSpy = vi
        .spyOn(controller as any, "beforeDelete")
        .mockResolvedValue(Promise.resolve());
      const afterDeleteSpy = vi
        .spyOn(controller as any, "afterDelete")
        .mockResolvedValue(Promise.resolve() as any);

      await controller.delete(mockRequest as Request, mockResponse as Response);

      expect(beforeDeleteSpy).toHaveBeenCalledWith(mockRequest, "1");
      expect(db.delete).toHaveBeenCalledWith("tests/1");
      expect(afterDeleteSpy).toHaveBeenCalledWith(itemToDelete, mockRequest);
      expect(responseStatus).toBe(204);
    });
  });
});
