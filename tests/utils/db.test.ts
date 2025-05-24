import { describe, it, expect, vi } from "vitest";
import {
  getNestedValue,
  setNestedValue,
  findItemById,
} from "../../src/utils/db.js"; // Adjust path as necessary
import { Logger } from "../../src/utils/logger.js";

// Mock Logger to prevent console output during tests
vi.mock("../../src/utils/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("DB Utilities", () => {
  describe("getNestedValue", () => {
    const data = {
      users: [
        { id: "1", name: "Alice", details: { age: 30 } },
        { id: "2", name: "Bob", details: { age: 25 } },
      ],
      settings: {
        theme: "dark",
        notifications: {
          email: true,
          sms: false,
        },
      },
      emptyArray: [],
      nullValue: null,
    };

    it("should retrieve top-level properties", () => {
      expect(getNestedValue(data, "settings")).toEqual(data.settings);
    });

    it("should retrieve nested properties", () => {
      expect(getNestedValue(data, "settings/theme")).toBe("dark");
      expect(getNestedValue(data, "settings/notifications/email")).toBe(true);
    });

    it("should retrieve items from an array by id string", () => {
      expect(getNestedValue(data, "users/1")).toEqual(data.users[0]);
      expect(getNestedValue(data, "users/2/name")).toBe("Bob");
    });

    it("should retrieve nested properties within an array item", () => {
      expect(getNestedValue(data, "users/1/details")).toEqual({ age: 30 });
      expect(getNestedValue(data, "users/1/details/age")).toBe(30);
    });

    it("should return null for non-existent paths", () => {
      expect(getNestedValue(data, "nonexistent")).toBeNull();
      expect(getNestedValue(data, "settings/nonexistent")).toBeNull();
      expect(getNestedValue(data, "users/3")).toBeNull(); // ID not found
      expect(getNestedValue(data, "users/1/nonexistent")).toBeNull();
    });

    it("should return null if path goes through a null value", () => {
      expect(getNestedValue(data, "nullValue/someProperty")).toBeNull();
    });

    it("should return the array if path points to an empty array", () => {
      expect(getNestedValue(data, "emptyArray")).toEqual([]);
    });

    it("should return null when trying to access property of a non-object in path", () => {
      expect(getNestedValue(data, "settings/theme/nonexistent")).toBeNull();
    });

    it("should handle paths with leading/trailing/multiple slashes", () => {
      expect(getNestedValue(data, "/users/1/")).toEqual(data.users[0]);
      expect(getNestedValue(data, "settings//theme")).toBe("dark"); // Treats as single slash
    });
  });

  describe("setNestedValue", () => {
    let data: any;

    beforeEach(() => {
      data = {
        users: [{ id: "1", name: "Alice" }],
        settings: { theme: "light" },
      };
    });

    it("should set a new top-level property (as an array with the value)", () => {
      const value = { newProp: "newValue" };
      setNestedValue(data, "newCollection", value);
      expect(data.newCollection).toEqual([value]);
    });

    it("should append to an existing array at a top-level path", () => {
      const newUser = { id: "2", name: "Bob" };
      setNestedValue(data, "users", newUser);
      expect(data.users).toEqual([{ id: "1", name: "Alice" }, newUser]);
    });

    it("should set a nested property, creating intermediate objects if they dont exist", () => {
      const newPreference = { color: "blue" };
      setNestedValue(data, "preferences/ui", newPreference);
      expect(data.preferences.ui).toEqual([newPreference]);
    });

    it("should overwrite a non-array property with a new array containing the value", () => {
      const themeUpdate = { new: "val" };
      setNestedValue(data, "settings/theme", themeUpdate); // settings.theme was 'light'
      expect(data.settings.theme).toEqual([themeUpdate]); // Now it's an array with the new value
    });

    it("should create nested path and set value as array item", () => {
      const deepValue = { nested: true };
      setNestedValue(data, "a/b/c", deepValue);
      expect(data.a.b.c).toEqual([deepValue]);
    });

    it("should correctly append if the target is an array", () => {
      data.items = [{ id: "x" }];
      const newItem = { id: "y" };
      setNestedValue(data, "items", newItem);
      expect(data.items).toEqual([{ id: "x" }, { id: "y" }]);
    });
  });

  describe("findItemById", () => {
    const data = {
      users: [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ],
      products: [
        { id: "a", name: "Apple" },
        { id: "b", name: "Banana" },
      ],
      emptyCollection: [],
      nonCollection: { name: "config" },
    };

    it("should find an item in a collection and return [collection, index]", () => {
      const [collection, index] = findItemById(data, "users/1", "1");
      expect(collection).toBe(data.users);
      expect(index).toBe(0);
      expect(collection?.[index]).toEqual({ id: "1", name: "Alice" });

      const [collection2, index2] = findItemById(data, "products/b", "b");
      expect(collection2).toBe(data.products);
      expect(index2).toBe(1);
      expect(collection2?.[index2]).toEqual({ id: "b", name: "Banana" });
    });

    it("should return [collection, -1] if item not found in collection", () => {
      const [collection, index] = findItemById(data, "users/3", "3");
      expect(collection).toBe(data.users);
      expect(index).toBe(-1);
    });

    it("should return [null, -1] if collection path is invalid or does not point to an array", () => {
      const [collection1, index1] = findItemById(data, "nonexistent/1", "1");
      expect(collection1).toBeNull();
      expect(index1).toBe(-1);

      const [collection2, index2] = findItemById(data, "nonCollection/x", "x");
      expect(collection2).toBeNull();
      expect(index2).toBe(-1);
    });

    it("should return [collection, -1] for existing empty collection if item not found", () => {
      const [collection, index] = findItemById(data, "emptyCollection/1", "1");
      expect(collection).toBe(data.emptyCollection);
      expect(index).toBe(-1);
    });

    it("should return [null, -1] if path has less than 2 segments (no collection and id)", () => {
      const [collection, index] = findItemById(data, "users", "1");
      expect(collection).toBeNull();
      expect(index).toBe(-1);
    });

    it("should correctly use the id parameter for searching, not the id in path string", () => {
      // Path is users/somePlaceholder, but we search for id '2'
      const [collection, index] = findItemById(
        data,
        "users/somePlaceholder",
        "2"
      );
      expect(collection).toBe(data.users);
      expect(index).toBe(1);
      expect(collection?.[index]).toEqual({ id: "2", name: "Bob" });
    });
  });
});
