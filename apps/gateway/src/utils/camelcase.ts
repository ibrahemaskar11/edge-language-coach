/** Recursively convert snake_case keys to camelCase */
export function toCamelCase(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }
  if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      result[camelKey] = toCamelCase(value);
    }
    return result;
  }
  return obj;
}
