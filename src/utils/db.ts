import { Logger } from "./logger.js";

/**
 * Get a value from a nested object using a path string.
 * @param data - The data object to traverse
 * @param path - Path string (e.g., 'users/123')
 * @returns The found value or null
 */
export function getNestedValue(data: any, path: string): any {
  const segments = path.split("/").filter(Boolean);
  let current = data;

  for (const segment of segments) {
    if (current === undefined || current === null) {
      Logger.warn(`[DB] get: path ${path} -> not found at segment ${segment}`);
      return null;
    }
    // If segment is a number, find item by ID
    if (Array.isArray(current) && !isNaN(parseInt(segment))) {
      current = current.find((item) => String(item.id) === String(segment));
    } else {
      current = current[segment];
    }
  }

  Logger.debug(`[DB] get: path ${path} -> ${JSON.stringify(current)}`);
  return current === undefined ? null : current;
}

/**
 * Set a value in a nested object using a path string.
 * @param data - The data object to modify
 * @param path - Path string (e.g., 'users')
 * @param value - The value to set
 * @returns The modified data
 */
export function setNestedValue(data: any, path: string, value: any): any {
  const segments = path.split("/").filter(Boolean);
  let current = data;

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

  current[lastSegment].push(value);
  return value;
}

/**
 * Find an item in a collection by ID.
 * @param data - The data object
 * @param path - Path to the collection
 * @param id - ID to find
 * @returns [collection, index] or [null, -1]
 */
export function findItemById(
  data: any,
  path: string,
  id: string
): [any[] | null, number] {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return [null, -1];

  const collectionPathSegments = segments.slice(0, -1);
  let collection = data;

  for (const segment of collectionPathSegments) {
    if (
      collection[segment] === undefined ||
      !Array.isArray(collection[segment])
    ) {
      return [null, -1]; // Collection not found or not an array
    }
    collection = collection[segment];
  }

  const index = collection.findIndex(
    (item: any) => String(item.id) === String(id)
  );
  return [collection, index];
}
