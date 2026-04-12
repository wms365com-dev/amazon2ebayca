import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const cacheDir = path.join(process.cwd(), "data", "cache");

async function ensureCacheDir() {
  await fs.mkdir(cacheDir, { recursive: true });
}

function buildPath(key: string) {
  const safeName = crypto.createHash("sha1").update(key).digest("hex");
  return path.join(cacheDir, `${safeName}.json`);
}

export async function readCache<T>(key: string, ttlMs: number): Promise<T | null> {
  await ensureCacheDir();
  const filePath = buildPath(key);

  try {
    const stats = await fs.stat(filePath);
    if (Date.now() - stats.mtimeMs > ttlMs) {
      return null;
    }

    const payload = await fs.readFile(filePath, "utf8");
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, payload: T) {
  await ensureCacheDir();
  await fs.writeFile(buildPath(key), JSON.stringify(payload, null, 2), "utf8");
}
