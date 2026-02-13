import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { ThreadRecord } from "./types.js";

// Bridge must be started from claude-slack-bridge/ (same as dotenv convention)
const DATA_FILE = join(process.cwd(), "data", "thread-map.json");

export function load(): Map<string, ThreadRecord> {
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    const obj = JSON.parse(raw) as Record<string, ThreadRecord>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

export function save(records: Map<string, ThreadRecord>): void {
  const obj: Record<string, ThreadRecord> = {};
  for (const [name, record] of records) {
    obj[name] = record;
  }
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2) + "\n");
}
