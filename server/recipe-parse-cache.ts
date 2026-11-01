import { createHash } from "node:crypto";

// Cache only bounded, validated successful results; coalesce in-flight requests.
// No transcript content in keys/logs. Failed work is immediately retryable.
export function recipeParseCache<T>(now = Date.now) {
  const entries = new Map<string, { expires: number; result: Promise<T> }>();
  return (text: string, load: () => Promise<T>): Promise<T> => {
    for (const [key, entry] of entries) if (entry.expires <= now()) entries.delete(key);
    const key = createHash("sha256").update(text).digest("hex");
    const cached = entries.get(key);
    if (cached) return cached.result;
    if (entries.size >= 20) entries.delete(entries.keys().next().value!);
    const result = load();
    entries.set(key, { expires: now() + 600_000, result });
    void result.catch(() => { if (entries.get(key)?.result === result) entries.delete(key); });
    return result;
  };
}
